/**
 * Progress on a listing that lives on someone else's site (owner, 2026-11-02: "once the page opens up and the user comes
 * back on the details, there is no way to progress that particular session … It should have a complete user experience
 * flow, right from clicking that button to the last action that can be logically taken for that module").
 *
 * WonderWorks can't see what happens on the practice's, employer's or seller's own page, so the person records it: each
 * module describes its steps (contacted → booked → held …) and the endings that can happen on the way, each landing in
 * one of its Pipeline stages. Everything here is what the person entered; nothing is inferred or invented.
 */

/** One step forward, in order. `ask` asks for when it happens (a booked session's time, an interview's date). */
export interface ProgressStep {
  status: string;
  /** The module's Pipeline stage id it sits in. */
  stage: string;
  /** What it is, once done ("Session booked"). */
  label: string;
  /** The button that records it ("I booked a session"). */
  prompt: string;
  ask?: "datetime" | "date";
  /** The date field's label ("Session time"). */
  askLabel?: string;
}

/** A way it can end or turn aside at any point ("Didn't go ahead", "On the waitlist"). `stage: null` takes it out of the Pipeline. */
export interface ProgressOther {
  status: string;
  stage: string | null;
  label: string;
  /** The button that records it, when it differs from the label. */
  prompt?: string;
}

export interface ProgressFlow {
  steps: ProgressStep[];
  others: ProgressOther[];
  /** The line shown before anything is recorded ("Contacted them on their page? Keep track of it here."). */
  intro: string;
  /** The module's Pipeline tab, named where the person will find it ("Sessions"). */
  pipeline: string;
}

export interface ProgressRef {
  stage: string;
  status?: string;
  at: string;
  /** When it happens, as the person entered it: "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" (their local time). */
  when?: string;
  note?: string;
  marks?: string[];
}

export const NOTE_MAX = 300;

/** Where a recorded response stands in the flow; null when it isn't one of the flow's (or nothing is recorded). */
export function progressAt(flow: ProgressFlow, ref: ProgressRef | undefined): { index: number; step?: ProgressStep; other?: ProgressOther } | null {
  if (!ref?.status) return null;
  const index = flow.steps.findIndex((s) => s.status === ref.status);
  if (index >= 0) return { index, step: flow.steps[index] };
  const other = flow.others.find((o) => o.status === ref.status);
  return other ? { index: -1, other } : null;
}

/** The step after where it stands (the first, when nothing is recorded); none after the last step or an ending. */
export function nextStep(flow: ProgressFlow, ref: ProgressRef | undefined): ProgressStep | undefined {
  const at = progressAt(flow, ref);
  if (!at) return flow.steps[0];
  return at.step ? flow.steps[at.index + 1] : undefined;
}

/** "Tue, 5 Nov, 4:00 pm" (or "Tue, 5 Nov" for a date), in the reader's locale; the raw text if it doesn't parse. */
export function whenLabel(when: string, locale?: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(when);
  const d = new Date(dateOnly ? `${when}T00:00` : when);
  if (Number.isNaN(d.getTime())) return when;
  return d.toLocaleString(locale, dateOnly ? { weekday: "short", day: "numeric", month: "short" } : { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** One line for where it stands: "Session booked · Tue, 5 Nov, 4:00 pm". */
export function progressLine(flow: ProgressFlow, ref: ProgressRef | undefined, locale?: string): string | null {
  const at = progressAt(flow, ref);
  if (!at || !ref) return null;
  const label = at.step?.label ?? at.other!.label;
  return ref.when ? `${label} · ${whenLabel(ref.when, locale)}` : label;
}

/** The label of a recorded status ("Session booked"), or undefined if the flow doesn't know it. */
export const progressLabel = (flow: ProgressFlow, status: string | undefined): string | undefined =>
  flow.steps.find((s) => s.status === status)?.label ?? flow.others.find((o) => o.status === status)?.label;

/** The Pipeline stage a status sits in (null: out of the Pipeline; undefined: not this flow's). */
export function progressStage(flow: ProgressFlow, status: string): string | null | undefined {
  const s = flow.steps.find((x) => x.status === status);
  if (s) return s.stage;
  const o = flow.others.find((x) => x.status === status);
  return o ? o.stage : undefined;
}

/** Outside listings the person is tracking, for the module's Pipeline: each with its stage, label and line, newest first. */
export function trackedOutside<T>(
  flow: ProgressFlow,
  responses: Record<string, ProgressRef>,
  items: Record<string, unknown>,
  isOutside: (id: string, item: T) => boolean,
  locale?: string,
): { id: string; item: T; ref: ProgressRef; stage: string; label: string; line: string }[] {
  const out: { id: string; item: T; ref: ProgressRef; stage: string; label: string; line: string }[] = [];
  for (const [id, ref] of Object.entries(responses)) {
    const item = items[id] as T | undefined;
    if (!item || !ref.status || !isOutside(id, item)) continue;
    const stage = progressStage(flow, ref.status);
    if (!stage) continue;
    out.push({ id, item, ref, stage, label: progressLabel(flow, ref.status)!, line: progressLine(flow, ref, locale)! });
  }
  return out.sort((a, b) => b.ref.at.localeCompare(a.ref.at));
}
