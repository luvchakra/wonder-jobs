"use client";
import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";
import type { Application, ApplicationJob } from "@/domain/applications/types";
import { APPLICATION_STATUS_META, handedOffAt } from "@/domain/applications/types";
import { WORK_MODE_LABEL, type CanonicalJob } from "@/domain/jobs/types";
import { formatDate, formatSalaryRange, relativeTime } from "@/lib/format";
import { CompanyLogo } from "@/components/common/Avatar";
import { Badge } from "@/components/common/Badge";
import { companyColor } from "@/components/jobs/JobCard";
import { cn } from "@/lib/cn";

const STILL_PREPARING = new Set(["preparing", "ready_for_review", "saved"]);

/**
 * Where an application's card leads: one already opened on the employer's site with Wonder goes back to that
 * application (Apply with Wonder picks up where it stopped and asks whether it was submitted); materials still
 * being worked on go to the Application Pack; anything past that to the application's own timeline.
 */
export function applicationHref(application: Pick<Application, "id" | "status" | "jobId" | "events">) {
  if (!STILL_PREPARING.has(application.status)) return `/app/applications/${application.id}`;
  return handedOffAt(application) ? `/app/jobs/${application.jobId}/apply` : `/app/applications/${application.id}/prepare`;
}

/** Location · work mode · pay, as the posting gave them — whatever it left out is left out here too. */
function facts(j: ApplicationJob) {
  return [j.location, j.workMode ? WORK_MODE_LABEL[j.workMode] : undefined, formatSalaryRange(j.salaryMin, j.salaryMax, j.currency || undefined)].filter(Boolean).join(" · ");
}

/** The one line that says where this application stands. */
function progress(a: Application) {
  const opened = handedOffAt(a);
  if (opened && STILL_PREPARING.has(a.status)) return `Opened with Wonder ${relativeTime(opened.at)} — did you submit?`;
  const ready = a.artifacts.map((x) => (x.type === "resume" ? "Résumé" : x.type === "cover_letter" ? "Cover letter" : null)).filter(Boolean);
  if (ready.length && STILL_PREPARING.has(a.status)) return `${ready.join(" and ")} drafted`;
  return a.nextAction ? `Next: ${a.nextAction}` : undefined;
}

export function ApplicationCard({ application, job, compact = false, className }: { application: Application; job?: CanonicalJob; compact?: boolean; className?: string }) {
  const meta = APPLICATION_STATUS_META[application.status];
  const href = applicationHref(application);
  const info: ApplicationJob | undefined = job ?? application.job;
  const company = info?.company ?? "Job details unavailable";
  const title = info?.title ?? "The posting couldn't be found again";
  const line = info ? facts(info) : "";
  const step = progress(application);
  const when = application.appliedAt ? `Applied ${relativeTime(application.appliedAt)}` : `Added ${relativeTime(application.createdAt)}`;

  if (compact) {
    // A narrow pipeline column has no room for the full horizontal row (badge/chevron/next-action
    // wrap awkwardly at ~280px) — stack company, role and status instead.
    return (
      <Link href={href} className={cn("wj-card wj-elevate flex flex-col gap-2 p-3", className)}>
        <div className="flex items-start gap-2.5">
          <CompanyLogo name={info?.company ?? "?"} domain={info?.companyDomain} logo color={info ? companyColor(info.company) : undefined} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-ink">{company}</span>
            <span className="line-clamp-2 text-[12px] text-ink-2">{title}</span>
            {line && <span className="block truncate text-[11.5px] text-ink-3">{line}</span>}
          </span>
        </div>
        {step && <span className="block truncate text-[11.5px] font-medium text-brand-700">{step}</span>}
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
      <CompanyLogo name={info?.company ?? "?"} domain={info?.companyDomain} logo color={info ? companyColor(info.company) : undefined} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-ink">{company}</span>
        <span className="block truncate text-[13px] text-ink-2">{title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
          {line && <span>{line}</span>}
          <span>{when}</span>
          {application.followUpAt && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden /> {formatDate(application.followUpAt)}
            </span>
          )}
        </span>
        {step && <span className="mt-1 block truncate text-[12px] font-medium text-brand-700">{step}</span>}
      </span>
      <Badge tone={meta.tone} className="shrink-0">
        {meta.label}
      </Badge>
      <ChevronRight className="size-4 shrink-0 text-ink-4" aria-hidden />
    </Link>
  );
}
