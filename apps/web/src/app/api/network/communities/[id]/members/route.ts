import { hiringRoute } from "@/server/hiringRoute";
import { communityMembers, inviteCandidates } from "@/server/network/communities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * Who is in the community (and, for its moderators who manage members, who asked to join, who's invited and who's
 * banned). ?invite=<words>: the caller's connections they could invite.
 */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const invite = new URL(req.url).searchParams.get("invite");
  return hiringRoute(req, async (s) => (invite !== null ? { people: await inviteCandidates(s, id, invite.slice(0, 80)) } : communityMembers(s, id)));
}
