import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { myApplication, withdrawApplication } from "@/server/teaching/applications";
import { recordServerAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** One of the teacher's own applications, for its page. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, async (s) => ({ application: await myApplication(s, id) }));
}

const Body = z.object({ action: z.literal("withdraw") });

/** The teacher withdraws an application. Audited. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s) => {
      await withdrawApplication(s, id);
      await recordServerAudit(s.tenantId, { actionId: `teaching-withdraw:${id}`, actionType: "teaching.apply", event: "APPLICATION_WITHDRAWN" });
      return { ok: true };
    },
    { schema: Body, write: true },
  );
}
