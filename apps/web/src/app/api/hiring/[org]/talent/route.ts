import { hiringRoute } from "@/server/hiringRoute";
import { findTalent } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?q=skills or role words&place=… — job seekers who chose to be open to recruiters. */
export async function GET(req: Request, ctx: { params: Promise<{ org: string }> }) {
  const { org } = await ctx.params;
  const u = new URL(req.url);
  return hiringRoute(req, async (s) => ({ matches: await findTalent(s, org, (u.searchParams.get("q") ?? "").slice(0, 200), (u.searchParams.get("place") ?? "").slice(0, 80)) }));
}
