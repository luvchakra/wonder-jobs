import { billingAdminRoute } from "@/server/billing/adminHttp";
import { adminPrices, changePrice, overridePriceRef } from "@/server/billing/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → per paid plan, what Stripe and Razorpay will actually charge (read live) next to what candidates are shown. */
export async function GET(req: Request) {
  return billingAdminRoute(req, () => adminPrices());
}

/** POST { plan, amountMinor, currency, requestId } → a new monthly price at each connected provider; the plan then points at it. */
export async function POST(req: Request) {
  return billingAdminRoute(req, (actor, body) => changePrice(body, actor), 201);
}

/** PUT { plan, provider, ref } → point the plan at an existing provider price/plan (its amount is read from the provider). */
export async function PUT(req: Request) {
  return billingAdminRoute(req, (actor, body) => overridePriceRef(body, actor));
}
