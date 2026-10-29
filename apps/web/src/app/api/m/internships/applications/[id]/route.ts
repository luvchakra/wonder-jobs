import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { acceptOffer, withdrawInternship } from "@/server/internships/applications";
import { recordServerAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ action: z.enum(["withdraw", "accept"]) });

/** The student withdraws an application (or declines an offer), or accepts an offer. Audited. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s, b) => {
      if (b.action === "accept") await acceptOffer(s, id);
      else await withdrawInternship(s, id);
      await recordServerAudit(s.tenantId, { actionId: `internship-${b.action}:${id}`, actionType: "internships.apply", event: b.action === "accept" ? "OFFER_ACCEPTED" : "APPLICATION_WITHDRAWN" });
      return { ok: true };
    },
    { schema: Body, write: true },
  );
}
