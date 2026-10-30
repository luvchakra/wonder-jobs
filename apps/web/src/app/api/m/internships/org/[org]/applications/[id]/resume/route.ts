import { resumeDownload } from "@/server/modules/download";
import { internshipResume } from "@/server/internships/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string; id: string }> };

/** The résumé file sent with an internship application — for people in that workspace who may view applications. Always a download. */
export async function GET(_req: Request, ctx: Ctx) {
  const { org, id } = await ctx.params;
  return resumeDownload((s) => internshipResume(s, org, id));
}
