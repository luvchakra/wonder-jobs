import type { BillingProviderId } from "@/domain/billing/types";

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
  webhookSecret: string;
  planId: string;
  /** The Max plan at Razorpay, when the operator created one (RAZORPAY_PLAN_ID_MAX). */
  planIdMax?: string;
  /** Razorpay requires a fixed number of billing cycles per subscription. */
  totalCount: number;
}

const REQUIRED: Record<BillingProviderId, string[]> = {
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"],
  razorpay: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "RAZORPAY_PLAN_ID"],
};

/** Names (never values) of the variables a provider still needs. */
export function missingBillingEnv(provider: BillingProviderId, env: NodeJS.ProcessEnv = process.env): string[] {
  return REQUIRED[provider].filter((k) => !env[k]?.trim());
}

export function stripeConfig(env: NodeJS.ProcessEnv = process.env): StripeConfig | null {
  if (missingBillingEnv("stripe", env).length) return null;
  return { secretKey: env.STRIPE_SECRET_KEY!.trim(), webhookSecret: env.STRIPE_WEBHOOK_SECRET!.trim(), priceId: env.STRIPE_PRICE_ID!.trim(), priceIdMax: env.STRIPE_PRICE_ID_MAX?.trim() || undefined };
}

export function razorpayConfig(env: NodeJS.ProcessEnv = process.env): RazorpayConfig | null {
  if (missingBillingEnv("razorpay", env).length) return null;
  const count = Number(env.RAZORPAY_TOTAL_COUNT);
  return {
    keyId: env.RAZORPAY_KEY_ID!.trim(),
    keySecret: env.RAZORPAY_KEY_SECRET!.trim(),
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET!.trim(),
    planId: env.RAZORPAY_PLAN_ID!.trim(),
    planIdMax: env.RAZORPAY_PLAN_ID_MAX?.trim() || undefined,
    // 120 cycles = ten years of monthly billing; the candidate can cancel any time.
    totalCount: Number.isInteger(count) && count > 0 && count <= 1200 ? count : 120,
  };
}

export const BILLING_PROVIDER_IDS: BillingProviderId[] = ["razorpay", "stripe"];
