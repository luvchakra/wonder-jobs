import { withHelper } from "@/server/jobsApply/helperRoute";
import { fail, send } from "@/server/jobsApply/http";
import { helperFile } from "@/server/jobsApply/service";

export const runtime = "nodejs";

/** GET ?kind=resume|cover_letter → the document from this session's pack snapshot, only when a form field is waiting for it. */
export async function GET(req: Request) {
  return withHelper(req, async (ctx) => {
    const kind = new URL(req.url).searchParams.get("kind");
    if (kind !== "resume" && kind !== "cover_letter") return fail(400, "INVALID", "kind must be resume or cover_letter.");
    return send(await helperFile(ctx, kind));
  });
}
