import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { actOnMember, answerModInvite, deleteCommunity, getCommunity, inviteMembers, joinCommunity, leaveCommunity, listDiscussions, setAutoMod, setModerator, startDiscussion, stepDown, updateCommunity } from "@/server/network/communities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** ?sort=active|new|top: the community, and its discussions when the caller may read them. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const raw = new URL(req.url).searchParams.get("sort");
  const sort = raw === "new" || raw === "top" ? raw : "active";
  return hiringRoute(req, async (s) => {
    const community = await getCommunity(s, id);
    return { community, discussions: community.canRead ? await listDiscussions(s, id, sort) : [] };
  });
}

const Act = z.union([
  z.object({ action: z.enum(["join", "leave"]) }),
  z.object({ action: z.literal("member"), member: z.string().max(60), do: z.enum(["approve", "decline", "remove", "ban", "unban", "make_owner"]), days: z.number().int().min(0).max(30).optional(), reason: z.string().max(400).optional() }),
  // Moderators who manage members invite their connections (network.connect, checked on the server).
  z.object({ action: z.literal("invite"), members: z.array(z.string().max(60)).min(1).max(50), confirmed: z.boolean().optional() }),
  // Moderators with Everything: invite a member to moderate, change a moderator's permissions, or (null) remove them.
  z.object({ action: z.literal("moderator"), member: z.string().max(60), perms: z.array(z.string().max(20)).max(4).nullable() }),
  z.object({ action: z.literal("mod_invite"), accept: z.boolean() }),
  z.object({ action: z.literal("step_down") }),
  z.object({ action: z.literal("automod"), rules: z.object({ on: z.boolean().optional(), blockedWords: z.array(z.string().max(80)).max(200).optional(), blockedAction: z.enum(["hold", "remove"]).optional(), holdLinksFromNew: z.boolean().optional(), newMemberDays: z.number().optional(), newMemberDailyPosts: z.number().optional(), reportsToHold: z.number().optional() }) }),
  // A member's own new discussion (network.post, checked on the server).
  z.object({ action: z.literal("discuss"), title: z.string().max(400), body: z.string().max(16000), about: z.object({ page: z.string().max(260), title: z.string().max(300) }).nullable().optional(), confirmed: z.boolean().optional() }),
]);

/** Join or leave, act on a member (moderators), or start a discussion. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s, b) => {
      if (b.action === "join") return { community: await joinCommunity(s, id) };
      if (b.action === "leave") return leaveCommunity(s, id);
      if (b.action === "member") return actOnMember(s, id, b.member, b.do, { days: b.days, reason: b.reason });
      if (b.action === "invite") return inviteMembers(s, id, b.members, b.confirmed);
      if (b.action === "moderator") return setModerator(s, id, b.member, b.perms as never);
      if (b.action === "mod_invite") return { community: await answerModInvite(s, id, b.accept) };
      if (b.action === "step_down") return { community: await stepDown(s, id) };
      if (b.action === "automod") return { automod: await setAutoMod(s, id, b.rules) };
      if (b.action !== "discuss") return null;
      return { discussion: await startDiscussion(s, id, { title: b.title, body: b.body, about: b.about ?? null }, b.confirmed) };
    },
    { schema: Act, write: true },
  );
}

const Edit = z.object({ name: z.string().max(200).optional(), about: z.string().max(2000).optional(), rules: z.string().max(4000).optional(), visibility: z.enum(["public", "private"]).optional(), joinPolicy: z.enum(["open", "approval"]).optional(), module: z.string().max(20).optional() });

/** Edit the community: its owner, or a moderator with Settings. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, async (s, b) => ({ community: await updateCommunity(s, id, b) }), { schema: Edit, write: true });
}

/** Delete the community with its discussions: its owner only. */
export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, (s) => deleteCommunity(s, id), { write: true });
}
