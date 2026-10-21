import { careersRoute } from "@/server/careersRoute";
import { HiringError } from "@/server/hiring";
import { siteJob } from "@/server/careers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return careersRoute(req, async (site) => {
    const job = await siteJob(site, id);
    if (!job) throw new HiringError("This position is no longer open.", 404);
    // How long the site keeps applications, so its page can tell applicants (DPDP / GDPR notice).
    return { job, site: { name: site.name, retentionMonths: site.retentionMonths ?? null } };
  });
}
