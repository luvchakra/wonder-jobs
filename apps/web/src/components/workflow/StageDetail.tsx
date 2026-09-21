"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { WorkflowRun } from "@/domain/workflow/types";
import { STAGES, type StageKey } from "@/domain/workflow/stages";
import { STATUS_META } from "@/domain/workflow/status";
import { CAPABILITY_META } from "@/domain/automation/policy";
import { formatDuration, formatNumber, formatTime } from "@/lib/format";
import { useNow } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/common/Badge";
import { RunErrorBanner } from "./RunErrorBanner";
import { OverrideEditor } from "./OverrideEditor";
import { ActionApprovalList } from "./ActionApprovalList";
import { StageStatusIcon } from "./StageStatusIcon";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { APPLICATION_STATUS_META } from "@/domain/applications/types";

/**
 * Which count keys on which stages have real, resolvable detail behind them, and how to render it.
 * Only wired for keys with an actual id list or breakdown in that stage's own output — never a
 * count made clickable with nothing real to show underneath it.
 */
const COUNT_DETAIL: Partial<Record<StageKey, Record<string, true>>> = {
  search: { discovered: true, sources: true },
};

/** Everything the product may show about a stage: status, progress, counts, evidence, warnings, errors, inputs. Never model reasoning. */
export function StageDetail({ run, stageKey }: { run: WorkflowRun; stageKey: StageKey }) {
  const stage = run.stages.find((s) => s.key === stageKey);
  const applications = useApplicationsStore((s) => s.applications);
  const jobs = useJobsStore((s) => s.jobs);
  const allSources = useJobsStore((s) => s.sources);
  const now = useNow();
  const [expandedCount, setExpandedCount] = useState<string | null>(null);
  if (!stage) return null;
  const def = STAGES[stageKey];
  const duration = stage.startedAt ? (stage.completedAt ? new Date(stage.completedAt).getTime() : now) - new Date(stage.startedAt).getTime() : null;
  const riskTone = { low: "success", medium: "warning", high: "danger" } as const;
  const preparedIds = stageKey === "review" || stageKey === "prepare" ? (run.outputs.prepare?.data.applicationIds as string[] | undefined) ?? [] : [];

  const searchData = stageKey === "search" ? (run.outputs.search?.data as { jobIds?: string[]; perSource?: Record<string, number> } | undefined) : undefined;
  const discoveredJobs = (searchData?.jobIds ?? []).map((id) => jobs[id]).filter((j) => !!j);
  const searchedSourceIds = run.config.sourceIds.length ? run.config.sourceIds : allSources.filter((s) => s.enabled).map((s) => s.id);
  const searchedSources = allSources.filter((s) => searchedSourceIds.includes(s.id));
  const rankDone = ["COMPLETED", "COMPLETED_WITH_WARNINGS"].includes(run.stages.find((s) => s.key === "rank")?.status ?? "");
  const detailKeys = COUNT_DETAIL[stageKey];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <StageStatusIcon status={stage.status} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-semibold text-ink">{def.name}</h3>
            <Badge tone={STATUS_META[stage.status].tone}>{STATUS_META[stage.status].label}</Badge>
            <Badge tone={riskTone[def.risk]}>{def.risk} risk</Badge>
            {stage.inheritedFromRunId && <Badge tone="info">Reused from earlier run</Badge>}
          </div>
          <p className="mt-1 text-[13px] text-ink-3">
            {stage.startedAt ? `Started ${formatTime(stage.startedAt)}` : "Not started"}
            {duration != null ? ` · ${formatDuration(duration)}` : ""}
            {stage.attempt > 1 ? ` · attempt ${stage.attempt}` : ""}
          </p>
          {def.capabilities.length > 0 && <p className="mt-1 text-[12px] text-ink-4">Uses: {def.capabilities.map((c) => CAPABILITY_META[c].label).join(", ")}</p>}
        </div>
      </div>

      {stage.error && stage.status === "FAILED" && <RunErrorBanner run={run} error={stage.error} />}
      {stage.status === "WAITING_FOR_USER" && stage.waitingReason && (
        <div className="rounded-[14px] border border-info-600/20 bg-info-100/60 p-4 text-[13px] text-ink-2" role="status">
          {stage.waitingReason}
        </div>
      )}

      {(stage.progress.total != null || stage.progress.current > 0) && (
        <div>
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-3">Progress</p>
          <p className="text-[14px] text-ink">
            {formatNumber(stage.progress.current)}
            {stage.progress.total != null ? ` / ${formatNumber(stage.progress.total)}` : ""} {stage.progress.unit}
          </p>
        </div>
      )}

      {Object.keys(stage.counts).length > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">Counts</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(stage.counts).map(([k, v]) =>
              detailKeys?.[k] ? (
                <button
                  key={k}
                  type="button"
                  onClick={() => setExpandedCount((cur) => (cur === k ? null : k))}
                  aria-expanded={expandedCount === k}
                  className={cn("rounded-[12px] p-3 text-left transition-colors", expandedCount === k ? "bg-brand-50 ring-1 ring-brand-200" : "bg-surface-2 hover:bg-bg-soft")}
                >
                  <span className="flex items-center gap-1">
                    <span className="text-[18px] font-semibold tracking-tight text-ink">{formatNumber(v)}</span>
                    {expandedCount === k ? <ChevronUp className="size-3.5 text-ink-4" aria-hidden /> : <ChevronDown className="size-3.5 text-ink-4" aria-hidden />}
                  </span>
                  <span className="block text-[11px] capitalize text-ink-3">{k.replace(/_/g, " ")}</span>
                </button>
              ) : (
                <div key={k} className="rounded-[12px] bg-surface-2 p-3">
                  <p className="text-[18px] font-semibold tracking-tight text-ink">{formatNumber(v)}</p>
                  <p className="text-[11px] capitalize text-ink-3">{k.replace(/_/g, " ")}</p>
                </div>
              ),
            )}
          </div>

          {stageKey === "search" && expandedCount === "discovered" && (
            <div className="mt-2 rounded-[14px] border border-line p-2">
              {discoveredJobs.length ? (
                <ul className="flex flex-col gap-0.5">
                  {discoveredJobs.map((j) => (
                    <li key={j.id}>
                      <Link href={`/app/jobs/${j.id}`} className="block min-w-0 truncate rounded-[10px] px-2 py-1.5 text-[13px] hover:bg-bg-soft">
                        <span className="font-medium text-ink">{j.title}</span> <span className="text-ink-3">· {j.company}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-1.5 text-[12px] text-ink-3">
                  {(searchData?.jobIds?.length ?? 0) === 0
                    ? "No jobs discovered."
                    : rankDone
                      ? "These didn't carry through past deduplication, so there's nothing to show for them."
                      : "Job details will appear here once ranking finishes."}
                </p>
              )}
            </div>
          )}

          {stageKey === "search" && expandedCount === "sources" && (
            <div className="mt-2 rounded-[14px] border border-line p-2">
              <ul className="flex flex-col gap-0.5">
                {searchedSources.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 rounded-[10px] px-2 py-1.5 text-[13px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                      <span className="truncate text-ink-2">{s.name}</span>
                    </span>
                    <span className="shrink-0 text-ink-3">{formatNumber(searchData?.perSource?.[s.id] ?? 0)} jobs</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {stage.evidence.length > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">Evidence</p>
          <ul className="divide-y divide-line rounded-[14px] border border-line">
            {stage.evidence.map((e, i) => (
              <li key={i} className="flex items-start justify-between gap-3 p-3 text-[13px]">
                <span className="text-ink-2">{e.label}</span>
                <span className={`text-right font-medium ${e.tone === "success" ? "text-success-600" : e.tone === "danger" ? "text-danger-600" : e.tone === "warning" ? "text-warning-600" : e.tone === "info" ? "text-info-600" : "text-ink"}`}>{e.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stage.warnings.length > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">Warnings</p>
          <ul className="flex flex-col gap-1.5">
            {stage.warnings.map((w, i) => (
              <li key={i} className="rounded-[12px] bg-warning-100 px-3 py-2 text-[13px] text-warning-600">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preparedIds.length > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">Prepared applications</p>
          <ul className="flex flex-col gap-2">
            {preparedIds.map((id) => {
              const a = applications[id];
              if (!a) return null;
              const job = jobs[a.jobId];
              return (
                <li key={id}>
                  <Link href={`/app/applications/${id}/prepare`} className="flex items-center justify-between gap-3 rounded-[12px] border border-line p-3 text-[13px] hover:bg-bg-soft">
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-ink">{job?.title ?? "Role"}</span> <span className="text-ink-3">· {job?.company}</span>
                    </span>
                    <Badge tone={APPLICATION_STATUS_META[a.status].tone}>{APPLICATION_STATUS_META[a.status].label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {stageKey === "apply" && <ActionApprovalList run={run} />}
      <OverrideEditor run={run} stageKey={stageKey} />
    </div>
  );
}
