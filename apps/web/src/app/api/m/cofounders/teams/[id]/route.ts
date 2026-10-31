import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { closeTeam, leaveTeam, promote, saveTeam } from "@/server/cofounders/teams";
import { invite } from "@/server/cofounders/connections";
import { recordServerAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** A founder edits, lists or unlists the team. */
export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, async (s, b) => ({ team: await saveTeam(s, id, b) }), { schema: z.record(z.string(), z.unknown()), write: true });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("leave") }),
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("promote"), tenant: z.string().max(80) }),
  z.object({ action: z.literal("invite"), profileId: z.string().regex(/^cfp_[a-z0-9]{8,40}$/), confirmed: z.boolean().optional() }),
]);

/** Leave, close, make a member a founder, or invite someone: each checked against the person's own role in the team. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s, b) => {
      if (b.action === "leave") await leaveTeam(s, id);
      else if (b.action === "close") {
        await closeTeam(s, id);
        await recordServerAudit(s.tenantId, { actionId: `cofounders-close:${id}`, actionType: "cofounders.invite", event: "TEAM_CLOSED", detail: id });
      } else if (b.action === "promote") await promote(s, id, b.tenant);
      else return invite(s, id, b.profileId, b.confirmed);
      return { ok: true };
    },
    { schema: Body, write: true },
  );
}
