import { z } from "zod";
import type { PaidPlanId } from "@/domain/billing/plans";
import { PAID_PLANS } from "./live";
import { AdminBillingError, billingAudit } from "./admin";
import { razorpayMode } from "./config";
import { adminBillingKey as adminValue, billingKeyStatus, setBillingKeys, type BillingKeyName, type BillingKeyStatus } from "./credentials";
import { getPlansConfig } from "./plansConfig";
import { razorpayCheckKeys } from "./razorpay";
import { ProviderError } from "./stripe";
import { clearPriceCacheForTests as clearPriceCache } from "./service";
import { clearLiveBillingCaches } from "./live";

/**
 * Admin → Billing → Payments: connect Razorpay from the admin (owner, 2026-11-06). The admin enters the Key ID, Key
 * secret and webhook secret; each is checked with Razorpay before it's saved, kept encrypted, and only ever shown
 * masked. The page then walks through the rest of going live: the webhook to add in Razorpay's dashboard, and a price
 * for each plan (Prices). Stripe is not offered here (owner: "no need to enable stripe as of now").
 */

/** The Razorpay webhook events WonderWorks reads (domain/billing/events.ts::fromRazorpayEvent). */
export const RAZORPAY_WEBHOOK_EVENTS = [
  "subscription.authenticated",
  "subscription.activated",
  "subscription.charged",
  "subscription.pending",
  "subscription.halted",
  "subscription.paused",
  "subscription.resumed",
  "subscription.updated",
  "subscription.cancelled",
  "subscription.completed",
] as const;

export interface PaymentsSetup {
  keys: BillingKeyStatus[];
  mode: "test" | "live" | null;
  connection: { state: "not_set" } | { state: "connected" } | { state: "refused"; reason: string } | { state: "unavailable"; reason: string };
  webhook: { url: string; events: readonly string[]; secretSet: boolean };
  prices: { plan: PaidPlanId; label: string; set: boolean }[];
  /** Candidates can pay: connected, the webhook secret is set and Pro has a Razorpay price. */
  live: boolean;
}

export async function paymentsSetup(origin: string): Promise<PaymentsSetup> {
  const keys = await billingKeyStatus();
  const [keyId, webhookSecret] = (["RAZORPAY_KEY_ID", "RAZORPAY_WEBHOOK_SECRET"] as const).map((n) => keys.find((k) => k.name === n)!);
  // The decrypted values stay server-side: they're read here only to ask Razorpay whether the pair works.
  const pair = keyPair();
  let connection: PaymentsSetup["connection"] = { state: "not_set" };
  if (pair) {
    try {
      await razorpayCheckKeys(pair);
      connection = { state: "connected" };
    } catch (e) {
      connection = e instanceof ProviderError && (e.status === 401 || e.status === 403) ? { state: "refused", reason: "Razorpay refused this Key ID and secret" } : { state: "unavailable", reason: "Razorpay couldn't be reached just now" };
    }
  }
  const plans = await getPlansConfig();
  const prices = PAID_PLANS.map((plan) => ({ plan, label: plans.plans[plan].label, set: !!plans.priceRefs[plan].razorpay }));
  return {
    keys,
    mode: keyId.set ? razorpayMode(keyId.shown) : null,
    connection,
    webhook: { url: `${origin}/api/billing/webhooks/razorpay`, events: RAZORPAY_WEBHOOK_EVENTS, secretSet: webhookSecret.set },
    prices,
    live: connection.state === "connected" && webhookSecret.set && !!prices.find((p) => p.plan === "pro")?.set,
  };
}

/** The Key ID and secret in effect (the deployment's, else the admin's), without needing the webhook secret yet. */
function keyPair(): { keyId: string; keySecret: string } | null {
  const id = process.env.RAZORPAY_KEY_ID?.trim() || adminValue("RAZORPAY_KEY_ID");
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim() || adminValue("RAZORPAY_KEY_SECRET");
  return id && secret ? { keyId: id, keySecret: secret } : null;
}

const KEY_ID = /^rzp_(test|live)_[A-Za-z0-9]{6,40}$/;
const SaveInput = z
  .object({
    keyId: z.string().trim().regex(KEY_ID, "The Key ID starts with rzp_test_ or rzp_live_").optional(),
    keySecret: z.string().trim().min(8, "That doesn't look like a Key secret").max(200).optional(),
    webhookSecret: z.string().trim().min(8, "Use at least 8 characters for the webhook secret").max(200).optional(),
  })
  .strict();

/**
 * Save the admin's Razorpay keys. A new Key ID or secret is checked with Razorpay first (as a pair, with whichever half
 * is already saved), so a typo never replaces working keys. A value the deployment sets wins and can't be replaced here.
 */
export async function savePaymentKeys(raw: unknown, actor: string, origin: string): Promise<PaymentsSetup> {
  const r = SaveInput.safeParse(raw);
  if (!r.success) throw new AdminBillingError(r.error.issues[0]?.message ?? "Invalid request", 400);
  const input = r.data;
  const given: Partial<Record<BillingKeyName, string>> = {};
  if (input.keyId) given.RAZORPAY_KEY_ID = input.keyId;
  if (input.keySecret) given.RAZORPAY_KEY_SECRET = input.keySecret;
  if (input.webhookSecret) given.RAZORPAY_WEBHOOK_SECRET = input.webhookSecret;
  const names = Object.keys(given) as BillingKeyName[];
  if (!names.length) throw new AdminBillingError("Enter at least one value.", 400);
  const fromEnv = names.filter((n) => process.env[n]?.trim());
  if (fromEnv.length) throw new AdminBillingError(`${fromEnv.join(", ")} is set in the deployment, which wins over the admin. Remove it there first.`, 409);
  if (given.RAZORPAY_KEY_ID || given.RAZORPAY_KEY_SECRET) {
    const keyId = given.RAZORPAY_KEY_ID ?? (process.env.RAZORPAY_KEY_ID?.trim() || adminValue("RAZORPAY_KEY_ID"));
    const keySecret = given.RAZORPAY_KEY_SECRET ?? (process.env.RAZORPAY_KEY_SECRET?.trim() || adminValue("RAZORPAY_KEY_SECRET"));
    if (!keyId || !keySecret) throw new AdminBillingError("Enter both the Key ID and the Key secret.", 400);
    try {
      await razorpayCheckKeys({ keyId, keySecret });
    } catch (e) {
      if (e instanceof ProviderError && (e.status === 401 || e.status === 403)) throw new AdminBillingError("Razorpay refused this Key ID and secret. Copy both again from Razorpay → Account & Settings → API keys.", 400);
      throw new AdminBillingError("Razorpay couldn't be reached to check the keys, so nothing was saved. Try again shortly.", 502);
    }
  }
  const idBefore = keyPair()?.keyId ?? adminValue("RAZORPAY_KEY_ID");
  const modeBefore = idBefore ? razorpayMode(idBefore) : null;
  await setBillingKeys(given);
  clearPriceCache();
  clearLiveBillingCaches();
  const after = await paymentsSetup(origin);
  // Names and the public Key ID only; never a secret.
  await billingAudit(actor, "billing.razorpay.keys_saved", { saved: names, keyId: given.RAZORPAY_KEY_ID ?? null, modeBefore, modeAfter: after.mode }).catch(() => undefined);
  return after;
}

/** Disconnect: remove the admin's Razorpay keys. Subscriptions already paid stay as they are. */
export async function removePaymentKeys(actor: string, origin: string): Promise<PaymentsSetup> {
  await setBillingKeys({ RAZORPAY_KEY_ID: null, RAZORPAY_KEY_SECRET: null, RAZORPAY_WEBHOOK_SECRET: null });
  clearPriceCache();
  await billingAudit(actor, "billing.razorpay.keys_removed", {}).catch(() => undefined);
  return paymentsSetup(origin);
}
