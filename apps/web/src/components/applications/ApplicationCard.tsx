"use client";
import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";
import type { Application, ApplicationJob } from "@/domain/applications/types";
import { APPLICATION_STATUS_META, handedOffAt } from "@/domain/applications/types";
import { WORK_MODE_LABEL, type CanonicalJob } from "@/domain/jobs/types";
import { formatDate, formatSalaryRange, relativeTime } from "@/lib/format";
import { CompanyLogo } from "@/components/common/Avatar";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/cn";

const STILL_PREPARING = new Set(["preparing", "ready_for_review", "saved"]);

/**
 * Where an application's card leads: one already opened on the employer's site with Wonder goes back to that
 * application (Apply with Wonder picks up where it stopped and asks whether it was submitted); one with an
 * Application Pack drafted goes to the Pack; any other still being prepared goes to the job's page, with Apply,
 * Generate Customized Resume and Mark as completed / withdrawn (owner, 2026-10-25); anything past that to the
 * application's own timeline.
 */
export function applicationHref(application: Pick<Application, "id" | "status" | "jobId" | "events"> & { artifacts?: Application["artifacts"] }) {
  if (!STILL_PREPARING.has(application.status)) return `/app/applications/${application.id}`;
  if (handedOffAt(application)) return `/app/jobs/${application.jobId}/apply`;
  return application.artifacts?.length ? `/app/applications/${application.id}/prepare` : `/app/jobs/${application.jobId}`;
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

/** `actionSpace`: the compact card leaves its bottom-right corner free for an action the list lays over it (e.g. Prepare).
 *  `badge` and `note` replace the status badge and the next-step line (Pipeline → Applied shows where each stands). */
/** Each status on the card as a small chip (e.g. "Résumé made", "Apply opened"). */
function Tags({ tags }: { tags: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">
          {t}
        </span>
      ))}
    </span>
  );
}

export function ApplicationCard({ application, job, compact = false, actionSpace = false, className, badge, note, tags = [] }: { application: Application; job?: CanonicalJob; compact?: boolean; actionSpace?: boolean; className?: string; badge?: { label: string; tone: (typeof APPLICATION_STATUS_META)[keyof typeof APPLICATION_STATUS_META]["tone"] }; note?: string; tags?: string[] }) {
  const meta = badge ?? APPLICATION_STATUS_META[application.status];
  const href = applicationHref(application);
  const info: ApplicationJob | undefined = job ?? application.job;
  const company = info?.company ?? "Job details unavailable";
  const title = info?.title ?? "The posting couldn't be found again";
  const line = info ? facts(info) : "";
  const step = note ?? progress(application);
  const when = application.appliedAt ? `Applied ${relativeTime(application.appliedAt)}` : `Added ${relativeTime(application.createdAt)}`;

  if (compact) {
    // A narrow pipeline column has no room for the full horizontal row (badge/chevron/next-action
    // wrap awkwardly at ~280px) — stack company, role and status instead.
    return (
      <Link href={href} className={cn("wj-card wj-elevate flex flex-col gap-2 p-3", className)}>
        <div className="flex items-start gap-2.5">
          <CompanyLogo name={info?.company ?? "?"} domain={info?.companyDomain} logo size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-ink">{company}</span>
            <span className="line-clamp-2 text-[12px] text-ink-2">{title}</span>
            {line && <span className="block truncate text-[11.5px] text-ink-3">{line}</span>}
          </span>
        </div>
        {step && <span className="block truncate text-[11.5px] font-medium text-brand-700">{step}</span>}
        {tags.length > 0 && <Tags tags={tags} />}
        <div className={cn("flex items-center justify-between gap-2", actionSpace && "min-h-9")}>
          <Badge tone={meta.tone} className="shrink-0">
            {meta.label}
          </Badge>
          <span className={cn("truncate text-[11px] text-ink-4", actionSpace && "hidden")}>{application.appliedAt ? relativeTime(application.appliedAt) : relativeTime(application.createdAt)}</span>
        </div>
      </Link>
    );
  }

  return (
    <Link href={href} className={cn("wj-card wj-elevate flex items-center gap-3 p-4", className)}>
      <CompanyLogo name={info?.company ?? "?"} domain={info?.companyDomain} logo size={44} />
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
        {tags.length > 0 && <span className="mt-1.5 block"><Tags tags={tags} /></span>}
      </span>
      <Badge tone={meta.tone} className="shrink-0">
        {meta.label}
      </Badge>
      <ChevronRight className="size-4 shrink-0 text-ink-4" aria-hidden />
    </Link>
  );
}
