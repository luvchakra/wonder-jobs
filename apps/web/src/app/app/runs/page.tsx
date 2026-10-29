"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { selectActiveRun, useWorkflowStore } from "@/store/workflow";
import { CANDIDATE_STATUS_LABEL } from "@/domain/experience/outcomes";
import type { WorkflowRun } from "@/domain/workflow/types";
import { formatDuration, formatNumber, formatTime } from "@/lib/format";
import { useNow } from "@/lib/motion";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/States";
import { ActiveRunCard } from "@/components/workflow/ActiveRunCard";
import { cn } from "@/lib/cn";

const DAY = 86_400_000;
const done = (r: WorkflowRun) => r.status === "COMPLETED" || r.status === "COMPLETED_WITH_WARNINGS";

/** "Today", "Yesterday", "Thu, 22 Oct". */
function dayHeading(t: number, now: number) {
  const d = new Date(t).toDateString();
  if (d === new Date(now).toDateString()) return "Today";
  if (d === new Date(now - DAY).toDateString()) return "Yesterday";
  return new Date(t).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

/** What was searched, where and across how many sources, how long it took, and how it ran — one line. */
function facts(r: WorkflowRun) {
  const where = r.config.searchCriteria?.locations?.filter(Boolean).join(", ");
  const took = r.startedAt && r.completedAt ? formatDuration(Date.parse(r.completedAt) - Date.parse(r.startedAt)) : "";
  return [
    `${formatNumber(r.summary.jobsRetained || r.summary.jobsDiscovered)} jobs`,
    r.config.sourceIds?.length ? `${r.config.sourceIds.length} ${r.config.sourceIds.length === 1 ? "source" : "sources"}` : "",
    where,
    r.startedAt ? formatTime(r.startedAt) : "",
    took,
    r.trigger === "schedule" ? "Scheduled" : "",
    r.silent ? "Quiet" : "",
    r.parentRunId ? "Recheck" : "",
    r.config.role ? `As ${r.config.role.title}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Search history: every search, newest first, grouped by day — what it searched, where, across how many sources,
 * what it found, and its one next step (the strong matches it found). The last 7 days in one line on top.
 */
export default function RunsPage() {
  const runsById = useWorkflowStore((s) => s.runs);
  const active = useWorkflowStore(selectActiveRun);
  const now = useNow();
  const activeId = active?.id;
  const history = useMemo(() => Object.values(runsById).filter((r) => r.id !== activeId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [runsById, activeId]);
  const week = history.filter((r) => done(r) && now - Date.parse(r.createdAt) < 7 * DAY);
  const groups = useMemo(() => {
    const out: { day: string; runs: WorkflowRun[] }[] = [];
    for (const r of history) {
      const day = dayHeading(Date.parse(r.createdAt), now);
      if (out.at(-1)?.day === day) out.at(-1)!.runs.push(r);
      else out.push({ day, runs: [r] });
    }
    return out;
  }, [history, now]);

  return (
    <div>
      <PageHeader
        title="Search history"
        description={week.length ? `Last 7 days: ${week.length} ${week.length === 1 ? "search" : "searches"} · ${formatNumber(week.reduce((n, r) => n + r.summary.jobsRetained, 0))} jobs · ${formatNumber(week.reduce((n, r) => n + r.summary.strongMatches, 0))} strong` : undefined}
        actions={
          <Button href="/app/jobs?refresh=1" icon={<Play className="size-4" aria-hidden />} disabled={!!active}>
            Search again
          </Button>
        }
      />
      {active && <ActiveRunCard run={active} className="mb-4" />}
      {history.length === 0 ? (
        <EmptyState title="No searches yet" body="Every search Wonder runs for you appears here — what it found and, one click down, exactly how it worked." action={{ label: "See your jobs", href: "/app/jobs" }} />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <section key={g.day} aria-label={g.day}>
              <h2 className="mb-1.5 px-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-4">{g.day}</h2>
              <ul className="wj-card divide-y divide-line overflow-hidden p-0">
                {g.runs.map((r) => {
                  const failed = r.status === "FAILED";
                  const ok = done(r);
                  return (
                    <li key={r.id} className="flex items-center gap-2 px-3 py-2.5">
                      <Link href={`/app/runs/${r.id}`} className="min-w-0 flex-1 hover:opacity-80">
                        <span className="flex items-center gap-1.5">
                          <span className={cn("size-2 shrink-0 rounded-full", failed ? "bg-danger-600" : ok ? (r.status === "COMPLETED" ? "bg-success-600" : "bg-warning-600") : "bg-ink-4")} aria-hidden />
                          <span className={cn("truncate text-[13.5px] font-semibold", ok ? "text-ink" : "text-ink-3")}>{r.config.careerGoal.trim() || r.workflowName.replace(/^(Search|Job Search) — /, "")}</span>
                          {!ok && <span className={cn("shrink-0 text-[11.5px] font-medium", failed ? "text-danger-600" : "text-ink-4")}>{CANDIDATE_STATUS_LABEL[r.status]}</span>}
                        </span>
                        <span className="block truncate pl-3.5 text-[12px] text-ink-3">{facts(r)}</span>
                      </Link>
                      {ok && r.summary.strongMatches > 0 ? (
                        <Button size="sm" variant="outline" href="/app/jobs?fit=strong" className="shrink-0">
                          {formatNumber(r.summary.strongMatches)} strong
                        </Button>
                      ) : (
                        ok && <span className="shrink-0 text-[12px] text-ink-4">0 strong</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
