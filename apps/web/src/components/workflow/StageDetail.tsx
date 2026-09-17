"use client";
import Link from "next/link";
import type { WorkflowRun } from "@/domain/workflow/types";
import { STAGES, type StageKey } from "@/domain/workflow/stages";
import { STATUS_META } from "@/domain/workflow/status";
import { CAPABILITY_META } from "@/domain/automation/policy";
import { formatDuration, formatNumber, formatTime } from "@/lib/format";
import { useNow } from "@/lib/motion";
import { Badge } from "@/components/common/Badge";
import { RunErrorBanner } from "./RunErrorBanner";
import { OverrideEditor } from "./OverrideEditor";
import { ActionApprovalList } from "./ActionApprovalList";
import { StageStatusIcon } from "./StageStatusIcon";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { APPLICATION_STATUS_META } from "@/domain/applications/types";

/** Everything the product may show about a stage: status, progress, counts, evidence, warnings, errors, inputs. Never model reasoning. */
export function StageDetail({ run, stageKey }: { run: WorkflowRun; stageKey: StageKey }) {
  const stage = run.stages.find((s) => s.key === stageKey);
  const applications = useApplicationsStore((s) => s.applications);
  const jobs = useJobsStore((s) => s.jobs);
  const now = useNow();
  if (!stage) return null;
  const def = STAGES[stageKey];
  const duration = stage.startedAt ? (stage.completedAt ? new Date(stage.completedAt).getTime() : now) - new Date(stage.startedAt).getTime() : null;
  const riskTone = { low: "success", medium: "warning", high: "danger" } as const;
  const preparedIds = stageKey === "review" || stageKey === "prepare" ? (run.outputs.prepare?.data.applicationIds as string[] | undefined) ?? [] : [];
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
            {Object.entries(stage.counts).map(([k, v]) => (
              <div key={k} className="rounded-[12px] bg-surface-2 p-3">
                <p className="text-[18px] font-semibold tracking-tight text-ink">{formatNumber(v)}</p>
                <p className="text-[11px] capitalize text-ink-3">{k.replace(/_/g, " ")}</p>
              </div>
            ))}
          </div>
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
