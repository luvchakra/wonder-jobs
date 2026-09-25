"use client";
import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";
import type { Application } from "@/domain/applications/types";
import { APPLICATION_STATUS_META } from "@/domain/applications/types";
import type { CanonicalJob } from "@/domain/jobs/types";
import { formatDate, relativeTime } from "@/lib/format";
import { CompanyLogo } from "@/components/common/Avatar";
import { Badge } from "@/components/common/Badge";
import { companyColor } from "@/components/jobs/JobCard";
import { cn } from "@/lib/cn";

/** Materials still being worked on route to the Application Pack; anything past that goes to the
 * application's own detail/timeline page. */
export function applicationHref(application: Pick<Application, "id" | "status">) {
  return application.status === "preparing" || application.status === "ready_for_review" || application.status === "saved" ? `/app/applications/${application.id}/prepare` : `/app/applications/${application.id}`;
}

export function ApplicationCard({ application, job, compact = false, className }: { application: Application; job?: CanonicalJob; compact?: boolean; className?: string }) {
  const meta = APPLICATION_STATUS_META[application.status];
  const href = applicationHref(application);

  if (compact) {
    // A narrow pipeline column has no room for the full horizontal row (badge/chevron/next-action
    // wrap awkwardly at ~280px) — stack company, role and status instead.
    return (
      <Link href={href} className={cn("wj-card wj-elevate flex flex-col gap-2 p-3", className)}>
        <div className="flex items-center gap-2.5">
          <CompanyLogo name={job?.company ?? "?"} color={job ? companyColor(job.company) : undefined} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-ink">{job?.company ?? "Unknown company"}</span>
            <span className="block truncate text-[12px] text-ink-3">{job?.title ?? "Role"}</span>
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Badge tone={meta.tone} className="shrink-0">
            {meta.label}
          </Badge>
          <span className="truncate text-[11px] text-ink-4">{application.appliedAt ? relativeTime(application.appliedAt) : relativeTime(application.createdAt)}</span>
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className={cn("wj-card wj-elevate flex items-center gap-3 p-4", className)}>
      <CompanyLogo name={job?.company ?? "?"} color={job ? companyColor(job.company) : undefined} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-ink">{job?.company ?? "Unknown company"}</span>
        <span className="block truncate text-[13px] text-ink-2">{job?.title ?? "Role"}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
          <span>{application.appliedAt ? `Applied ${relativeTime(application.appliedAt)}` : `Added ${relativeTime(application.createdAt)}`}</span>
          {application.followUpAt && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden /> {formatDate(application.followUpAt)}
            </span>
          )}
        </span>
        {application.nextAction && <span className="mt-1 block truncate text-[12px] text-ink-3">Next: {application.nextAction}</span>}
      </span>
      <Badge tone={meta.tone} className="shrink-0">
        {meta.label}
      </Badge>
      <ChevronRight className="size-4 shrink-0 text-ink-4" aria-hidden />
    </Link>
  );
}
