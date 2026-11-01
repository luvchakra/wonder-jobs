import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { myScholarshipApplication, withdrawScholarship } from "@/server/scholarships/applications";
import { recordServerAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** One of the student's own applications, for its page. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, async (s) => ({ application: await myScholarshipApplication(s, id) }));
}

const Body = z.object({ action: z.literal("withdraw") });

/** The student withdraws an application. Audited. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s) => {
      await withdrawScholarship(s, id);
      await recordServerAudit(s.tenantId, { actionId: `scholarship-withdraw:${id}`, actionType: "scholarships.apply", event: "APPLICATION_WITHDRAWN" });
      return { ok: true };
    },
    { schema: Body, write: true },
  );
}
