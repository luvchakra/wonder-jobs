import { billingAdminRoute } from "@/server/billing/adminHttp";
import { adminApiPlan, saveApiPlanAdmin } from "@/server/billing/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → JobsLake API pricing in force, the registered sources, and the live metered price from Stripe. */
export async function GET(req: Request) {
  return billingAdminRoute(req, () => adminApiPlan());
}

/** PUT { freeMonthly, maxMonthly, sourceIds } → stored on the platform; takes precedence over the environment. */
export async function PUT(req: Request) {
  return billingAdminRoute(req, (actor, body) => saveApiPlanAdmin(body, actor));
}
