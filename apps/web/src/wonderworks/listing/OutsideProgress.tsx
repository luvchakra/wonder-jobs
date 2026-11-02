"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Input, Textarea } from "@/components/common/Input";
import type { StoreApi, UseBoundStore } from "zustand";
import { cn } from "@/lib/cn";
import type { ModuleState } from "@/wonderworks/store";
import { NOTE_MAX, nextStep, progressAt, whenLabel, type ProgressFlow, type ProgressRef, type ProgressStep } from "./progress";

export interface ProgressSet {
  status: string;
  stage: string | null;
  when?: string | null;
  note?: string | null;
}

/**
 * "Your progress" on a listing that lives on someone else's site, for every module (2026-11-02): after the person opens
 * their page and comes back, they record each step (contacted, booked and when, held …) or how it ended, and it moves
 * through the module's Pipeline. One primary press, the next step; changing the date or note, the endings and "Stop
 * tracking" sit under it. Only what the person entered is kept; nothing is sent anywhere.
 */
export function OutsideProgress({ flow, value, pipelineHref, onSet, onClear }: { flow: ProgressFlow; value: ProgressRef | undefined; pipelineHref: string; onSet: (s: ProgressSet) => void; onClear: () => void }) {
  const at = progressAt(flow, value);
  const next = nextStep(flow, value);
  const [form, setForm] = useState<{ step: ProgressStep; edit: boolean } | null>(null);
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");

  const open = (step: ProgressStep, edit: boolean) => {
    setForm({ step, edit });
    setWhen(edit ? (value?.when ?? "") : "");
    setNote(edit ? (value?.note ?? "") : "");
  };
  const record = (step: ProgressStep) => (step.ask ? open(step, false) : onSet({ status: step.status, stage: step.stage }));

  if (form) {
    const s = form.step;
    const dateValue = s.ask === "date" ? when.slice(0, 10) : when.length === 10 ? `${when}T09:00` : when;
    return (
      <form
        className="flex flex-col gap-3"
        aria-label={s.label}
        onSubmit={(e) => {
          e.preventDefault();
          onSet({ status: s.status, stage: s.stage, when: when || null, note: note.trim() ? note.trim().slice(0, NOTE_MAX) : null });
          setForm(null);
        }}
      >
        <p className="text-[14px] font-medium text-ink">{s.label}</p>
        {s.ask && (
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            {s.askLabel ?? (s.ask === "date" ? "Date" : "Date and time")}
            <Input type={s.ask === "date" ? "date" : "datetime-local"} value={dateValue} onChange={(e) => setWhen(e.target.value)} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Note (optional)
          <Textarea rows={2} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to remember: the fee, who you spoke to, what to bring" />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setForm(null)}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            Save
          </Button>
        </div>
      </form>
    );
  }

  if (!at)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-ink-3">{flow.intro}</p>
        {next && (
          <Button variant="outline" full onClick={() => record(next)}>
            {next.prompt}
          </Button>
        )}
      </div>
    );

  const current = at.step ?? null;
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-1.5" aria-label="Your progress">
        {flow.steps.map((s, i) => {
          const done = at.step ? i <= at.index : false;
          const here = at.step && i === at.index;
          return (
            <li key={s.status} aria-current={here ? "step" : undefined} className={cn("flex items-start gap-2 text-[13px]", done ? "text-ink" : "text-ink-4")}>
              {done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-600" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0" aria-hidden />}
              <span className="min-w-0">
                <span className={cn(here && "font-medium")}>{s.label}</span>
                {here && value?.when && <span className="text-ink-2"> · {whenLabel(value.when)}</span>}
              </span>
            </li>
          );
        })}
        {at.other && (
          <li aria-current="step" className="flex items-start gap-2 text-[13px] font-medium text-ink">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
            {at.other.label}
          </li>
        )}
      </ol>
      {value?.note && <p className="rounded-[10px] bg-bg-soft px-3 py-2 text-[13px] text-ink-2">{value.note}</p>}
      {next && (
        <Button full onClick={() => record(next)}>
          {next.prompt}
        </Button>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        {current && (
          <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => open(current, true)}>
            {current.ask ? "Change time or note" : "Add a note"}
          </button>
        )}
        {flow.others
          .filter((o) => o.status !== value?.status)
          .map((o) => (
            <button key={o.status} type="button" className="text-ink-3 hover:text-ink hover:underline" onClick={() => onSet({ status: o.status, stage: o.stage })}>
              {o.prompt ?? o.label}
            </button>
          ))}
        <button type="button" className="text-ink-3 hover:text-ink hover:underline" onClick={onClear}>
          Stop tracking
        </button>
        <Link href={pipelineHref} className="ml-auto font-medium text-brand-600 hover:underline">
          See in {flow.pipeline}
        </Link>
      </div>
    </div>
  );
}

/**
 * The tracker bound to a module's store (wonderworks/store.ts): what a module's listing page renders under "Open their
 * page". A step with a stage moves the listing in the module's Pipeline (keeping the listing with it); an ending with no
 * stage, or Stop tracking, takes it out.
 */
export function OutsideTracker({ useStore, id, item, flow, pipelineHref }: { useStore: UseBoundStore<StoreApi<ModuleState>>; id: string; item: unknown; flow: ProgressFlow; pipelineHref: string }) {
  const value = useStore((s) => s.responses[id]);
  const setResponse = useStore((s) => s.setResponse);
  const clearResponse = useStore((s) => s.clearResponse);
  return (
    <section aria-label="Your progress" className="flex flex-col gap-2 border-t border-line pt-3">
      <h2 className="text-[14px] font-semibold text-ink">Your progress</h2>
      <OutsideProgress
        flow={flow}
        value={value}
        pipelineHref={pipelineHref}
        onSet={(s) => {
          if (!s.stage) return clearResponse(id);
          setResponse(id, s.stage, { status: s.status, item, ...(s.when !== undefined ? { when: s.when } : {}), ...(s.note !== undefined ? { note: s.note } : {}) });
        }}
        onClear={() => clearResponse(id)}
      />
    </section>
  );
}
