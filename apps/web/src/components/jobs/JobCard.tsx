"use client";
import Link from "next/link";
import { Bookmark, CheckCircle2, ThumbsDown } from "lucide-react";
import { FIT_META, WORK_MODE_LABEL, type CanonicalJob, type JobMatch, type JobQuality } from "@/domain/jobs/types";
import { JOB_TYPE_LABEL, jobTypeOf } from "@/domain/jobs/jobType";
import { COMPANIES } from "@/services/mock/catalog";
import { JOB_SOURCES } from "@/domain/jobs/sources";
import { useJobsStore } from "@/store/jobs";
import { cn } from "@/lib/cn";
import { formatSalaryRange, relativeTime } from "@/lib/format";
import { CompanyLogo } from "@/components/common/Avatar";
import { Badge } from "@/components/common/Badge";
import { cardReasons } from "@/domain/jobs/cardReasons";
import { ShareJobButton } from "./ShareJobButton";
import { JobDecision } from "./JobDecision";
import type { JobDecision as Decision } from "@/domain/jobs/decision";

export function companyColor(name: string) {
  return COMPANIES.find((c) => c.name === name)?.color;
}

/**
 * `decision` adds the outcome view (outcome spec §9): why Wonder surfaced it, things to consider,
 * and the next suggestion, with Prepare and Compare actions when their handlers are given.
 */
const SOURCE_NAME = new Map(JOB_SOURCES.map((s) => [s.id, s.name]));

/** Where the listing was found — the first source's name, "+1" when it was seen on more. */
export function sourceLine(job: Pick<CanonicalJob, "sourceIds" | "lake">): string {
  const names = job.lake?.sightings.length ? job.lake.sightings.map((x) => x.sourceName) : job.sourceIds.map((id) => SOURCE_NAME.get(id) ?? id);
  const unique = [...new Set(names)];
  return unique.length ? `${unique[0]}${unique.length > 1 ? ` +${unique.length - 1}` : ""}` : "";
}

/** The match pill's colours, by fit — the percentage is a guide, so the fit label goes with it (title, screen readers). */
const MATCH_TONE: Record<JobMatch["fit"], string> = {
  strong: "bg-success-100 text-success-600",
  worth_considering: "bg-brand-50 text-brand-700",
  stretch: "bg-warning-100 text-warning-600",
  low_fit: "bg-bg-soft text-ink-3",
};

export function JobCard({ job, match, saved, onToggleSave, onReject, compact = false, className, status, decision, onPrepare, compareSelected, onToggleCompare }: { job: CanonicalJob; match?: JobMatch; quality?: JobQuality; saved?: boolean; onToggleSave?: () => void; onReject?: () => void; compact?: boolean; className?: string; status?: string; decision?: Decision; onPrepare?: () => void; compareSelected?: boolean; onToggleCompare?: () => void }) {
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.currency);
  // The site a board's posting lives on ("naukri.com"), once its link has been followed.
  const origin = useJobsStore((s) => s.origins[job.id]);
  const type = jobTypeOf(job);
  // The posting's own skills (its tags when it lists none) and the strongest parts of the computed match.
  const tags = (job.skills.length ? job.skills : job.tags).filter((t) => t.length <= 24).slice(0, 3);
  const reasons = cardReasons(job, match);
  return (
    <article className={cn("wj-card wj-elevate relative flex flex-col p-4", className)}>
      <div className="flex items-start gap-3">
        {/* The match sits under the logo, so the company and the title get the card's whole width. */}
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <CompanyLogo name={job.company} domain={job.companyDomain} logo color={companyColor(job.company)} size={compact ? 38 : 48} />
          {match && (
            <span className={cn("rounded-[10px] px-1.5 py-1 text-center text-[13px] font-semibold leading-none", MATCH_TONE[match.fit])} title={`${FIT_META[match.fit].label} — about ${match.score}% aligned with your Career Profile, a guide, not a verdict`}>
              {match.score}%<span className="mt-0.5 block text-[10px] font-medium">Match</span>
              <span className="wj-sr-only">, {FIT_META[match.fit].label}</span>
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold leading-tight text-ink">
            <Link href={`/app/jobs/${job.id}`} className="after:absolute after:inset-0 after:content-['']">
              {job.company}
            </Link>
          </p>
          <h3 className="mt-1 text-[16px] font-semibold leading-snug text-ink">{job.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-3">
            <span>{job.location}</span>
            <span aria-hidden>·</span>
            <span>{WORK_MODE_LABEL[job.workMode]}</span>
            {type && (
              <>
                <span aria-hidden>·</span>
                <span title={job.jobTypeFrom === "source" ? "As the source lists it" : "Read from the job title"}>{JOB_TYPE_LABEL[type]}</span>
              </>
            )}
            {salary && (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium text-ink-2">{salary}</span>
              </>
            )}
          </p>
        </div>
        {onReject && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onReject();
            }}
            aria-label="Not for me"
            className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-bg-soft hover:text-danger-600"
          >
            <ThumbsDown className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills">
          {tags.map((t) => (
            <li key={t} className="rounded-full bg-bg-soft px-3 py-1.5 text-[13px] text-ink">
              {t}
            </li>
          ))}
        </ul>
      )}
      {reasons.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5" aria-label="Why it fits">
          {reasons.map((r) => (
            <li key={r} className="flex items-center gap-2 text-[14px] text-ink-2">
              <CheckCircle2 className="size-[18px] shrink-0 fill-success-600 text-white" aria-hidden />
              {r}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-2">
        {status && <Badge tone="info">{status}</Badge>}
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-4">
          {sourceLine(job) ? `${origin ? `${origin} ` : ""}via ${sourceLine(job)} · ` : ""}
          {relativeTime(job.postedAt)}
        </span>
        {onToggleSave && (
          // Share, then Save, at the card's corner.
          <div className="relative z-10 -mr-1.5 -mb-1.5 flex shrink-0 items-center">
          <ShareJobButton job={job} className="size-10 text-ink-2" />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onToggleSave();
            }}
            aria-pressed={saved}
            aria-label={saved ? "Remove from saved" : "Save job"}
            className={cn("flex size-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-bg-soft", saved ? "text-brand-600" : "text-ink-2")}
          >
            <Bookmark className="size-5" fill={saved ? "currentColor" : "none"} aria-hidden />
          </button>
          </div>
        )}
      </div>
      {decision && <JobDecision decision={decision} className="mt-3 border-t border-line pt-3" />}
      <div className={cn("flex flex-wrap items-center justify-end gap-2", (onPrepare || onToggleCompare) && "mt-3")}>
        {(onPrepare || onToggleCompare) && (
          <div className="relative z-10 flex items-center gap-2">
            {onToggleCompare && (
              <label className="flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-[12px] font-medium text-ink-3 hover:bg-bg-soft">
                <input type="checkbox" className="size-3.5 accent-[var(--color-brand-600)]" checked={!!compareSelected} onChange={onToggleCompare} aria-label={`Compare ${job.title} at ${job.company}`} />
                Compare
              </label>
            )}
            {onPrepare && decision && decision.next.kind !== "track" && decision.next.kind !== "skip" && (
              <button type="button" onClick={onPrepare} aria-label={`${decision.next.kind === "review_pack" ? "Review" : decision.next.kind === "continue_pack" ? "Continue" : "Prepare"} the application for ${job.title} at ${job.company}`} className="rounded-full bg-brand-50 px-3 py-1 text-[12px] font-semibold text-brand-700 hover:bg-brand-100">
                {decision.next.kind === "review_pack" ? "Review" : decision.next.kind === "continue_pack" ? "Continue" : "Prepare"}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
