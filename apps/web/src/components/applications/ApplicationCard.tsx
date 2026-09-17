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

export function ApplicationCard({ application, job, className }: { application: Application; job?: CanonicalJob; className?: string }) {
  const meta = APPLICATION_STATUS_META[application.status];
  const href = application.status === "preparing" || application.status === "ready_for_review" || application.status === "saved" ? `/app/applications/${application.id}/prepare` : `/app/applications/${application.id}`;
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
