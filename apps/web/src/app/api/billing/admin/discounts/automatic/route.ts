import { billingAdminRoute } from "@/server/billing/adminHttp";
import { clearAutomaticDiscount, setAutomaticDiscount } from "@/server/billing/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { plan, discount, duration, durationInMonths?, expiresAt?, requestId } → a Stripe coupon applied to every new checkout of the plan (replaces any before it). */
export async function POST(req: Request) {
  return billingAdminRoute(req, (actor, body) => setAutomaticDiscount(body, actor), 201);
}

/** DELETE { plan } → stop applying it to new checkouts; subscribers who have it keep it for its duration. */
export async function DELETE(req: Request) {
  return billingAdminRoute(req, (actor, body) => clearAutomaticDiscount(body, actor));
}
