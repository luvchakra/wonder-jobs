import { billingAdminRoute } from "@/server/billing/adminHttp";
import { adminDiscounts } from "@/server/billing/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → promotion codes as Stripe has them (real redemption counts) and each plan's automatic discount. */
export async function GET(req: Request) {
  return billingAdminRoute(req, () => adminDiscounts());
}
