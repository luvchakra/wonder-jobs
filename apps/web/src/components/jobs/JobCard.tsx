"use client";
import Link from "next/link";
import { Bookmark, CheckCircle2, ThumbsDown } from "lucide-react";
import { FIT_META, WORK_MODE_LABEL, type CanonicalJob, type JobMatch, type JobQuality } from "@/domain/jobs/types";
import { JOB_TYPE_LABEL, jobTypeOf } from "@/domain/jobs/jobType";
import { COMPANIES } from "@/services/mock/catalog";
import { JOB_SOURCES } from "@/domain/jobs/sources";
import { useJobsStore } from "@/store/jobs";
import { cn } from "@/lib/cn";
import type { CompanyBrief } from "@/domain/jobslake/companies";
import { track } from "@/lib/analytics";
import { formatSalaryRange, relativeTime } from "@/lib/format";
import { CompanyLogo } from "@/components/common/Avatar";
import { Badge } from "@/components/common/Badge";
import { cardReasons } from "@/domain/jobs/cardReasons";
import { ShareJobButton } from "./ShareJobButton";
import { RatingStars } from "./RatingStars";
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
const MODE_WORD = /^(remote|hybrid|on-?site|in-?office)$/i;

/**
 * A posting's places in one short line: the first place and how many more ("San Francisco, CA +2"). The work-mode
 * words some sources list among the places ("San Francisco · Remote · Hybrid") are dropped — the card shows the mode.
 */
export function shortPlace(location: string): string {
  const parts = location.split(/\s+[•·|]\s+|\s*;\s*/).map((p) => p.trim()).filter(Boolean);
  const places = parts.filter((p) => !MODE_WORD.test(p));
  if (!places.length) return parts[0] ?? location;
  return places.length > 1 ? `${places[0]} +${places.length - 1}` : places[0];
}

const APPLY_BTN = "wj-gradient-bg wj-press relative z-10 mt-1 inline-flex h-7 items-center rounded-full px-3 text-[12px] font-semibold text-white";

const MATCH_TONE: Record<JobMatch["fit"], string> = {
  strong: "bg-success-100 text-success-600",
  worth_considering: "bg-brand-50 text-brand-700",
  stretch: "bg-warning-100 text-warning-600",
  low_fit: "bg-bg-soft text-ink-3",
};

export function JobCard({ job, match, saved, onToggleSave, onReject, compact = false, className, status, decision, onPrepare, compareSelected, onToggleCompare, brief }: { job: CanonicalJob; brief?: CompanyBrief | null; match?: JobMatch; quality?: JobQuality; saved?: boolean; onToggleSave?: () => void; onReject?: () => void; compact?: boolean; className?: string; status?: string; decision?: Decision; onPrepare?: () => void; compareSelected?: boolean; onToggleCompare?: () => void }) {
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.currency);
  // The site a board's posting lives on ("naukri.com"), once its link has been followed.
  const origin = useJobsStore((s) => s.origins[job.id]);
  const type = jobTypeOf(job);
  // The posting's own skills (its tags when it lists none) and the strongest parts of the computed match.
  const tags = (job.skills.length ? job.skills : job.tags).filter((t) => t.length <= 24).slice(0, 3);
  const reasons = cardReasons(job, match);
  return (
    <article className={cn("wj-card wj-elevate relative flex flex-col px-4 py-3", className)}>
      <div className="flex items-start gap-3">
        {/* The match sits under the logo, so the company and the title get the card's whole width. */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          <CompanyLogo name={job.company} domain={job.companyDomain} logo color={companyColor(job.company)} size={compact ? 36 : 44} />
          {/* The company's employee-review rating, just under the logo. */}
          {brief?.rating && <RatingStars value={brief.rating.value} title={`${brief.rating.value.toFixed(1)} out of 5${brief.rating.reviews ? ` from ${brief.rating.reviews.toLocaleString("en-US")} reviews` : ""} — ${brief.rating.source}`} className="-mt-0.5" />}
          {match && (
            <span className={cn("rounded-[8px] px-1.5 py-0.5 text-center text-[12px] font-semibold leading-none", MATCH_TONE[match.fit])} title={`${FIT_META[match.fit].label} — about ${match.score}% aligned with your Career Profile, a guide, not a verdict`}>
              {match.score}%<span className="mt-0.5 block text-[10px] font-medium">Match</span>
              <span className="wj-sr-only">, {FIT_META[match.fit].label}</span>
            </span>
          )}
          {/* Apply straight from the list: a job posted on WonderJobs opens its page (Easy Apply); others open the employer's listing. */}
          {job.sourceIds.includes("employers") ? (
            <Link href={`/app/jobs/${job.id}`} className={APPLY_BTN}>
              Apply
            </Link>
          ) : job.applyUrl ? (
            <a href={job.applyUrl} target="_blank" rel="noreferrer" onClick={() => track("apply_listing_opened", { jobId: job.id, from: "card" })} className={APPLY_BTN}>
              Apply
            </a>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          {/* The title leads (two lines at most); the company and the first place share the line below it. */}
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">
            <Link href={`/app/jobs/${job.id}`} className="after:absolute after:inset-0 after:content-['']">
              {job.title}
            </Link>
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-3">
            <span className="font-medium text-ink-2">{job.company}</span>
            <span aria-hidden>·</span>
            <span title={job.location}>{shortPlace(job.location)}</span>
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
          {/* Skills and why it fits sit beside the logo, so nothing leaves a gap under it. */}
          {tags.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Skills">
              {tags.map((t) => (
                <li key={t} className="rounded-full bg-bg-soft px-2.5 py-0.5 text-[12px] text-ink">
                  {t}
                </li>
              ))}
            </ul>
          )}
          {reasons.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5" aria-label="Why it fits">
              {reasons.map((r) => (
                <li key={r} className="flex items-center gap-1 text-[12.5px] text-ink-2">
                  <CheckCircle2 className="size-3.5 shrink-0 fill-success-600 text-white" aria-hidden />
                  {r}
                </li>
              ))}
            </ul>
          )}
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
      <div className="mt-1 flex items-center gap-2">
        {status && <Badge tone="info">{status}</Badge>}
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-4">
          {sourceLine(job) ? `${origin ? `${origin} ` : ""}via ${sourceLine(job)} · ` : ""}
          {relativeTime(job.postedAt)}
          {brief?.size && ` · ${brief.size}`}
          {brief?.h1b ? <span title="Certified H-1B applications in the US Department of Labor's latest disclosure file">{` · H-1B ${brief.h1b.toLocaleString("en-US")}`}</span> : null}
        </span>
        {onToggleSave && (
          // Share, then Save, at the card's corner.
          <div className="relative z-10 -my-1 -mr-1.5 flex shrink-0 items-center">
          <ShareJobButton job={job} className="size-9 text-ink-2" />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onToggleSave();
            }}
            aria-pressed={saved}
            aria-label={saved ? "Remove from saved" : "Save job"}
            className={cn("flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-bg-soft", saved ? "text-brand-600" : "text-ink-2")}
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
