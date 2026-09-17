"use client";
import { useState } from "react";
import { Pencil, Undo2 } from "lucide-react";
import type { WorkflowRun } from "@/domain/workflow/types";
import { EDITABLE_INPUTS, PROVENANCE_META, resolveRunValue } from "@/domain/workflow/resolve";
import { STAGE_ORDER, type StageKey } from "@/domain/workflow/stages";
import { getWorkflowService } from "@/services/workflow/service";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";

function display(v: unknown) {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "number") return v.toLocaleString("en-IN");
  return String(v);
}

/** Inspect and override stage inputs; every value carries provenance (spec §10). */
export function OverrideEditor({ run, stageKey }: { run: WorkflowRun; stageKey: StageKey }) {
  const items = EDITABLE_INPUTS.filter((i) => i.stage === stageKey);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  if (!items.length) return null;
  const stage = run.stages.find((s) => s.key === stageKey);
  const completed = stage && (stage.status === "COMPLETED" || stage.status === "COMPLETED_WITH_WARNINGS");
  const laterThanCurrent = run.currentStage ? STAGE_ORDER[stageKey] > STAGE_ORDER[run.currentStage] : false;
  const save = (key: string, kind: "text" | "list" | "number", label: string) => {
    const value = kind === "list" ? draft.split(",").map((s) => s.trim()).filter(Boolean) : kind === "number" ? Number(draft.replace(/[^\d.]/g, "")) : draft.trim();
    if (kind === "number" && Number.isNaN(value as number)) return toast.error("Enter a number");
    getWorkflowService().override(run.id, { stageKey, key, label, value });
    setEditing(null);
    toast.success(`${label} updated`, completed && !laterThanCurrent ? "Rerun from this stage to apply it to later results." : "Wonder will use your value from here on.");
  };
  return (
    <div>
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">Inputs &amp; overrides</p>
      <ul className="divide-y divide-line rounded-[14px] border border-line">
        {items.map((i) => {
          const r = resolveRunValue(run, i.key);
          const override = run.overrides.find((o) => o.key === i.key);
          const prov = r.provenance ? PROVENANCE_META[r.provenance] : null;
          return (
            <li key={i.key} className="flex flex-col gap-2 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">{i.label}</p>
                  {editing === i.key ? (
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={i.hint} aria-label={i.label} inputMode={i.kind === "number" ? "numeric" : undefined} />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => save(i.key, i.kind, i.label)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[13px] text-ink-2">{display(r.value)}</p>
                  )}
                  {i.hint && editing !== i.key && <p className="text-[11px] text-ink-4">{i.hint}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {prov && <Badge tone={prov.tone}>{prov.label}</Badge>}
                  {override ? (
                    <button type="button" aria-label={`Revert ${i.label} to the AI value`} title="Revert to AI value" onClick={() => getWorkflowService().removeOverride(run.id, override.id)} className="flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-bg-soft hover:text-ink">
                      <Undo2 className="size-4" aria-hidden />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Edit ${i.label}`}
                    onClick={() => {
                      setEditing(i.key);
                      setDraft(Array.isArray(r.value) ? r.value.join(", ") : r.value == null ? "" : String(r.value));
                    }}
                    className="flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-bg-soft hover:text-ink"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
              {override?.previousValue !== undefined && <p className="text-[11px] text-ink-4">Was: {display(override.previousValue)}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
