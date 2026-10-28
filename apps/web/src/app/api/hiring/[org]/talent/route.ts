import { hiringRoute } from "@/server/hiringRoute";
import { findTalent, suggestTalentForJob } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?q=skills or role words&place=…, or ?job=<id> for those suggested for one of the workspace's jobs — job seekers who chose to be open to recruiters. */
export async function GET(req: Request, ctx: { params: Promise<{ org: string }> }) {
  const { org } = await ctx.params;
  const u = new URL(req.url);
  const job = u.searchParams.get("job");
  if (job) return hiringRoute(req, async (s) => ({ matches: await suggestTalentForJob(s, org, job.slice(0, 80)) }));
  return hiringRoute(req, async (s) => ({ matches: await findTalent(s, org, (u.searchParams.get("q") ?? "").slice(0, 200), (u.searchParams.get("place") ?? "").slice(0, 80)) }));
}
