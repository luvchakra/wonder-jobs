import { NextResponse } from "next/server";
import { WORK_MODE_LABEL } from "@/domain/jobs/types";
import { JOB_TYPE_LABEL, jobTypeOf } from "@/domain/jobs/jobType";
import { SHARE_HINT, shareUrl } from "@/domain/jobs/share";
import { formatSalaryRange } from "@/lib/format";
import { logoDataUri, storyImage } from "@/server/share/storyImage";
import { sharedJob } from "../data";

export const runtime = "nodejs";

/** GET — a shared job as a portrait image (WhatsApp Status, Instagram and Facebook Stories): its company logo when the directory has one, the role and its facts. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await sharedJob(id);
  if (!job) return new NextResponse(null, { status: 404 });
  const type = jobTypeOf(job);
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.currency);
  const chips = [salary, job.location, WORK_MODE_LABEL[job.workMode], type ? JOB_TYPE_LABEL[type] : null].filter((x): x is string => !!x);
  return storyImage({
    badge: "Job opening",
    byline: job.company,
    title: job.title,
    chips,
    lines: [
      job.seniority && `Level: ${job.seniority[0].toUpperCase()}${job.seniority.slice(1)}`,
      job.skills?.length ? `Skills: ${job.skills.slice(0, 6).join(", ")}` : null,
      job.postedAt && `Posted: ${new Date(job.postedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
    ].filter((x): x is string => !!x),
    about: job.description,
    image: await logoDataUri({ domain: job.companyDomain, name: job.company }),
    url: shareUrl(new URL(req.url).origin, job.id),
    cta: "Tap the link to see the job and apply",
    pitch: SHARE_HINT,
  });
}
