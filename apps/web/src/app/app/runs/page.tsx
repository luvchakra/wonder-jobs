"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Play, Timer } from "lucide-react";
import { selectActiveRun, useWorkflowStore } from "@/store/workflow";
import { AI_PROVIDERS } from "@/domain/ai/types";
import { formatDate, formatDuration, formatNumber, formatTime, shortId } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { EmptyState } from "@/components/common/States";
import { ActiveRunCard } from "@/components/workflow/ActiveRunCard";
import { RunStatusPill } from "@/components/workflow/RunStatusPill";

export default function RunsPage() {
  const runsById = useWorkflowStore((s) => s.runs);
  const active = useWorkflowStore(selectActiveRun);
  const runs = useMemo(() => Object.values(runsById).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [runsById]);
  const history = runs.filter((r) => r.id !== active?.id);
  return (
    <div>
      <PageHeader
        title="Wonder"
        description="Every run is an execution record: what ran, what it found, what it did."
        actions={
          <>
            <Button variant="outline" href="/app/automation/scheduled" icon={<Timer className="size-4" aria-hidden />}>
              Scheduled runs
            </Button>
            <Button href="/app/runs/new" icon={<Play className="size-4" aria-hidden />} disabled={!!active}>
              Run Wonder
            </Button>
          </>
        }
      />
      <ActiveRunCard run={active} className="mb-6" />
      <h2 className="mb-3 text-[17px] font-semibold text-ink">History</h2>
      {history.length === 0 ? (
        <EmptyState title="No runs yet" body="Your run history, with stage-by-stage records, will appear here." action={{ label: "Run Wonder", href: "/app/runs/new" }} />
      ) : (
        <ul className="flex flex-col gap-3">
          {history.map((r) => {
            const dur = r.startedAt && r.completedAt ? new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime() : null;
            return (
              <li key={r.id}>
                <Link href={`/app/runs/${r.id}`} className="wj-card wj-elevate block p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <RunStatusPill status={r.status} />
                      <span className="truncate text-[14px] font-semibold text-ink">{r.workflowName}</span>
                      <Badge>{r.trigger === "schedule" ? "Scheduled" : "Manual"}</Badge>
                      {r.silent && <Badge>Quiet</Badge>}
                      {r.parentRunId && <Badge tone="info">Rerun</Badge>}
                    </div>
                    <span className="font-mono text-[11px] text-ink-4">{shortId(r.id)}</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] sm:grid-cols-4 lg:grid-cols-8">
                    <Stat label="Started" value={r.startedAt ? `${formatDate(r.startedAt)} ${formatTime(r.startedAt)}` : "—"} />
                    <Stat label="Duration" value={dur != null ? formatDuration(dur) : "—"} />
                    <Stat label="Discovered" value={formatNumber(r.summary.jobsDiscovered)} />
                    <Stat label="Retained" value={formatNumber(r.summary.jobsRetained)} />
                    <Stat label="Prepared" value={formatNumber(r.summary.applicationsPrepared)} />
                    <Stat label="Actions" value={formatNumber(r.summary.actionsExecuted)} />
                    <Stat label="Errors / warnings" value={`${r.summary.errors} / ${r.summary.warnings}`} tone={r.summary.errors ? "danger" : r.summary.warnings ? "warning" : undefined} />
                    <Stat label="Provider" value={`${AI_PROVIDERS[r.config.provider.provider].name}${r.config.provider.model ? ` · ${r.config.provider.model}` : ""}`} />
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "warning" }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-4">{label}</dt>
      <dd className={`truncate font-medium ${tone === "danger" ? "text-danger-600" : tone === "warning" ? "text-warning-600" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
