import type { BillingProviderId } from "@/domain/billing/types";
import { adminBillingKey } from "./credentials";

/**
 * Billing configuration, read from the environment. Prices are never set here:
 * the operator creates the Pro price in Stripe and/or the Pro plan in Razorpay,
 * and the app reads amount, currency and interval from the provider.
 *
 * A provider is "ready" only with every variable it needs. A missing webhook
 * secret is treated as missing configuration: without it payments could be taken
 * but never confirmed, so checkout must not open.
 */
export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  priceId: string;
  /** The Max plan's price, when the operator created one (STRIPE_PRICE_ID_MAX). */
  priceIdMax?: string;
}

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  /** Empty when the admin hasn't set one: Razorpay's webhooks are then refused (see REQUIRED). */
  webhookSecret: string;
  /** Pro's Razorpay plan from RAZORPAY_PLAN_ID, when the deployment sets one; otherwise Admin → Billing → Prices creates it. */
  planId?: string;
  /** The Max plan at Razorpay, when the operator created one (RAZORPAY_PLAN_ID_MAX). */
  planIdMax?: string;
  /** Razorpay requires a fixed number of billing cycles per subscription. */
  totalCount: number;
}

const REQUIRED: Record<BillingProviderId, string[]> = {
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"],
  // The plan ids are not credentials: the admin creates them from Admin → Billing → Prices once Razorpay is connected.
  // The webhook secret is optional for Razorpay (owner, 2026-11-06: Razorpay's setup never asks for a webhook): every
  // payment is confirmed from Razorpay itself when its checkout window reports it (`/api/billing/confirm`), and the daily
  // reconciliation asks Razorpay about the rest. Without a secret, webhooks are refused, never trusted.
  razorpay: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],
};

/**
 * A billing value: the deployment's variable, else (Razorpay keys only) what the admin entered on Admin → Billing →
 * Payments. A test passing its own env never sees the admin's keys.
 */
function value(name: string, env: NodeJS.ProcessEnv): string | undefined {
  return env[name]?.trim() || (env === process.env ? adminBillingKey(name) : undefined);
}

/** Names (never values) of the variables a provider still needs. */
export function missingBillingEnv(provider: BillingProviderId, env: NodeJS.ProcessEnv = process.env): string[] {
  return REQUIRED[provider].filter((k) => !value(k, env));
}

export function stripeConfig(env: NodeJS.ProcessEnv = process.env): StripeConfig | null {
  if (missingBillingEnv("stripe", env).length) return null;
  return { secretKey: env.STRIPE_SECRET_KEY!.trim(), webhookSecret: env.STRIPE_WEBHOOK_SECRET!.trim(), priceId: env.STRIPE_PRICE_ID!.trim(), priceIdMax: env.STRIPE_PRICE_ID_MAX?.trim() || undefined };
}

export function razorpayConfig(env: NodeJS.ProcessEnv = process.env): RazorpayConfig | null {
  if (missingBillingEnv("razorpay", env).length) return null;
  const count = Number(env.RAZORPAY_TOTAL_COUNT);
  return {
    keyId: value("RAZORPAY_KEY_ID", env)!,
    keySecret: value("RAZORPAY_KEY_SECRET", env)!,
    webhookSecret: value("RAZORPAY_WEBHOOK_SECRET", env) ?? "",
    planId: env.RAZORPAY_PLAN_ID?.trim() || undefined,
    planIdMax: env.RAZORPAY_PLAN_ID_MAX?.trim() || undefined,
    // 120 cycles = ten years of monthly billing; the candidate can cancel any time.
    totalCount: Number.isInteger(count) && count > 0 && count <= 1200 ? count : 120,
  };
}

export const BILLING_PROVIDER_IDS: BillingProviderId[] = ["razorpay", "stripe"];

/** "test" for a Razorpay test-mode key (rzp_test_…), "live" otherwise. */
export function razorpayMode(keyId: string): "test" | "live" {
  return keyId.startsWith("rzp_test_") ? "test" : "live";
}
