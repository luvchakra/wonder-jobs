import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { withdrawTeaching } from "@/server/teaching/applications";
import { recordServerAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ action: z.literal("withdraw") });

/** The teacher withdraws an application. Audited. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s) => {
      await withdrawTeaching(s, id);
      await recordServerAudit(s.tenantId, { actionId: `teaching-withdraw:${id}`, actionType: "teaching.apply", event: "APPLICATION_WITHDRAWN" });
      return { ok: true };
    },
    { schema: Body, write: true },
  );
}
