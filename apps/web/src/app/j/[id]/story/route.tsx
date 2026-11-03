import { NextResponse } from "next/server";
import { SHARE_HINT, shareUrl } from "@/domain/jobs/share";
import { formatSalaryRange } from "@/lib/format";
import { jobChips, jobLines, sharedFor } from "@/server/share/page";
import { logoDataUri, storyImage } from "@/server/share/storyImage";
import { shareSummary } from "@/server/share/summary";

export const runtime = "nodejs";

/** GET — a shared job as a portrait image (WhatsApp Status, Instagram and Facebook Stories): its company logo when the directory has one, the role, its facts, details and summary highlights. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shared = await sharedFor(`/j/${id}`);
  if (!shared || shared.kind !== "job") return new NextResponse(null, { status: 404 });
  const job = shared.job;
  const [summary, image] = await Promise.all([shareSummary(shared.key, shared.input), logoDataUri({ domain: job.companyDomain, name: job.company })]);
  return storyImage({
    badge: "Job opening",
    byline: job.company,
    title: job.title,
    chips: jobChips(job, formatSalaryRange(job.salaryMin, job.salaryMax, job.currency)),
    lines: jobLines(job),
    about: job.description,
    highlights: summary.highlights,
    ai: summary.ai,
    image,
    url: shareUrl(new URL(req.url).origin, job.id),
    cta: "See the job and apply at the link in the message",
    pitch: SHARE_HINT,
  });
}
