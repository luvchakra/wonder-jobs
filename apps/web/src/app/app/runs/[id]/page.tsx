"use client";
import { use, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bot, ChevronDown, ChevronUp, Square } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { STAGES, type StageKey } from "@/domain/workflow/stages";
import { AI_PROVIDERS } from "@/domain/ai/types";
import { AUTOMATION_LEVEL_META } from "@/domain/automation/policy";
import { APPLICATION_STATUS_META } from "@/domain/applications/types";
import { STATUS_META, isActive, isTerminal } from "@/domain/workflow/status";
import { resolveRunValue } from "@/domain/workflow/resolve";
import { describeRun, previousFinishedRun } from "@/domain/experience/orchestrator";
import { formatDuration, formatNumber, formatTime, relativeTime, shortId } from "@/lib/format";
import { useNow } from "@/lib/motion";
import { track } from "@/lib/analytics";
import { getWorkflowService } from "@/services/workflow/service";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/States";
import { RunStatusPill } from "@/components/workflow/RunStatusPill";
import { WorkflowTimeline } from "@/components/workflow/WorkflowTimeline";
import { WorkflowControls } from "@/components/workflow/WorkflowControls";
import { StageDetail } from "@/components/workflow/StageDetail";
import { RunErrorBanner } from "@/components/workflow/RunErrorBanner";
import { ActionApprovalList } from "@/components/workflow/ActionApprovalList";
import { RunExperience } from "@/components/experience/RunExperience";
import { JobCard } from "@/components/jobs/JobCard";
import { toast } from "@/components/feedback/Toast";

/**
 * One search, in the candidate's terms (outcome spec §6–7, §23–26): what Wonder is doing or found,
 * what it needs, and what to do next. The 12-stage machinery — timeline, per-stage evidence,
 * overrides, provenance, actions, log, provider — is one click down under "See how Wonder worked",
 * not deleted.
 */
export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const run = useWorkflowStore((s) => s.runs[id]);
  const runs = useWorkflowStore((s) => s.runs);
  const jobs = useJobsStore((s) => s.jobs);
  const matches = useJobsStore((s) => s.matches);
  const quality = useJobsStore((s) => s.quality);
  const saved = useJobsStore((s) => s.saved);
  const save = useJobsStore((s) => s.save);
  const unsave = useJobsStore((s) => s.unsave);
  const applications = useApplicationsStore((s) => s.applications);
  const [advanced, setAdvanced] = useState(false);
  const [pinned, setPinned] = useState<StageKey | undefined>(undefined);
  const resultsRef = useRef<HTMLElement>(null);
  const now = useNow();

  const previous = useMemo(() => (run ? previousFinishedRun(run, runs) : undefined), [run, runs]);
  const rankedIds = useMemo(() => ((run?.outputs.rank?.data.rankedJobIds as string[] | undefined) ?? []).filter((jid) => jobs[jid]).slice(0, 12), [run?.outputs.rank, jobs]);

  if (!run) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader back={{ href: "/app/runs", label: "Search history" }} title="Search not found" />
        <EmptyState title="This search isn't available" body="It may have been removed from your history." action={{ label: "See search history", href: "/app/runs" }} />
      </div>
    );
  }

  const selected: StageKey | undefined = pinned ?? run.currentStage ?? run.stages.find((s) => s.status === "FAILED")?.key ?? run.stages[0]?.key;
  const preparedIds = ((run.outputs.prepare?.data.applicationIds as string[] | undefined) ?? []).filter((aid) => applications[aid]);
  const rankStatus = run.stages.find((s) => s.key === "rank")?.status;
  const rankDone = rankStatus === "COMPLETED" || rankStatus === "COMPLETED_WITH_WARNINGS";
  const minMatch = (resolveRunValue(run, "minMatchThreshold").value as number | undefined) ?? run.config.minMatchThreshold;
  const experience = describeRun(run, previous);
  const pendingDecisions = run.actions.some((a) => a.status === "pending_confirmation");
  // Nothing to shortlist when nothing was found — the outcome card already says so.
  const showResults = rankDone || preparedIds.length > 0 || (isTerminal(run.status) && run.summary.jobsDiscovered > 0);
  const duration = run.startedAt ? (run.completedAt ? new Date(run.completedAt).getTime() : now) - new Date(run.startedAt).getTime() : null;
  const providerMeta = AI_PROVIDERS[run.config.provider.provider];
  const request = run.config.careerGoal.trim() || run.workflowName.replace(/^(Search|Job Search) — /, "");

  const scrollToResults = () => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const act = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      toast.error("That didn't work", e instanceof Error ? e.message : undefined);
    }
  };
  const toggleAdvanced = () => {
    setAdvanced((v) => {
      if (!v) track("why_viewed", { runId: run.id, surface: "see_how_wonder_worked" });
      return !v;
    });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader back={{ href: "/app/runs", label: "Search history" }} eyebrow={`${run.trigger === "schedule" ? "Scheduled search" : "Search"} · ${relativeTime(run.startedAt ?? run.createdAt)}`} title={`“${request}”`} />
      <p className="wj-sr-only" aria-live="polite" aria-atomic="true">
        {experience.title}. {experience.summary}
      </p>

      {/* An empty search is fully explained by the card below; the banner is for real breakdowns. */}
      {run.error && !(run.summary.jobsDiscovered === 0 && run.error.category === "user_action_required") && <RunErrorBanner run={run} error={run.error} className="mb-4" />}
      <RunExperience run={run} previous={previous} onShowResults={scrollToResults} className="mb-4" />

      {pendingDecisions && (
        <Card className="mb-4">
          <ActionApprovalList run={run} />
        </Card>
      )}

      {showResults && (
        <section ref={resultsRef} aria-labelledby="run-results" className="mb-6 flex flex-col gap-5 scroll-mt-20">
          <div>
            <h2 id="run-results" className="mb-3 text-[17px] font-semibold text-ink">
              Worth your attention
            </h2>
            {rankedIds.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rankedIds.map((jid) => (
                  <JobCard key={jid} job={jobs[jid]} match={matches[jid]} quality={quality[jid]} saved={!!saved[jid]} onToggleSave={() => (saved[jid] ? unsave(jid) : save(jid))} />
                ))}
              </div>
            ) : (
              <EmptyState
                title={rankDone ? "Nothing made the shortlist" : "No shortlist yet"}
                body={run.status === "RUNNING" ? "The shortlist appears once Wonder has compared everything with your profile." : rankDone ? `None of the ${formatNumber(run.summary.jobsRetained || run.summary.jobsDiscovered)} jobs scored above your minimum match of ${minMatch}.` : "This search stopped before Wonder could put a shortlist together."}
                action={rankDone ? { label: "Browse all jobs", href: "/app/jobs" } : undefined}
              />
            )}
          </div>
          {(preparedIds.length > 0 || run.stages.some((s) => s.key === "prepare")) && (
            <div>
              <h2 className="mb-3 text-[17px] font-semibold text-ink">Application packs</h2>
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
                <EmptyState title="No application packs from this search" body="You can prepare an Application Pack for any shortlisted role from its page." />
              )}
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="how-wonder-worked" className="mb-6">
        <button type="button" onClick={toggleAdvanced} aria-expanded={advanced} aria-controls="how-wonder-worked-panel" className="flex w-full items-center justify-between rounded-[16px] border border-line bg-surface px-4 py-3 text-left hover:bg-surface-2">
          <span>
            <span id="how-wonder-worked" className="block text-[15px] font-semibold text-ink">
              See how Wonder worked
            </span>
            <span className="block text-[12px] text-ink-3">Sources, each step&apos;s evidence, what you changed, AI provider, decisions and the full log.</span>
          </span>
          {advanced ? <ChevronUp className="size-4 text-ink-3" aria-hidden /> : <ChevronDown className="size-4 text-ink-3" aria-hidden />}
        </button>

        {advanced && (
          <div id="how-wonder-worked-panel" className="mt-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
              <RunStatusPill status={run.status} />
              <span>·</span>
              <span>{AUTOMATION_LEVEL_META[run.config.automationLevel].label}</span>
              <span>·</span>
              <span>
                {providerMeta.name}
                {run.config.provider.model ? ` (${run.config.provider.model})` : ""}
                {run.config.provider.billing === "byok" ? " · your key" : " · included in your plan"}
              </span>
              {duration != null && (
                <>
                  <span>·</span>
                  <span>{formatDuration(duration)}</span>
                </>
              )}
              <span>·</span>
              <span className="font-mono">{shortId(run.id)}</span>
              {run.parentRunId && (
                <>
                  <span>·</span>
                  <Link href={`/app/runs/${run.parentRunId}`} className="text-brand-600 hover:underline">
                    Rerun of {shortId(run.parentRunId)}
                    {run.rerunFromStage ? ` from “${STAGES[run.rerunFromStage].name}”` : ""}
                  </Link>
                </>
              )}
              {run.silent && <Badge>Quiet outcome</Badge>}
            </div>
            <p className="text-[12px] text-ink-3">
              Searched <span className="font-medium text-ink-2">“{run.config.searchCriteria.query}”</span>
              {run.config.searchCriteria.locations.length ? ` in ${run.config.searchCriteria.locations.join(", ")}` : ""} across {run.config.sourceIds.length} live source{run.config.sourceIds.length === 1 ? "" : "s"}, minimum match {minMatch}.
            </p>

            <Card padding="none" className="grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
              {[
                ["Jobs discovered", run.summary.jobsDiscovered],
                ["Unique opportunities", run.summary.jobsRetained],
                ["Strong on the shortlist", run.summary.strongMatches],
                ["Applications prepared", run.summary.applicationsPrepared],
              ].map(([l, v]) => (
                <div key={l} className="p-4">
                  <p className="text-[22px] font-semibold tracking-tight text-ink">{formatNumber(v as number)}</p>
                  <p className="text-[12px] text-ink-3">{l}</p>
                </div>
              ))}
            </Card>

            <WorkflowControls run={run} advanced />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
              <Card>
                <WorkflowTimeline run={run} selectedStage={selected} onSelectStage={(k) => setPinned(k)} />
              </Card>
              <Card>{selected ? <StageDetail run={run} stageKey={selected} /> : <p className="text-sm text-ink-3">Select a step to see details.</p>}</Card>
            </div>

            {!pendingDecisions && run.actions.length > 0 && (
              <Card>
                <ActionApprovalList run={run} />
              </Card>
            )}

            <Card>
              <h3 className="mb-2 text-[13px] font-semibold text-ink">Log</h3>
              <ol className="flex flex-col gap-2 text-[13px]" aria-label="Run log">
                {[...run.events].reverse().map((e) => (
                  <li key={e.id} className="flex gap-3 rounded-[10px] px-2 py-1.5 hover:bg-surface-2">
                    <span className="w-[72px] shrink-0 font-mono text-[11px] text-ink-4">{formatTime(e.at)}</span>
                    <span className="hidden w-[130px] shrink-0 truncate text-ink-3 sm:block">{e.stageKey ? STAGES[e.stageKey].name : "Run"}</span>
                    <span className="min-w-0 flex-1 text-ink-2">{e.message}</span>
                  </li>
                ))}
              </ol>
            </Card>
            <p className="text-[11px] text-ink-4">Technical status: {STATUS_META[run.status].label}.</p>
          </div>
        )}
      </section>

      {isActive(run.status) && (
        <>
          {/* In-flow twin of the fixed card below reserves its real height so content clears it. */}
          <div aria-hidden className="invisible mt-4 md:hidden">
            <div className="flex items-center gap-3 p-3">
              <span className="size-10 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">Wonder needs your input</span>
                <span className="block truncate text-[12px]">Review, then continue.</span>
              </span>
              <Button size="sm" tabIndex={-1}>
                Continue
              </Button>
            </div>
          </div>
          <div className="fixed inset-x-4 bottom-[calc(var(--wj-mobile-nav-h)+1rem)] z-30 md:hidden">
            <div className="wj-card flex items-center gap-3 p-3 shadow-lg">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                <Bot className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-ink">{experience.title}</span>
                <span className="block truncate text-[12px] text-ink-3">{run.status === "WAITING_FOR_USER" ? "Review, then continue." : run.status === "PAUSED" ? "Continue when you're ready." : experience.summary}</span>
              </span>
              {run.status === "WAITING_FOR_USER" ? (
                <Button size="sm" onClick={() => act(() => getWorkflowService().continue(run.id))} aria-label="Continue the search">
                  Continue
                </Button>
              ) : run.status === "PAUSED" ? (
                <Button size="sm" onClick={() => act(() => getWorkflowService().resume(run.id))} aria-label="Continue the search">
                  Continue
                </Button>
              ) : (
                <Button size="sm" variant="outline" icon={<Square className="size-3.5" aria-hidden />} disabled={run.status === "STOPPING"} onClick={() => act(() => getWorkflowService().stop(run.id))} aria-label="Stop the search">
                  Stop
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
