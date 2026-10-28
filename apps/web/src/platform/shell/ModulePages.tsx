"use client";
import { useSyncExternalStore } from "react";
import { Bookmark, Clock, Inbox, UserRound } from "lucide-react";
import { EmptyState } from "@/components/common/States";
import { moduleById, type ModuleId } from "@/modules/registry";
import { moduleStore } from "@/platform/moduleStore";

type ShellModule = Exclude<ModuleId, "jobs">;
/** False on the server and the first client render, so persisted counts never cause a hydration mismatch. */
const noop = () => () => undefined;
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

/** A module that hasn't shipped: a label and a line, never a listing (CLAUDE.md, real data only). */
export function ModuleComingSoon({ id }: { id: ModuleId }) {
  const m = moduleById(id)!;
  return <EmptyState icon={<Clock className="size-5" aria-hidden />} title={`${m.label} is coming soon`} body={m.hint} action={{ label: "Back to Jobs", href: "/app/jobs" }} className="mt-6" />;
}

/** Find, until the module has a source or a posting: says so instead of filling the gap. */
export function ModuleFind({ id }: { id: ShellModule }) {
  const m = moduleById(id)!;
  return <EmptyState title="No listings yet" body={`${m.label} listings show here once a company posts one or a source brings them in.`} />;
}

export function ModuleSaved({ id }: { id: ShellModule }) {
  const n = Object.keys(moduleStore(id)((s) => s.saved)).length;
  const ready = useMounted();
  if (ready && n > 0) return <p className="text-sm text-ink-3">{n} saved</p>;
  return <EmptyState icon={<Bookmark className="size-5" aria-hidden />} title="Nothing saved yet" body="Tap the bookmark on a listing to keep it here." />;
}

/** The module's own tab: its stages with real counts from the person's responses. */
export function ModulePipeline({ id }: { id: ShellModule }) {
  const m = moduleById(id)!;
  const responses = moduleStore(id)((s) => s.responses);
  const ready = useMounted();
  const count = (stage: string) => (ready ? Object.values(responses).filter((r) => r.stage === stage).length : 0);
  return (
    <div>
      <ul aria-label="Stages" className="mb-4 flex flex-wrap gap-2">
        {m.pipeline.stages.map((s) => (
          <li key={s.id} className="rounded-full bg-surface-2 px-3 py-1 text-[13px] text-ink-2">
            {s.label} <span className="text-ink-4">{count(s.id)}</span>
          </li>
        ))}
      </ul>
      {(!ready || Object.keys(responses).length === 0) && <EmptyState icon={<Inbox className="size-5" aria-hidden />} title={`Nothing in ${m.pipeline.label} yet`} body={`What you ${m.response.verb === "apply" ? "apply to" : "respond to"} shows here.`} />}
    </div>
  );
}

export function ModuleYou({ id }: { id: ShellModule }) {
  const m = moduleById(id)!;
  return <EmptyState icon={<UserRound className="size-5" aria-hidden />} title={`Your ${m.label} details`} body={m.persona.length ? `${m.label} will ask for ${m.persona.map((f) => f.label.toLowerCase()).join(", ")}.` : undefined} />;
}
