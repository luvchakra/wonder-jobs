"use client";
import Link from "next/link";
import { Bookmark, MapPin, ThumbsDown } from "lucide-react";
import { WORK_MODE_LABEL, type CanonicalJob, type JobMatch, type JobQuality } from "@/domain/jobs/types";
import { COMPANIES } from "@/services/mock/catalog";
import { JOB_SOURCES } from "@/domain/jobs/sources";
import { useJobsStore } from "@/store/jobs";
import { cn } from "@/lib/cn";
import { formatSalaryRange, relativeTime } from "@/lib/format";
import { CompanyLogo } from "@/components/common/Avatar";
import { Badge } from "@/components/common/Badge";
import { FitLabel } from "./MatchBadge";
import { JobDecision } from "./JobDecision";
import type { JobDecision as Decision } from "@/domain/jobs/decision";

export function companyColor(name: string) {
  return COMPANIES.find((c) => c.name === name)?.color;
}

/**
 * `decision` adds the outcome view (outcome spec §9): why Wonder surfaced it, things to consider,
 * and the next suggestion, with Prepare and Compare actions when their handlers are given.
 */
const LEVEL_LABEL: Record<CanonicalJob["seniority"], string> = { junior: "Junior", mid: "Mid level", senior: "Senior", lead: "Lead", director: "Director" };
const SOURCE_NAME = new Map(JOB_SOURCES.map((s) => [s.id, s.name]));

/** Where the listing was found — the first source's name, "+1" when it was seen on more. */
export function sourceLine(job: Pick<CanonicalJob, "sourceIds" | "lake">): string {
  const names = job.lake?.sightings.length ? job.lake.sightings.map((x) => x.sourceName) : job.sourceIds.map((id) => SOURCE_NAME.get(id) ?? id);
  const unique = [...new Set(names)];
  return unique.length ? `${unique[0]}${unique.length > 1 ? ` +${unique.length - 1}` : ""}` : "";
}

export function JobCard({ job, match, saved, onToggleSave, onReject, compact = false, className, status, decision, onPrepare, compareSelected, onToggleCompare }: { job: CanonicalJob; match?: JobMatch; quality?: JobQuality; saved?: boolean; onToggleSave?: () => void; onReject?: () => void; compact?: boolean; className?: string; status?: string; decision?: Decision; onPrepare?: () => void; compareSelected?: boolean; onToggleCompare?: () => void }) {
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.currency);
  // The site a board's posting lives on ("naukri.com"), once its link has been followed.
  const origin = useJobsStore((s) => s.origins[job.id]);
  return (
    <article className={cn("wj-card wj-elevate relative flex flex-col p-4", className)}>
      <div className="flex items-start gap-3">
        <CompanyLogo name={job.company} color={companyColor(job.company)} size={compact ? 38 : 44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight text-ink">
            <Link href={`/app/jobs/${job.id}`} className="after:absolute after:inset-0 after:content-['']">
              {job.company}
            </Link>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden /> {job.location}
            </span>
            <span aria-hidden>•</span>
            <span>{WORK_MODE_LABEL[job.workMode]}</span>
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
        {onToggleSave && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onToggleSave();
            }}
            aria-pressed={saved}
            aria-label={saved ? "Remove from saved" : "Save job"}
            className={cn("relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-bg-soft", saved ? "text-brand-600" : "text-ink-4")}
          >
            <Bookmark className="size-[18px]" fill={saved ? "currentColor" : "none"} aria-hidden />
          </button>
        )}
      </div>
      {/* The two things every listing is judged on first, always in the same place — a missing salary says so. */}
      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-[12px] bg-surface-2 px-3 py-2">
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-4">Designation</dt>
          <dd>
            <h3 className="text-[14px] font-semibold leading-snug text-ink">{job.title}</h3>
            <span className="text-[12px] text-ink-3">{LEVEL_LABEL[job.seniority]}</span>
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-4">Salary</dt>
          <dd className={cn("whitespace-nowrap text-[14px] font-semibold leading-snug", salary ? "text-ink" : "font-normal text-ink-4")}>{salary ?? "Not listed"}</dd>
        </div>
      </dl>
      {/* Fit and where you are with it — the reasons, signals and tags are on the job's own page. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {match && <FitLabel fit={match.fit} score={match.score} />}
        {status && <Badge tone="info">{status}</Badge>}
        <span className="ml-auto truncate text-[12px] text-ink-4">
          {sourceLine(job) ? `${origin ? `${origin} ` : ""}via ${sourceLine(job)} · ` : ""}
          {relativeTime(job.postedAt)}
        </span>
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
