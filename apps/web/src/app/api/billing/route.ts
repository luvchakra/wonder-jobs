import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { entitlement, paymentsLive, providerAvailability } from "@/server/billing/service";
import { isAdminSession } from "@/server/jobslake/access";
import { getPlansConfig } from "@/server/billing/plansConfig";
import { limitsFor } from "@/domain/billing/plans";
import { billingStore } from "@/server/billing/store";
import { planDiscounts } from "@/server/billing/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The candidate's plan and how they can pay. Prices come from Stripe / Razorpay themselves;
 * a provider without credentials reports "needs_setup" (with the variable names, never values).
 * `payments` is this account's own slice of the billing ledger: the evidence behind the plan badge.
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`billing:${session.tenantId}`, { capacity: 30, refillPerSec: 0.5 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const [providers, ent, ledger, config] = await Promise.all([providerAvailability(), entitlement(session.tenantId), billingStore().ledgerForTenant(session.tenantId, 50).catch(() => []), getPlansConfig()]);
  const payments = ledger
    .filter((r) => r.kind === "payment_succeeded" || r.kind === "payment_failed")
    .map((r) => ({ at: r.occurredAt, provider: r.provider, kind: r.kind, amount: r.amount ?? null, currency: r.currency ?? null }))
    .reverse();
  // A discount is shown only when Stripe is ready and its live coupon applies to the plan's live price.
  const discounts = providers.some((p) => p.provider === "stripe" && p.state === "ready") ? await planDiscounts(config).catch(() => ({})) : {};
  const sub = ent.subscription;
  return NextResponse.json(
    {
      providers,
      plan: ent.plan,
      limits: limitsFor(ent.plan, config),
      plans: config.plans,
      discounts,
      reason: ent.reason,
      until: ent.until ?? null,
      subscription: sub ? { provider: sub.provider, status: sub.status, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, currentPeriodEnd: sub.currentPeriodEnd ?? null, canManage: sub.provider === "stripe" ? !!sub.customerId : sub.status !== "canceled" } : null,
      payments,
      // Pre-launch: switch plans without paying, to try each plan's limits.
      testing: { allowed: isAdminSession(session) || !paymentsLive(), active: ent.reason.startsWith("Testing ") },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
