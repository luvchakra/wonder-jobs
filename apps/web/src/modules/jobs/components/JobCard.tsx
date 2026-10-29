"use client";
import { shortPlace } from "@/wonderworks/find/place";
import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight, ThumbsDown, Zap } from "lucide-react";
import { APPLY_BTN, CARD_TARGET, FitPill, ResultCard, SaveButton } from "@/wonderworks/find/parts";
import { FIT_META, WORK_MODE_LABEL, type CanonicalJob, type JobMatch, type JobQuality } from "@/domain/jobs/types";
import { JOB_TYPE_LABEL, jobTypeOf } from "@/domain/jobs/jobType";
import { JOB_SOURCES } from "@/domain/jobs/sources";
import { useJobsStore } from "@/store/jobs";
import { cn } from "@/lib/cn";
import type { CompanyBrief } from "@/domain/jobslake/companies";
import { track } from "@/lib/analytics";
import { formatSalaryRange, relativeTime } from "@/lib/format";
import { CompanyLogo } from "@/components/common/Avatar";
import { Badge, type Tone } from "@/components/common/Badge";
import { cardReasons } from "@/domain/jobs/cardReasons";
import { ShareJobButton } from "./ShareJobButton";
import { RatingStars } from "./RatingStars";
import { noteApplyOpened } from "./ApplicationOutcome";
import { jdSummary } from "@/domain/jobs/jdSummary";
import { JobDecision } from "./JobDecision";
import type { JobDecision as Decision } from "@/domain/jobs/decision";

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

/**
 * A posting's places in one short line: the first place and how many more ("San Francisco, CA +2"). The work-mode
 * words some sources list among the places ("San Francisco · Remote · Hybrid") are dropped — the card shows the mode.
 */
export { shortPlace };

const MATCH_TONE: Record<JobMatch["fit"], string> = {
  strong: "bg-success-100 text-success-600",
  worth_considering: "bg-brand-50 text-brand-700",
  stretch: "bg-warning-100 text-warning-600",
  low_fit: "bg-bg-soft text-ink-3",
};

export function JobCard({ job, match, saved, onToggleSave, onReject, compact = false, className, status, decision, onPrepare, compareSelected, onToggleCompare, brief, statusTone = "info" }: { job: CanonicalJob; brief?: CompanyBrief | null; statusTone?: Tone; match?: JobMatch; quality?: JobQuality; saved?: boolean; onToggleSave?: () => void; onReject?: () => void; compact?: boolean; className?: string; status?: string; decision?: Decision; onPrepare?: () => void; compareSelected?: boolean; onToggleCompare?: () => void }) {
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.currency);
  // The site a board's posting lives on ("naukri.com"), once its link has been followed.
  const origin = useJobsStore((s) => s.origins[job.id]);
  const type = jobTypeOf(job);
  // The posting's own skills (its tags when it lists none) and the strongest parts of the computed match.
  const tags = (job.skills.length ? job.skills : job.tags).filter((t) => t.length <= 24).slice(0, 3);
  const reasons = cardReasons(job, match);
  // The posting's own first sentences about the role, shown only where the card has spare room (see .wj-fill).
  const summary = useMemo(() => jdSummary(job.description), [job.description]);
  return (
    <ResultCard
      className={className}
      aside={
        <>
          <CompanyLogo name={job.company} domain={job.companyDomain} logo size={compact ? 36 : 44} />
          {/* The company's employee-review rating, just under the logo, in its short form: ★ 4.3. */}
          {brief?.rating && <RatingStars value={brief.rating.value} title={`${brief.rating.value.toFixed(1)} out of 5${brief.rating.reviews ? ` from ${brief.rating.reviews.toLocaleString("en-US")} reviews` : ""} — ${brief.rating.source}`} size={13} compact className="-mt-0.5" />}
          {match && <FitPill tone={MATCH_TONE[match.fit]} title={`${FIT_META[match.fit].label} — about ${match.score}% aligned with your Career Profile, a guide, not a verdict`} top={<>{match.score}%</>} bottom="Match" srText={FIT_META[match.fit].label} />}
          {/* Apply straight from the list. The icon says which kind, in the button's own width: the bolt is Easy Apply
              (a job posted on WonderStar; opens its page), the arrow opens the employer's listing in a new tab. */}
          {job.sourceIds.includes("employers") ? (
            <Link href={`/app/jobs/${job.id}`} aria-label={`Easy Apply to ${job.title} at ${job.company}`} title="Easy Apply — send your application here on WonderStar" className={APPLY_BTN}>
              <Zap className="size-3.5 shrink-0 fill-current" aria-hidden />
              Apply
            </Link>
          ) : job.applyUrl ? (
            <a href={job.applyUrl} target="_blank" rel="noreferrer" aria-label={`Apply to ${job.title} at ${job.company} on the employer's site (opens in a new tab)`} title="Apply on the employer's site" onClick={() => {
                noteApplyOpened(job.id);
                track("apply_listing_opened", { jobId: job.id, from: "card" });
              }} className={APPLY_BTN}>
              Apply
              <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
            </a>
          ) : null}
        </>
      }
      title={
        <Link href={`/app/jobs/${job.id}`} className={CARD_TARGET}>
          {job.title}
        </Link>
      }
      // The company and the first place share the line below the title.
      facts={[
        <span key="c" className="font-medium text-ink-2">{job.company}</span>,
        <span key="p" title={job.location}>{shortPlace(job.location)}</span>,
        <span key="m">{WORK_MODE_LABEL[job.workMode]}</span>,
        type && <span key="t" title={job.jobTypeFrom === "source" ? "As the source lists it" : "Read from the job title"}>{JOB_TYPE_LABEL[type]}</span>,
        salary && <span key="s" className="font-medium text-ink-2">{salary}</span>,
      ]}
      // Skills and why it fits sit beside the logo, so nothing leaves a gap under it.
      tags={tags}
      reasons={reasons}
      summary={summary}
      summaryTitle="From the job description"
      trailing={
        onReject && (
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
        )
      }
      status={status && <Badge tone={statusTone}>{status}</Badge>}
      footnote={
        <>
          {sourceLine(job) ? `${origin ? `${origin} ` : ""}via ${sourceLine(job)} · ` : ""}
          {relativeTime(job.postedAt)}
          {brief?.size && ` · ${brief.size}`}
          {brief?.h1b ? <span title="Certified H-1B applications in the US Department of Labor's latest disclosure file">{` · H-1B ${brief.h1b.toLocaleString("en-US")}`}</span> : null}
        </>
      }
      // Share, then Save, at the card's corner.
      actions={
        onToggleSave && (
          <>
            <ShareJobButton job={job} className="size-9 text-ink-2" />
            <SaveButton saved={!!saved} onToggle={onToggleSave} noun="job" />
          </>
        )
      }
    >
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
    </ResultCard>
  );
}
