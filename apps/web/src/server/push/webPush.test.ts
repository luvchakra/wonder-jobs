import { describe, expect, it, vi } from "vitest";
import { createVerify, createPublicKey } from "node:crypto";
import { encryptPayload, fromB64url, generateVapidKeys, MAX_PAYLOAD_BYTES, sendPush, vapidAuthorization, b64url } from "./webPush";

/**
 * RFC 8291 §5, "Push Message Encryption Example". Reproducing this byte for byte is the only real proof
 * that the key derivation, the framing and the cipher are all right — a round-trip against our own code
 * would pass just as happily with the whole chain wrong.
 */
const VECTOR = {
  plaintext: "When I grow up, I want to be a watermelon",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
    "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
    "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("encryptPayload", () => {
  it("reproduces the RFC 8291 test vector byte for byte", () => {
    const out = encryptPayload(
      { p256dh: VECTOR.uaPublic, auth: VECTOR.authSecret },
      Buffer.from(VECTOR.plaintext, "utf8"),
      { salt: fromB64url(VECTOR.salt), serverKeys: { publicKey: fromB64url(VECTOR.asPublic), privateKey: fromB64url(VECTOR.asPrivate) } },
    );
    expect(b64url(out)).toBe(VECTOR.body);
  });

  it("writes the aes128gcm header: 16-byte salt, record size, then the server's public key", () => {
    const out = encryptPayload({ p256dh: VECTOR.uaPublic, auth: VECTOR.authSecret }, Buffer.from("hello"));
    expect(out.readUInt32BE(16)).toBe(4096);
    expect(out.readUInt8(20)).toBe(65);
    expect(out.readUInt8(21)).toBe(0x04); // uncompressed P-256 point
  });

  it("uses a fresh key pair and salt for every message", () => {
    const a = encryptPayload({ p256dh: VECTOR.uaPublic, auth: VECTOR.authSecret }, Buffer.from("hello"));
    const b = encryptPayload({ p256dh: VECTOR.uaPublic, auth: VECTOR.authSecret }, Buffer.from("hello"));
    expect(a.equals(b)).toBe(false);
  });

  it("refuses a payload that wouldn't fit one record", () => {
    expect(() => encryptPayload({ p256dh: VECTOR.uaPublic, auth: VECTOR.authSecret }, Buffer.alloc(MAX_PAYLOAD_BYTES + 1))).toThrow(/too large/i);
  });
});

describe("VAPID", () => {
  const keys = generateVapidKeys();

  it("generates a raw uncompressed P-256 public key, as browsers expect", () => {
    const pub = fromB64url(keys.publicKey);
    expect(pub.length).toBe(65);
    expect(pub[0]).toBe(0x04);
    expect(fromB64url(keys.privateKey).length).toBe(32);
  });

  it("signs a JWT the push service can verify with the advertised public key", () => {
    const header = vapidAuthorization(keys, "https://fcm.googleapis.com", "mailto:ops@example.com");
    const [, token] = header.match(/vapid t=([^,]+), k=(.+)$/)!;
    const [h, b, sig] = token.split(".");
    expect(JSON.parse(fromB64url(h).toString())).toEqual({ typ: "JWT", alg: "ES256" });
    const claims = JSON.parse(fromB64url(b).toString());
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(claims.sub).toBe("mailto:ops@example.com");

    const pub = fromB64url(keys.publicKey);
    const publicKey = createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) }, format: "jwk" });
    const verifier = createVerify("SHA256");
    verifier.update(`${h}.${b}`);
    // JOSE signatures are raw r||s, which is what `dsaEncoding: "ieee-p1363"` verifies.
    expect(verifier.verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, fromB64url(sig))).toBe(true);
  });

  it("advertises the same public key it signed with", () => {
    expect(vapidAuthorization(keys, "https://example.push", "mailto:a@b.c")).toContain(`k=${keys.publicKey}`);
  });

  it("expires within the 24 hours push services allow", () => {
    const now = Date.UTC(2026, 3, 15, 9, 0, 0);
    const token = vapidAuthorization(keys, "https://example.push", "mailto:a@b.c", now).match(/t=([^,]+)/)![1];
    const { exp } = JSON.parse(fromB64url(token.split(".")[1]).toString());
    expect(exp).toBeGreaterThan(now / 1000);
    expect(exp - now / 1000).toBeLessThanOrEqual(24 * 60 * 60);
  });
});

describe("sendPush", () => {
  const sub = { endpoint: "https://push.example.com/send/abc", p256dh: VECTOR.uaPublic, auth: VECTOR.authSecret };
  const vapid = { ...generateVapidKeys(), subject: "mailto:ops@example.com" };

  it("posts an encrypted body with the headers the push service requires", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    const res = await sendPush(sub, JSON.stringify({ title: "3 strong matches" }), vapid, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res).toEqual({ ok: true, status: 201 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(sub.endpoint);
    expect(init.headers["content-encoding"]).toBe("aes128gcm");
    expect(init.headers.authorization).toMatch(/^vapid t=/);
    expect(init.body.byteLength).toBeGreaterThan(21 + 65);
  });

  it("mints the token for the push service's own origin", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    await sendPush(sub, "{}", vapid, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const token = fetchImpl.mock.calls[0][1].headers.authorization.match(/t=([^,]+)/)![1];
    expect(JSON.parse(fromB64url(token.split(".")[1]).toString()).aud).toBe("https://push.example.com");
  });

  it("reports a dropped subscription as gone, not as a failure to retry", async () => {
    for (const status of [404, 410]) {
      const fetchImpl = vi.fn().mockResolvedValue(new Response("unsubscribed", { status }));
      expect(await sendPush(sub, "{}", vapid, { fetchImpl: fetchImpl as unknown as typeof fetch })).toMatchObject({ ok: false, gone: true });
    }
    const failing = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    expect(await sendPush(sub, "{}", vapid, { fetchImpl: failing as unknown as typeof fetch })).toMatchObject({ ok: false, gone: false, status: 500 });
  });

  it("turns a network error into a result rather than throwing at the caller", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("socket hang up"));
    expect(await sendPush(sub, "{}", vapid, { fetchImpl: fetchImpl as unknown as typeof fetch })).toMatchObject({ ok: false, status: 0, error: "socket hang up" });
  });
});
