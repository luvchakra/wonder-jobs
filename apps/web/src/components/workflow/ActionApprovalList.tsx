"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import type { WorkflowRun } from "@/domain/workflow/types";
import { getWorkflowService } from "@/services/workflow/service";
import { Badge, type Tone } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import { formatTime } from "@/lib/format";

const STATUS: Record<WorkflowRun["actions"][number]["status"], { label: string; tone: Tone }> = {
  pending_confirmation: { label: "Needs your approval", tone: "info" },
  confirmed: { label: "Approved", tone: "success" },
  executing: { label: "Executing", tone: "brand" },
  succeeded: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  skipped_duplicate: { label: "Already done — skipped", tone: "neutral" },
  rejected: { label: "Declined", tone: "neutral" },
};

/** External actions with confirmation, idempotency and execution history (spec §11). */
export function ActionApprovalList({ run }: { run: WorkflowRun }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  if (!run.actions.length) return null;
  const svc = getWorkflowService();
  const confirmedAction = run.actions.find((a) => a.id === confirming);
  const approve = (actionId: string) => {
    try {
      svc.confirmAction(run.id, actionId);
    } catch (e) {
      toast.error("Couldn't approve", e instanceof Error ? e.message : undefined);
    }
  };
  const decline = (actionId: string) => {
    try {
      svc.rejectAction(run.id, actionId);
    } catch (e) {
      toast.error("Couldn't decline", e instanceof Error ? e.message : undefined);
    }
  };
  return (
    <div>
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">External actions</p>
      <ul className="flex flex-col gap-2">
        {run.actions.map((a) => (
          <li key={a.id} className="rounded-[14px] border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">{a.label}</p>
                <p className="text-[11px] text-ink-4">
                  Key {a.idempotencyKey} · {a.attempts} attempt{a.attempts === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                {a.status === "pending_confirmation" && (
                  <>
                    <Button
                      size="sm"
                      icon={<Check className="size-3.5" aria-hidden />}
                      onClick={() => (a.stageKey === "apply" ? setConfirming(a.id) : approve(a.id))}
                    >
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" icon={<X className="size-3.5" aria-hidden />} onClick={() => decline(a.id)}>
                      Decline
                    </Button>
                  </>
                )}
              </div>
            </div>
            {a.error && <p className="mt-2 text-[12px] text-danger-600">{a.error}</p>}
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] font-medium text-ink-3">History</summary>
              <ul className="mt-1 text-[11px] text-ink-3">
                {a.history.map((h, i) => (
                  <li key={i}>
                    {formatTime(h.at)} — {h.event}
                    {h.detail ? ` · ${h.detail}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
      <Modal
        open={!!confirmedAction}
        onClose={() => setConfirming(null)}
        title="Submit this application?"
        description={confirmedAction ? `“${confirmedAction.label}” submits your application on the employer's site. This can't be undone from here.` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (confirmedAction) approve(confirmedAction.id);
                setConfirming(null);
              }}
            >
              Submit application
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Decline instead if you want to edit the materials or skip this employer.</p>
      </Modal>
    </div>
  );
}
