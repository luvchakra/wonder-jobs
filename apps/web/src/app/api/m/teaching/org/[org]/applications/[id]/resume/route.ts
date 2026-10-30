import { resumeDownload } from "@/server/modules/download";
import { applicationResume } from "@/server/teaching/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string; id: string }> };

/** The résumé file sent with a teaching application — for people in that workspace who may view applications. Always a download. */
export async function GET(_req: Request, ctx: Ctx) {
  const { org, id } = await ctx.params;
  return resumeDownload((s) => applicationResume(s, org, id));
}
