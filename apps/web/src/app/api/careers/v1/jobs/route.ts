import { careersRoute } from "@/server/careersRoute";
import { siteJobsList } from "@/server/careers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The open jobs linked to the calling career site. */
export async function GET(req: Request) {
  return careersRoute(req, async (site) => ({ site: { name: site.name }, jobs: await siteJobsList(site) }));
}
