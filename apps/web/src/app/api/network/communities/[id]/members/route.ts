import { hiringRoute } from "@/server/hiringRoute";
import { communityMembers } from "@/server/network/communities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Who is in the community (and, for its moderators, who asked to join). */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, (s) => communityMembers(s, id));
}
