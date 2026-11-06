import { decrypt, encrypt } from "@/server/secrets";
import { maskCredential } from "@/server/jobslake/credentials";
import { jobsLakeStore } from "@/server/jobslake/store";

/**
 * Payment credentials the platform admin enters on Admin → Billing → Payments (owner, 2026-11-06: "in the admin page,
 * give me option to enter razorpay credentials"). Each is kept in the platform's credential store under `billing:<NAME>`,
 * AES-256-GCM encrypted like every other secret, masked on read, never logged or sent to a browser (the Key ID is the
 * one exception: Razorpay makes it public, and its checkout needs it).
 *
 * A deployment environment variable of the same name still wins, so a deployment configured before this keeps working.
 * The admin's values are read into memory at most once a minute (`loadBillingKeys`, awaited at the start of every billing
 * entry point), so the sync config readers in `config.ts` stay cheap.
 */
export const BILLING_KEYS = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"] as const;
export type BillingKeyName = (typeof BILLING_KEYS)[number];

const ref = (name: BillingKeyName) => `billing:${name}`;
const TTL = 60_000;
let cache: { at: number; values: Partial<Record<BillingKeyName, string>> } | null = null;
let inflight: Promise<void> | null = null;

/** Reads the admin's payment keys into memory (at most once a minute; a failed read keeps what was there). */
export function loadBillingKeys(now = Date.now(), force = false): Promise<void> {
  if (!force && cache && now - cache.at < TTL) return Promise.resolve();
  if (force) return readKeys(now);
  if (inflight) return inflight;
  inflight = readKeys(now).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function readKeys(now: number): Promise<void> {
  const store = jobsLakeStore();
  const values: Partial<Record<BillingKeyName, string>> = {};
  try {
    await Promise.all(
      BILLING_KEYS.map(async (k) => {
        const c = await store.getCredential(ref(k));
        if (c) values[k] = decrypt(c.ciphertext);
      }),
    );
    cache = { at: now, values };
  } catch (e) {
    console.warn(`[billing] couldn't read payment keys: ${e instanceof Error ? e.name : "unknown"}`);
    cache = { at: now, values: cache?.values ?? {} };
  }
}

/** The admin's value for a payment key (the environment is checked by the caller first). */
export function adminBillingKey(name: string): string | undefined {
  return cache?.values[name as BillingKeyName]?.trim() || undefined;
}

export interface BillingKeyStatus {
  name: BillingKeyName;
  set: boolean;
  from: "environment" | "admin" | null;
  /** Masked, never the value. The Key ID is shown in full: it's public by Razorpay's design. */
  shown: string;
}

export async function billingKeyStatus(env: NodeJS.ProcessEnv = process.env): Promise<BillingKeyStatus[]> {
  await loadBillingKeys(Date.now(), true);
  return BILLING_KEYS.map((name) => {
    const e = env[name]?.trim();
    const mine = cache?.values[name]?.trim();
    const v = e || mine;
    return { name, set: !!v, from: e ? "environment" : mine ? "admin" : null, shown: !v ? "Not set" : name === "RAZORPAY_KEY_ID" ? v : maskCredential(v) };
  });
}

/** Save (or with null remove) the admin's payment keys. Only the names given are touched. */
export async function setBillingKeys(values: Partial<Record<BillingKeyName, string | null>>, now = new Date().toISOString()): Promise<void> {
  const store = jobsLakeStore();
  for (const name of BILLING_KEYS) {
    if (!(name in values)) continue;
    const v = values[name];
    if (v === null || v === undefined) {
      await store.deleteCredential(ref(name));
      continue;
    }
    const existing = await store.getCredential(ref(name));
    await store.putCredential({ ref: ref(name), ciphertext: encrypt(v.trim()), masked: maskCredential(v.trim()), createdAt: existing?.createdAt ?? now, replacedAt: existing ? now : undefined });
  }
  cache = null;
  await loadBillingKeys(Date.now(), true);
}

/** Tests: forget the cached keys. */
export function __resetBillingKeys() {
  cache = null;
}
