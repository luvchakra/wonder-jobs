import { STATUS_META, type RunStatus } from "@/domain/workflow/status";
import { StatusPill } from "@/components/common/Badge";

export function RunStatusPill({ status, className }: { status: RunStatus; className?: string }) {
  const m = STATUS_META[status];
  return <StatusPill tone={m.tone} label={m.label} pulse={status === "RUNNING"} className={className} />;
}
