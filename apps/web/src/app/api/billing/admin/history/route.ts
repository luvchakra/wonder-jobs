import { billingAdminRoute } from "@/server/billing/adminHttp";
import { billingHistory } from "@/server/billing/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → billing-admin changes, newest first: who, when, what. */
export async function GET(req: Request) {
  return billingAdminRoute(req, async () => ({ events: await billingHistory(200) }));
}
