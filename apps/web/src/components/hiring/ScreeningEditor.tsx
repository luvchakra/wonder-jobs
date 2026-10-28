"use client";
import { Plus, X } from "lucide-react";
import { MAX_PROMPT, MAX_QUESTIONS, QUESTION_PRESETS, type ScreeningKind, type ScreeningQuestion } from "@/domain/org/screening";
import { Input, Select } from "@/components/common/Input";

const KIND_LABEL: Record<ScreeningKind, string> = { yes_no: "Yes / No", number: "Number", text: "Text" };

/**
 * A job's screening questions (owner, 2026-10-28): a few short questions every applicant answers, the common ones a
 * tap away. A must-have is a Yes / No answer or a minimum number; an application that doesn't meet it is still sent,
 * marked "Doesn't meet" for the team to decide.
 */
export function ScreeningEditor({ value, onChange }: { value: ScreeningQuestion[]; onChange: (q: ScreeningQuestion[]) => void }) {
  const set = (i: number, patch: Partial<ScreeningQuestion>) => onChange(value.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  const presets = QUESTION_PRESETS.filter((p) => !value.some((q) => q.id === p.id));
  const full = value.length >= MAX_QUESTIONS;
  return (
    <div className="flex flex-col gap-2">
      {value.map((q, i) => (
        <div key={q.id} className="rounded-[12px] border border-line p-2.5">
          <div className="flex items-start gap-2">
            <Input aria-label={`Question ${i + 1}`} value={q.prompt} maxLength={MAX_PROMPT} onChange={(e) => set(i, { prompt: e.target.value })} className="min-w-0 flex-1" />
            <button type="button" aria-label={`Remove “${q.prompt}”`} onClick={() => onChange(value.filter((_, k) => k !== i))} className="grid size-10 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px] text-ink-2">
            <Select aria-label={`Answer to question ${i + 1}`} value={q.kind} onChange={(e) => set(i, { kind: e.target.value as ScreeningKind, mustHave: undefined })} className="h-9 w-auto">
              {(Object.keys(KIND_LABEL) as ScreeningKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
            <label className="inline-flex min-h-9 items-center gap-1.5">
              <input type="checkbox" checked={q.required || !!q.mustHave} disabled={!!q.mustHave} onChange={(e) => set(i, { required: e.target.checked })} className="size-4 accent-brand-600" />
              Required
            </label>
            {q.kind === "yes_no" && (
              <label className="inline-flex min-h-9 items-center gap-1.5">
                Must-have
                <Select aria-label={`Must-have answer to question ${i + 1}`} value={q.mustHave?.equals ?? ""} onChange={(e) => set(i, { mustHave: e.target.value ? { equals: e.target.value as "yes" | "no" } : undefined, required: q.required || !!e.target.value })} className="h-9 w-auto">
                  <option value="">None</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </label>
            )}
            {q.kind === "number" && (
              <label className="inline-flex min-h-9 items-center gap-1.5">
                Must-have: at least
                <Input aria-label={`Minimum for question ${i + 1}`} inputMode="decimal" value={q.mustHave?.min ?? ""} onChange={(e) => { const n = e.target.value.trim() === "" ? undefined : Number(e.target.value); set(i, { mustHave: n != null && Number.isFinite(n) ? { min: n } : undefined, required: q.required || n != null }); }} className="h-9 w-20" />
              </label>
            )}
          </div>
        </div>
      ))}
      {!full && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button key={p.id} type="button" onClick={() => onChange([...value, { ...p }])} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-3 text-[12.5px] text-ink-2 hover:border-brand-300 hover:text-brand-700">
              <Plus className="size-3.5" aria-hidden /> {p.prompt}
            </button>
          ))}
          <button type="button" onClick={() => onChange([...value, { id: `q_own_${Date.now().toString(36)}`, kind: "text", prompt: "", required: false }])} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-line px-3 text-[12.5px] font-medium text-brand-700">
            <Plus className="size-3.5" aria-hidden /> Your own question
          </button>
        </div>
      )}
    </div>
  );
}
