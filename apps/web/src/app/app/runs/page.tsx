"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Play, Timer } from "lucide-react";
import { selectActiveRun, useWorkflowStore } from "@/store/workflow";
import { CANDIDATE_STATUS_LABEL } from "@/domain/experience/outcomes";
import { formatDate, formatNumber, formatTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { EmptyState } from "@/components/common/States";
import { ActiveRunCard } from "@/components/workflow/ActiveRunCard";

export default function RunsPage() {
  const runsById = useWorkflowStore((s) => s.runs);
  const active = useWorkflowStore(selectActiveRun);
  const runs = useMemo(() => Object.values(runsById).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [runsById]);
  const history = runs.filter((r) => r.id !== active?.id);
  return (
    <div>
      <PageHeader
        title="Wonder"
        description="Tell Wonder what you want. Every search it runs for you is here — what it found, and exactly how it worked."
        actions={
          <>
            <Button variant="outline" href="/app/automation/scheduled" icon={<Timer className="size-4" aria-hidden />}>
              Scheduled searches
            </Button>
            <Button href="/app/runs/new" icon={<Play className="size-4" aria-hidden />} disabled={!!active}>
              Find opportunities
            </Button>
          </>
        }
      />
      <ActiveRunCard run={active} className="mb-6" />
      <h2 className="mb-3 text-[17px] font-semibold text-ink">Search history</h2>
      {history.length === 0 ? (
        <EmptyState title="No searches yet" body="Every search Wonder runs for you appears here — what it found and, one click down, exactly how it worked." action={{ label: "Find opportunities", href: "/app/runs/new" }} />
      ) : (
        <ul className="flex flex-col gap-3">
          {history.map((r) => {
            return (
              <li key={r.id}>
                <Link href={`/app/runs/${r.id}`} className="wj-card wj-elevate block p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge tone={r.status === "FAILED" ? "danger" : r.status === "COMPLETED" ? "success" : r.status === "COMPLETED_WITH_WARNINGS" ? "warning" : "neutral"}>{CANDIDATE_STATUS_LABEL[r.status]}</Badge>
                      <span className="truncate text-[14px] font-semibold text-ink">“{r.config.careerGoal.trim() || r.workflowName.replace(/^(Search|Job Search) — /, "")}”</span>
                    </div>
                    <span className="flex items-center gap-1.5">
                      {r.trigger === "schedule" && <Badge>Scheduled</Badge>}
                      {r.silent && <Badge>Quiet</Badge>}
                      {r.parentRunId && <Badge tone="info">Recheck</Badge>}
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] text-ink-2">
                    {formatNumber(r.summary.jobsRetained || r.summary.jobsDiscovered)} opportunities · {formatNumber(r.summary.strongMatches)} strong
                    {r.summary.applicationsPrepared ? ` · ${formatNumber(r.summary.applicationsPrepared)} application pack${r.summary.applicationsPrepared === 1 ? "" : "s"}` : ""}
                    {r.summary.warnings ? ` · ${r.summary.warnings} note${r.summary.warnings === 1 ? "" : "s"}` : ""}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-4">{r.startedAt ? `${formatDate(r.startedAt)} ${formatTime(r.startedAt)}` : "Not started"}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
