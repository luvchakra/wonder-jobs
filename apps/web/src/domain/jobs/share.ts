import { WORK_MODE_LABEL, type CanonicalJob } from "./types";
import { JOB_TYPE_LABEL, jobTypeOf } from "./jobType";
import { formatSalaryRange } from "@/lib/format";
import { emailHref, whatsappHref, type ShareMessage } from "@/wonderworks/listing/share";

/**
 * Sharing a job with someone else (owner, 2026-10-19): a link to its public page on WonderJobs, whose
 * preview card shows the job, and a message that reads well in WhatsApp and email. Every detail is the
 * posting's own — nothing the candidate's profile says about it (fit, score, notes) leaves the account.
 * The WonderJobs line is the marketing, kept to one sentence.
 */
export type ShareJob = Pick<CanonicalJob, "id" | "title" | "company" | "location" | "workMode" | "salaryMin" | "salaryMax" | "currency" | "jobType" | "jobTypeFrom">;

export const SHARE_PITCH = "WonderWorks is an AI job-search agent that finds jobs that fit you, from real sources.";

/** The job's public page. */
export function shareUrl(origin: string, id: string): string {
  return `${origin.replace(/\/+$/, "")}/j/${encodeURIComponent(id)}`;
}

/** "Mumbai · On-site · Full-time · ₹12L–15L" — the facts as the posting gives them, missing ones left out. */
export function shareFacts(job: ShareJob): string {
  const type = jobTypeOf(job);
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.currency);
  return [job.location, WORK_MODE_LABEL[job.workMode], type ? JOB_TYPE_LABEL[type] : null, salary].filter(Boolean).join(" · ");
}

export type { ShareMessage };

export function shareMessage(job: ShareJob, url: string, home: string): ShareMessage {
  const role = `${job.title} at ${job.company}`;
  const facts = shareFacts(job);
  return {
    subject: `Job you might like: ${role}`,
    body: ["Hi,", "", "I came across this role and thought of you:", "", role, facts, "", `See the job and apply: ${url}`, "", "—", `Found with WonderWorks. ${SHARE_PITCH} ${home}`].join("\n"),
    whatsapp: [`*${role}*`, facts, "", "Thought of you for this one. Found with WonderWorks, the AI job-search agent.", "", url].join("\n"),
    text: `${role}\n${facts}\n\nFound with WonderWorks, the AI job-search agent.`,
  };
}

export { emailHref, whatsappHref };
