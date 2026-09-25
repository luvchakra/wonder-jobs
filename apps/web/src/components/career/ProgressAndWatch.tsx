"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Radar } from "lucide-react";
import { computeProgressSummary, nextScheduledSearch } from "@/domain/career/attention";
import { useApplicationsStore } from "@/store/applications";
import { useWorkflowStore } from "@/store/workflow";
import { useNow } from "@/lib/motion";
import { formatDate, formatTime } from "@/lib/format";
import { track } from "@/lib/analytics";
import { Card } from "@/components/common/Card";

/**
 * Home's "Your progress" and "Wonder is working" (outcome spec §17–18). Only non-zero progress
 * counts are shown, and "Wonder is working" only appears when a real enabled schedule exists —
 * never a claim that Wonder is watching when nothing is scheduled.
 */
export function ProgressAndWatch({ className }: { className?: string }) {
  const now = useNow();
  const applications = useApplicationsStore((s) => s.applications);
  const schedules = useWorkflowStore((s) => s.schedules);
  const p = useMemo(() => computeProgressSummary(applications, now), [applications, now]);
  const next = useMemo(() => nextScheduledSearch(schedules), [schedules]);

  const items = [
    { n: p.active, one: "application active", many: "applications active", href: "/app/applications" },
    { n: p.interviewsThisWeek, one: "interview this week", many: "interviews this week", href: "/app/applications" },
    { n: p.followUpsDue, one: "follow-up due", many: "follow-ups due", href: "/app/applications" },
    { n: p.employerReplies, one: "employer replied", many: "employers replied", href: "/app/applications" },
  ].filter((i) => i.n > 0);

  if (!items.length && !next) return null;
  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${className ?? ""}`}>
      {items.length > 0 && (
        <Card>
          <h2 className="text-[15px] font-semibold text-ink">Your progress</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {items.map((i) => (
              <li key={i.one}>
                <Link href={i.href} onClick={() => track("progress_action_clicked", { item: i.one.replace(/ /g, "_") })} className="flex items-baseline gap-2 text-[14px] text-ink-2 hover:text-ink">
                  <span className="text-[17px] font-semibold text-ink">{i.n}</span> {i.n === 1 ? i.one : i.many}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {next && (
        <Card className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-100 text-success-600">
            <Radar className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-ink">Wonder is working</h2>
            <p className="text-[13px] text-ink-2">
              Next search: {formatDate(next.nextRunAt!)} at {formatTime(next.nextRunAt!)}
            </p>
            <p className="truncate text-[12px] text-ink-3">{next.name}</p>
            <Link href="/app/automation/scheduled" className="mt-1 inline-block text-[13px] font-medium text-brand-600 hover:underline">
              Change search
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
