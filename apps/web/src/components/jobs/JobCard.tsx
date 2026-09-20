"use client";
import Link from "next/link";
import { Bookmark, MapPin } from "lucide-react";
import { WORK_MODE_LABEL, type CanonicalJob, type JobMatch, type JobQuality } from "@/domain/jobs/types";
import { COMPANIES } from "@/services/mock/catalog";
import { cn } from "@/lib/cn";
import { formatSalaryRange, relativeTime } from "@/lib/format";
import { CompanyLogo } from "@/components/common/Avatar";
import { Badge } from "@/components/common/Badge";
import { MatchBadge } from "./MatchBadge";
import { JobQualityBadge } from "./JobQualityBadge";

export function companyColor(name: string) {
  return COMPANIES.find((c) => c.name === name)?.color;
}

export function JobCard({ job, match, quality, saved, onToggleSave, compact = false, className, status }: { job: CanonicalJob; match?: JobMatch; quality?: JobQuality; saved?: boolean; onToggleSave?: () => void; compact?: boolean; className?: string; status?: string }) {
  const salary = formatSalaryRange(job.salaryMin, job.salaryMax, job.currency);
  return (
    <article className={cn("wj-card wj-elevate relative flex flex-col p-4", className)}>
      <div className="flex items-start gap-3">
        <CompanyLogo name={job.company} color={companyColor(job.company)} size={compact ? 38 : 44} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-tight text-ink">
            <Link href={`/app/jobs/${job.id}`} className="after:absolute after:inset-0 after:content-['']">
              {job.title}
            </Link>
          </h3>
          <p className="truncate text-[13px] text-ink-3">{job.company}</p>
        </div>
        {onToggleSave && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onToggleSave();
            }}
            aria-pressed={saved}
            aria-label={saved ? "Remove from saved" : "Save job"}
            className={cn("relative z-10 flex size-9 items-center justify-center rounded-full transition-colors hover:bg-bg-soft", saved ? "text-brand-600" : "text-ink-4")}
          >
            <Bookmark className="size-[18px]" fill={saved ? "currentColor" : "none"} aria-hidden />
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden /> {job.location}
        </span>
        <span aria-hidden>•</span>
        <span>{WORK_MODE_LABEL[job.workMode]}</span>
        {salary && (
          <>
            <span aria-hidden>•</span>
            <span>{salary}</span>
          </>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {match && <MatchBadge match={match} />}
        {!compact && quality && quality.confidence !== "moderate" && <JobQualityBadge quality={quality} />}
        {(compact ? job.tags.slice(0, 2) : [...match?.highlights.slice(0, 2) ?? [], ...job.tags.slice(0, 1)]).map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
        {status && <Badge tone="info">{status}</Badge>}
      </div>
      <p className="mt-3 text-[12px] text-ink-4">{relativeTime(job.postedAt)}</p>
    </article>
  );
}
