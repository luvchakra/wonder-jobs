import { resumeDownload } from "@/server/modules/download";
import { scholarshipResume } from "@/server/scholarships/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string; id: string }> };

/** The résumé sent with an application — for people in that workspace who may view applications. Always a download. */
export async function GET(_req: Request, ctx: Ctx) {
  const { org, id } = await ctx.params;
  return resumeDownload((s) => scholarshipResume(s, org, id));
}
