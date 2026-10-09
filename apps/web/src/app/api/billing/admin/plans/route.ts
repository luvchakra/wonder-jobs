import { billingAdminRoute } from "@/server/billing/adminHttp";
import { ENFORCED_AT, savePlanFeatures } from "@/server/billing/admin";
import { getPlansConfig } from "@/server/billing/plansConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → every plan's name, tagline and limits, and where each limit is enforced. Admins only. */
export async function GET(req: Request) {
  return billingAdminRoute(req, async () => ({ config: await getPlansConfig(), enforcedAt: ENFORCED_AT }));
}

/** PUT { plans: { free?: {…}, pro?: {…}, max?: {…} } } → saves names, taglines and limits (never prices); audited with a diff. */
export async function PUT(req: Request) {
  return billingAdminRoute(req, (actor, body) => savePlanFeatures(body, actor));
}
