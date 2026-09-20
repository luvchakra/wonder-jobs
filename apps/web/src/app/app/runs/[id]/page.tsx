"use client";
import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useWorkflowStore } from "@/store/workflow";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { STAGES, type StageKey } from "@/domain/workflow/stages";
import { AI_PROVIDERS } from "@/domain/ai/types";
import { AUTOMATION_LEVEL_META } from "@/domain/automation/policy";
import { formatDuration, formatNumber, formatTime, shortId } from "@/lib/format";
import { useNow } from "@/lib/motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Tabs } from "@/components/common/Tabs";
import { Badge } from "@/components/common/Badge";
import { EmptyState } from "@/components/common/States";
import { RunStatusPill } from "@/components/workflow/RunStatusPill";
import { WorkflowTimeline } from "@/components/workflow/WorkflowTimeline";
import { WorkflowControls } from "@/components/workflow/WorkflowControls";
import { StageDetail } from "@/components/workflow/StageDetail";
import { RunErrorBanner } from "@/components/workflow/RunErrorBanner";
import { RunOutcome } from "@/components/workflow/RunOutcome";
import { toast } from "@/components/feedback/Toast";
import { JobCard } from "@/components/jobs/JobCard";
import { APPLICATION_STATUS_META } from "@/domain/applications/types";
import { STATUS_META, isActive } from "@/domain/workflow/status";
import { resolveRunValue } from "@/domain/workflow/resolve";
import { Bot, Square } from "lucide-react";
import { Button } from "@/components/common/Button";
import { getWorkflowService } from "@/services/workflow/service";

type Tab = "progress" | "results" | "logs";

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const run = useWorkflowStore((s) => s.runs[id]);
  const jobs = useJobsStore((s) => s.jobs);
  const matches = useJobsStore((s) => s.matches);
  const quality = useJobsStore((s) => s.quality);
  const saved = useJobsStore((s) => s.saved);
  const save = useJobsStore((s) => s.save);
  const unsave = useJobsStore((s) => s.unsave);
  const applications = useApplicationsStore((s) => s.applications);
  const [tab, setTab] = useState<Tab>("progress");
  // Follows the active stage until the user pins one explicitly.
  const [pinned, setPinned] = useState<StageKey | undefined>(undefined);
  const now = useNow();
  const selected: StageKey | undefined = pinned ?? run?.currentStage ?? run?.stages.find((s) => s.status === "FAILED")?.key ?? run?.stages[0]?.key;

  const rankedIds = useMemo(() => ((run?.outputs.rank?.data.rankedJobIds as string[] | undefined) ?? []).filter((jid) => jobs[jid]).slice(0, 12), [run?.outputs.rank, jobs]);
  const preparedIds = ((run?.outputs.prepare?.data.applicationIds as string[] | undefined) ?? []).filter((aid) => applications[aid]);
  const rankStatus = run?.stages.find((s) => s.key === "rank")?.status;
  const rankDone = rankStatus === "COMPLETED" || rankStatus === "COMPLETED_WITH_WARNINGS";
  const minMatch = run ? (resolveRunValue(run, "minMatchThreshold").value as number | undefined) ?? run.config.minMatchThreshold : 0;

  if (!run) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ href: "/app/runs", label: "Runs" }} title="Run not found" />
        <EmptyState title="This run isn't available" body="It may have been removed from history." action={{ label: "Back to runs", href: "/app/runs" }} />
      </div>
    );
  }

  const act = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      toast.error("That didn't work", e instanceof Error ? e.message : undefined);
    }
  };
  const duration = run.startedAt ? (run.completedAt ? new Date(run.completedAt).getTime() : now) - new Date(run.startedAt).getTime() : null;
  const providerMeta = AI_PROVIDERS[run.config.provider.provider];
  const live = STATUS_META[run.status].label + (run.currentStage ? ` — ${STAGES[run.currentStage].name}` : "");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={{ href: "/app/runs", label: "Runs" }}
        eyebrow={`Wonder Run · ${shortId(run.id)}`}
        title={run.workflowName}
        description={run.status === "RUNNING" ? "Finding the best opportunities for you…" : run.status === "WAITING_FOR_USER" ? "Wonder is waiting for you." : undefined}
        actions={<WorkflowControls run={run} />}
      />
      <p className="wj-sr-only" aria-live="polite" aria-atomic="true">
        {live}
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
        <RunStatusPill status={run.status} />
        <span>·</span>
        <span>{AUTOMATION_LEVEL_META[run.config.automationLevel].label}</span>
        <span>·</span>
        <span>
          {providerMeta.name}
          {run.config.provider.model ? ` (${run.config.provider.model})` : ""}
          {run.config.provider.billing === "byok" ? " · your key" : ""}
        </span>
        {duration != null && (
          <>
            <span>·</span>
            <span>{formatDuration(duration)}</span>
          </>
        )}
        {run.parentRunId && (
          <>
            <span>·</span>
            <Link href={`/app/runs/${run.parentRunId}`} className="text-brand-600 hover:underline">
              Rerun of {shortId(run.parentRunId)}
            </Link>
          </>
        )}
        {run.silent && <Badge>Quiet outcome</Badge>}
      </div>

      {run.error && <RunErrorBanner run={run} error={run.error} className="mb-4" />}
      <RunOutcome run={run} onShowResults={() => setTab("results")} className="mb-4" />

      <Tabs value={tab} onChange={setTab} label="Run sections" items={[{ value: "progress", label: "Progress" }, { value: "results", label: "Results" }, { value: "logs", label: "Logs", count: run.events.length }]} className="mb-4" />

      {tab === "progress" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card>
            <WorkflowTimeline
              run={run}
              selectedStage={selected}
              onSelectStage={(k) => setPinned(k)}
            />
          </Card>
          <Card>{selected ? <StageDetail run={run} stageKey={selected} /> : <p className="text-sm text-ink-3">Select a stage to see details.</p>}</Card>
        </div>
      )}

      {tab === "results" && (
        <div className="flex flex-col gap-5">
          <Card padding="none" className="grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
            {[
              ["Jobs discovered", run.summary.jobsDiscovered],
              ["Unique opportunities", run.summary.jobsRetained],
              ["Strong matches", run.summary.strongMatches],
              ["Applications prepared", run.summary.applicationsPrepared],
            ].map(([l, v]) => (
              <div key={l} className="p-4">
                <p className="text-[22px] font-semibold tracking-tight text-ink">{formatNumber(v as number)}</p>
                <p className="text-[12px] text-ink-3">{l}</p>
              </div>
            ))}
          </Card>
          <section>
            <h2 className="mb-3 text-[17px] font-semibold text-ink">Shortlist</h2>
            {rankedIds.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rankedIds.map((jid) => (
                  <JobCard key={jid} job={jobs[jid]} match={matches[jid]} quality={quality[jid]} saved={!!saved[jid]} onToggleSave={() => (saved[jid] ? unsave(jid) : save(jid))} />
                ))}
              </div>
            ) : (
              <EmptyState
                title={rankDone ? "Nothing made the shortlist" : "No shortlist yet"}
                body={run.status === "RUNNING" ? "Results appear once ranking completes." : rankDone ? `None of the ${formatNumber(run.summary.jobsRetained || run.summary.jobsDiscovered)} jobs scored above your minimum match of ${minMatch}.` : "This run didn't reach the ranking stage."}
                action={rankDone ? { label: "Browse all jobs", href: "/app/jobs" } : undefined}
              />
            )}
          </section>
          <section>
            <h2 className="mb-3 text-[17px] font-semibold text-ink">Prepared applications</h2>
            {preparedIds.length ? (
              <ul className="flex flex-col gap-2">
                {preparedIds.map((aid) => {
                  const a = applications[aid];
                  const job = jobs[a.jobId];
                  return (
                    <li key={aid}>
                      <Link href={`/app/applications/${aid}/prepare`} className="wj-card flex items-center justify-between gap-3 p-4 text-[14px] hover:bg-surface-2">
                        <span className="min-w-0 truncate">
                          <span className="font-medium text-ink">{job?.title}</span> <span className="text-ink-3">· {job?.company}</span>
                        </span>
                        <Badge tone={APPLICATION_STATUS_META[a.status].tone}>{APPLICATION_STATUS_META[a.status].label}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="Nothing prepared in this run" body="Materials are prepared for the top of the shortlist once a run reaches that stage. You can still prepare any shortlisted role yourself from its page." />
            )}
          </section>
        </div>
      )}

      {tab === "logs" && (
        <Card>
          <ol className="flex flex-col gap-2 text-[13px]" aria-label="Run log">
            {[...run.events].reverse().map((e) => (
              <li key={e.id} className="flex gap-3 rounded-[10px] px-2 py-1.5 hover:bg-surface-2">
                <span className="w-[72px] shrink-0 font-mono text-[11px] text-ink-4">{formatTime(e.at)}</span>
                <span className="w-[130px] shrink-0 truncate text-ink-3">{e.stageKey ? STAGES[e.stageKey].name : "Run"}</span>
                <span className="min-w-0 flex-1 text-ink-2">{e.message}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {isActive(run.status) && (
        <div className="fixed inset-x-4 bottom-20 z-30 md:hidden">
          <div className="wj-card flex items-center gap-3 p-3 shadow-lg" role="status">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-white">
              <Bot className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink">{run.status === "WAITING_FOR_USER" ? "Wonder needs your input" : run.status === "PAUSED" ? "Paused" : "Wonder is working…"}</span>
              <span className="block truncate text-[12px] text-ink-3">{run.status === "WAITING_FOR_USER" ? "Review, then continue." : run.status === "PAUSED" ? "Resume when you're ready." : "This may take a few minutes."}</span>
            </span>
            {run.status === "WAITING_FOR_USER" ? (
              <Button size="sm" onClick={() => act(() => getWorkflowService().continue(run.id))}>
                Continue
              </Button>
            ) : run.status === "PAUSED" ? (
              <Button size="sm" onClick={() => act(() => getWorkflowService().resume(run.id))}>
                Resume
              </Button>
            ) : (
              <Button size="sm" variant="outline" icon={<Square className="size-3.5" aria-hidden />} disabled={run.status === "STOPPING"} onClick={() => act(() => getWorkflowService().stop(run.id))}>
                Stop
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
