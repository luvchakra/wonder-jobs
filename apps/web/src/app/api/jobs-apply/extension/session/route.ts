import { withHelper } from "@/server/jobsApply/helperRoute";
import { send } from "@/server/jobsApply/http";
import { helperSession } from "@/server/jobsApply/service";

export const runtime = "nodejs";

/** GET → the helper's view of its session: status, labels, statuses and counts. Values only come through the fill plan. */
export async function GET(req: Request) {
  return withHelper(req, async (ctx) => send(await helperSession(ctx)));
}
