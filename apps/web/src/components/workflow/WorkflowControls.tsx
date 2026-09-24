"use client";
import { useState } from "react";
import { Pause, Play, RotateCcw, Square, ListRestart } from "lucide-react";
import type { WorkflowRun } from "@/domain/workflow/types";
import { STAGES, STAGE_KEYS, type StageKey } from "@/domain/workflow/stages";
import { isTerminal } from "@/domain/workflow/status";
import { getWorkflowService } from "@/services/workflow/service";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Select, Field } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { useRouter } from "next/navigation";

/**
 * Pause / Resume / Stop / Restart current stage / Rerun from stage (spec §9). `advanced` renders only
 * the stage-level controls, for "See how Wonder worked" — the candidate-facing pause/continue/stop
 * live on the run's outcome card, so they're never shown twice.
 */
export function WorkflowControls({ run, className, advanced = false }: { run: WorkflowRun; className?: string; advanced?: boolean }) {
  const router = useRouter();
  const svc = getWorkflowService();
  const [rerunOpen, setRerunOpen] = useState(false);
  const [from, setFrom] = useState<StageKey>(run.rerunFromStage ?? run.currentStage ?? "search");
  const terminal = isTerminal(run.status);
  const pendingActions = run.actions.filter((a) => a.status === "pending_confirmation" && a.stageKey === run.currentStage).length;
  const act = (fn: () => void, msg?: string) => {
    try {
      fn();
      if (msg) toast.info(msg);
    } catch (e) {
      toast.error("That didn't work", e instanceof Error ? e.message : undefined);
    }
  };
  const rerun = () => {
    try {
      const child = svc.rerunFrom(run.id, from);
      setRerunOpen(false);
      toast.success(`Rerunning from “${STAGES[from].name}”`, "Earlier results are reused; external actions are never repeated.");
      router.push(`/app/runs/${child.id}`);
    } catch (e) {
      toast.error("Couldn't rerun", e instanceof Error ? e.message : undefined);
    }
  };
  const candidates = STAGE_KEYS.filter((k) => run.stages.some((s) => s.key === k));
  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        {!advanced && run.status === "RUNNING" && (
          <Button size="sm" variant="outline" icon={<Pause className="size-3.5" aria-hidden />} onClick={() => act(() => svc.pause(run.id), "Paused")}>
            Pause
          </Button>
        )}
        {!advanced && run.status === "PAUSED" && (
          <Button size="sm" icon={<Play className="size-3.5" aria-hidden />} onClick={() => act(() => svc.resume(run.id), "Resumed")}>
            Resume
          </Button>
        )}
        {!advanced && run.status === "WAITING_FOR_USER" && (
          <Button size="sm" icon={<Play className="size-3.5" aria-hidden />} onClick={() => act(() => svc.continue(run.id))}>
            {pendingActions ? `Continue without ${pendingActions} pending` : "Continue"}
          </Button>
        )}
        {!terminal && run.status !== "PENDING" && (
          <>
            <Button size="sm" variant="outline" icon={<RotateCcw className="size-3.5" aria-hidden />} disabled={run.status === "STOPPING"} onClick={() => act(() => svc.restartStage(run.id), "Restarting the current stage")}>
              Restart stage
            </Button>
            {!advanced && (
              <Button size="sm" variant="danger" icon={<Square className="size-3.5" aria-hidden />} disabled={run.status === "STOPPING"} onClick={() => act(() => svc.stop(run.id), "Stopping — finishing the current step safely")}>
                Stop
              </Button>
            )}
          </>
        )}
        {!advanced && run.status === "PENDING" && (
          <Button size="sm" variant="danger" onClick={() => act(() => svc.cancel(run.id), "Cancelled")}>
            Cancel
          </Button>
        )}
        {terminal && (
          <Button size="sm" variant="outline" icon={<ListRestart className="size-3.5" aria-hidden />} onClick={() => setRerunOpen(true)}>
            Rerun from stage
          </Button>
        )}
      </div>
      {!advanced && run.status === "WAITING_FOR_USER" && !!pendingActions && (
        <p className="mt-2 text-[12px] text-warning-600">Continuing now records {pendingActions} pending approval{pendingActions === 1 ? "" : "s"} as not approved — they won&apos;t be submitted.</p>
      )}
      <Modal
        open={rerunOpen}
        onClose={() => setRerunOpen(false)}
        title="Rerun from a stage"
        description="Everything before the chosen stage is reused as-is — inputs, provider, your overrides and results. Applications already submitted are never submitted again."
        footer={
          <>
            <Button variant="outline" onClick={() => setRerunOpen(false)}>
              Cancel
            </Button>
            <Button onClick={rerun}>Rerun</Button>
          </>
        }
      >
        <Field label="Start from" htmlFor="rerun-from">
          <Select id="rerun-from" value={from} onChange={(e) => setFrom(e.target.value as StageKey)}>
            {candidates.map((k) => (
              <option key={k} value={k}>
                {STAGES[k].name}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>
    </div>
  );
}
