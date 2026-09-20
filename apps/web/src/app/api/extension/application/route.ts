import { NextResponse } from "next/server";
import type { Application } from "@/domain/applications/types";
import type { CanonicalJob } from "@/domain/jobs/types";
import { buildDocxBytes } from "@/lib/docx";
import { markdownToPlainText } from "@/lib/richtext";
import { readClientState } from "@/server/clientState";
import { tenantFromAuthHeader } from "@/server/extensionToken";
import { rateLimit } from "@/server/rateLimit";
import { jobIdFromAtsUrl } from "@/services/jobs/atsUrl";

export const runtime = "nodejs";

function currentContent(app: Application, type: "resume" | "cover_letter"): string | null {
  const artifact = app.artifacts.find((a) => a.type === type);
  return artifact?.versions.find((v) => v.id === artifact.currentVersionId)?.content ?? null;
}

function safeFilename(company: string, label: string): string {
  const base = [company, label].filter(Boolean).join(" ").replace(/[^\w -]+/g, "").trim().replace(/\s+/g, "-");
  return `${base || label}.docx`;
}

/**
 * GET /api/extension/application?url=<the employer page the candidate is on>
 *
 * The prepared materials for *that specific posting*, if the candidate has an
 * application for it in WonderJobs: the current resume as a real .docx (base64,
 * so the extension can attach it to a file input) and the cover letter as plain
 * text for a textarea. A page WonderJobs doesn't know, or knows but has no
 * prepared materials for, answers `matched: false` — the extension then fills
 * only the base profile rather than attaching someone else's resume.
 */
export async function GET(req: Request) {
  const tenantId = tenantFromAuthHeader(req.headers.get("authorization"));
  if (!tenantId) return NextResponse.json({ error: "Connect the extension to WonderJobs again." }, { status: 401, headers: { "cache-control": "no-store" } });
  const rl = rateLimit(`ext-app:${tenantId}`, { capacity: 60, refillPerSec: 1 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });

  const pageUrl = new URL(req.url).searchParams.get("url") ?? "";
  const jobId = jobIdFromAtsUrl(pageUrl);
  const noMatch = NextResponse.json({ matched: false }, { headers: { "cache-control": "no-store" } });
  if (!jobId) return noMatch;

  const [applicationsDoc, jobsDoc] = await Promise.all([
    readClientState<{ applications?: Record<string, Application> }>(tenantId, "wj.applications"),
    readClientState<{ jobs?: Record<string, CanonicalJob> }>(tenantId, "wj.jobs"),
  ]);
  const application = Object.values(applicationsDoc?.applications ?? {}).find((a) => a.jobId === jobId);
  if (!application) return noMatch;

  const job = jobsDoc?.jobs?.[jobId];
  const resumeMarkdown = currentContent(application, "resume");
  const coverLetterMarkdown = currentContent(application, "cover_letter");
  const company = job?.company ?? "";

  return NextResponse.json(
    {
      matched: true,
      applicationId: application.id,
      jobTitle: job?.title ?? "",
      company,
      resume: resumeMarkdown ? { filename: safeFilename(company, "Resume"), base64: Buffer.from(buildDocxBytes(resumeMarkdown)).toString("base64") } : null,
      coverLetter: coverLetterMarkdown
        ? { text: markdownToPlainText(coverLetterMarkdown), file: { filename: safeFilename(company, "Cover-Letter"), base64: Buffer.from(buildDocxBytes(coverLetterMarkdown)).toString("base64") } }
        : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
