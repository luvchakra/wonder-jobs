import { billingAdminRoute } from "@/server/billing/adminHttp";
import { createPromo, deactivatePromo } from "@/server/billing/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { code, discount, duration, durationInMonths?, plans, maxRedemptions?, expiresAt?, requestId } → a Stripe coupon, then its promotion code. */
export async function POST(req: Request) {
  return billingAdminRoute(req, (actor, body) => createPromo(body, actor), 201);
}

/** PATCH { id, active: false } → deactivate (Stripe promotion codes can't be deleted). */
export async function PATCH(req: Request) {
  return billingAdminRoute(req, (actor, body) => deactivatePromo(body, actor));
}
