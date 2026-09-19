/**
 * Web Push, from the specs rather than from a library.
 *
 * Two RFCs do all the work and `node:crypto` has every primitive they need, so there is no dependency
 * here — which matters for something this security-sensitive: the code that encrypts a candidate's
 * notifications is code this repository can read, and the encryption chain is checked against RFC 8291's
 * own published test vector in the unit tests, so "it compiles" is not the standard it is held to.
 *
 * - RFC 8291 (Message Encryption): ECDH P-256 + HKDF-SHA256 + AES-128-GCM, `aes128gcm` framing.
 * - RFC 8292 (VAPID): an ES256 JWT identifying this server to the push service.
 */
import { createCipheriv, createECDH, createHmac, createPrivateKey, createSign, generateKeyPairSync, randomBytes } from "node:crypto";

export interface PushSubscription {
  endpoint: string;
  /** The user agent's P-256 public key, base64url. */
  p256dh: string;
  /** The subscription's shared auth secret, base64url. */
  auth: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

const AES_GCM_TAG = 16;
const RECORD_SIZE = 4096;
/** The largest plaintext that fits one record, after the padding delimiter and the GCM tag. */
export const MAX_PAYLOAD_BYTES = RECORD_SIZE - AES_GCM_TAG - 1 - 86;

export function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}
export function fromB64url(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

/* ------------------------------------------------------------------ VAPID */

/** Generates a VAPID key pair in the form the spec (and every browser) expects: raw P-256 points, base64url. */
export function generateVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" }) as { x: string; y: string; d: string };
  void publicKey;
  return {
    publicKey: b64url(Buffer.concat([Buffer.from([0x04]), fromB64url(jwk.x), fromB64url(jwk.y)])),
    privateKey: jwk.d,
  };
}

/** Rebuilds a signing key from the raw base64url private scalar, deriving the public point from it. */
function vapidSigningKey(keys: VapidKeys) {
  const pub = fromB64url(keys.publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("VAPID public key must be a 65-byte uncompressed P-256 point");
  return createPrivateKey({
    key: { kty: "EC", crv: "P-256", x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)), d: keys.privateKey },
    format: "jwk",
  });
}

/** JOSE wants r||s; Node signs ECDSA as DER, so unwrap the two INTEGERs and left-pad each to 32 bytes. */
function derToJose(der: Buffer): Buffer {
  let i = 2;
  if (der[1] & 0x80) i += der[1] & 0x7f; // long-form length
  const readInt = () => {
    if (der[i++] !== 0x02) throw new Error("Malformed ECDSA signature");
    const len = der[i++];
    const start = i;
    i += len;
    const raw = der.subarray(start, i);
    // DER integers are signed, so a leading zero may have been added; r and s are always 32 bytes here.
    const trimmed = raw.length > 32 ? raw.subarray(raw.length - 32) : raw;
    return Buffer.concat([Buffer.alloc(32 - trimmed.length), trimmed]);
  };
  return Buffer.concat([readInt(), readInt()]);
}

/**
 * The `Authorization: vapid` header for one push service. `audience` is the push endpoint's origin —
 * a token minted for one push service is not valid at another, which is the point.
 */
export function vapidAuthorization(keys: VapidKeys, audience: string, subject: string, now = Date.now()): string {
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64url(Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 60 * 60, sub: subject })));
  const signer = createSign("SHA256");
  signer.update(`${header}.${body}`);
  const jwt = `${header}.${body}.${b64url(derToJose(signer.sign(vapidSigningKey(keys))))}`;
  return `vapid t=${jwt}, k=${keys.publicKey}`;
}

/* ------------------------------------------------------------- encryption */

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = createHmac("sha256", salt).update(ikm).digest();
  return createHmac("sha256", prk)
    .update(Buffer.concat([info, Buffer.from([1])]))
    .digest()
    .subarray(0, length);
}

export interface EncryptOptions {
  /** Test-only: the RFC's own server key pair and salt, so the vector can be reproduced exactly. */
  serverKeys?: { publicKey: Buffer; privateKey: Buffer };
  salt?: Buffer;
}

/** RFC 8291 §3–4: one `aes128gcm` record, the whole payload, ready to be the request body. */
export function encryptPayload(subscription: Pick<PushSubscription, "p256dh" | "auth">, plaintext: Buffer, opts: EncryptOptions = {}): Buffer {
  if (plaintext.length > MAX_PAYLOAD_BYTES) throw new Error(`Push payload is too large (${plaintext.length} > ${MAX_PAYLOAD_BYTES} bytes)`);
  const uaPublic = fromB64url(subscription.p256dh);
  const authSecret = fromB64url(subscription.auth);
  const salt = opts.salt ?? randomBytes(16);

  const ecdh = createECDH("prime256v1");
  let asPublic: Buffer;
  if (opts.serverKeys) {
    ecdh.setPrivateKey(opts.serverKeys.privateKey);
    asPublic = opts.serverKeys.publicKey;
  } else {
    ecdh.generateKeys();
    asPublic = ecdh.getPublicKey();
  }
  const shared = ecdh.computeSecret(uaPublic);

  // The key-derivation info binds the two public keys into the secret, so a record can't be replayed
  // against a different subscription.
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, shared, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  // 0x02 is the padding delimiter for the last (here, only) record.
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([0x02])])), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

/* ---------------------------------------------------------------- sending */

export type PushResult = { ok: true; status: number } | { ok: false; status: number; gone: boolean; error: string };

/**
 * Sends one notification. A 404 or 410 means the browser threw the subscription away (uninstalled,
 * permission revoked, profile cleared) — that isn't a failure to retry, it's a row to delete, so it is
 * reported separately from anything that went wrong.
 */
export async function sendPush(
  subscription: PushSubscription,
  payload: string,
  vapid: VapidKeys & { subject: string },
  opts: { ttlSeconds?: number; urgency?: "very-low" | "low" | "normal" | "high"; fetchImpl?: typeof fetch } = {},
): Promise<PushResult> {
  const body = encryptPayload(subscription, Buffer.from(payload, "utf8"));
  const audience = new URL(subscription.endpoint).origin;
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(subscription.endpoint, {
      method: "POST",
      headers: {
        authorization: vapidAuthorization(vapid, audience, vapid.subject),
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
        ttl: String(opts.ttlSeconds ?? 12 * 60 * 60),
        urgency: opts.urgency ?? "normal",
      },
      body: new Uint8Array(body),
    });
    if (res.ok) return { ok: true, status: res.status };
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, gone: res.status === 404 || res.status === 410, error: text.slice(0, 300) || res.statusText };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: e instanceof Error ? e.message : String(e) };
  }
}
