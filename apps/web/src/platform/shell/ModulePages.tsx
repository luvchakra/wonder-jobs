"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Inbox, UserRound } from "lucide-react";
import { WonderStarSplash } from "@/platform/brand/Logo";
import { EmptyState } from "@/components/common/States";
import { isLive, moduleById, MODULES, type ModuleId } from "@/modules/registry";
import { SavedCard, savedText } from "@/modules/savedCards";
import { PageHeader } from "@/components/layout/PageHeader";
import { StageTiles } from "@/platform/pipeline/parts";
import { YouOverview } from "@/components/you/YouOverview";
import { FilterBox, REFINE_CHIP, ResultsGrid, TogglePill } from "@/platform/find/parts";
import { useDictation } from "@/lib/dictation";
import { cn } from "@/lib/cn";
import { Chip } from "@/components/common/Input";
import { moduleStore } from "@/platform/moduleStore";

type ShellModule = Exclude<ModuleId, "jobs">;
/** False on the server and the first client render, so persisted counts never cause a hydration mismatch. */
const noop = () => () => undefined;
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

/** A module that hasn't shipped: the splash, a label and a line, never a listing (CLAUDE.md, real data only). */
export function ModuleComingSoon({ id }: { id: ModuleId }) {
  const m = moduleById(id)!;
  return (
    <WonderStarSplash>
      <h2 className="mt-8 text-lg font-semibold">{m.label} is coming soon</h2>
      <p className="mt-1 text-sm text-white/80">{m.hint}</p>
      <Link href="/app/m" className="mt-5 inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-semibold text-star-purple wj-press">
        Back to Explore
      </Link>
    </WonderStarSplash>
  );
}

/** Find, until the module has a source or a posting: says so instead of filling the gap. */
export function ModuleFind({ id }: { id: ShellModule }) {
  const m = moduleById(id)!;
  return <EmptyState title="No listings yet" body={`${m.label} listings show here once a company posts one or a source brings them in.`} />;
}

/**
 * Saved (§4.1), with Jobs' Saved layout: the box that narrows the saves as you type, the modules as chips (one list
 * across WonderStar's live modules, filterable by module), Hide Pipeline, and the same cards Find shows. Jobs keeps its
 * own Saved (the jobs portal is unchanged), a tap away.
 */
export function ModuleSaved({ id }: { id: ShellModule }) {
  const ready = useMounted();
  const live = MODULES.filter((m): m is typeof m & { id: ShellModule } => m.id !== "jobs" && isLive(m));
  // One subscription per live module, in the registry's fixed order.
  const per = live.map((m) => ({ m, saved: moduleStore(m.id)((s) => s.saved), items: moduleStore(m.id)((s) => s.items), responses: moduleStore(m.id)((s) => s.responses) }));
  const history = moduleStore(id)((s) => s.recentSavedSearches);
  const [only, setOnly] = useState<ShellModule | "all">(id);
  const [text, setText] = useState("");
  const [hidePipeline, setHidePipeline] = useState(false);
  const dictation = useDictation({ textAtStart: () => text, onText: setText });
  const words = text.trim().toLowerCase();
  const all = per.flatMap((p) => Object.entries(p.saved).flatMap(([lid, at]) => (p.items[lid] ? [{ module: p.m.id, id: lid, at, item: p.items[lid], inPipeline: !!p.responses[lid] }] : [])));
  const list = all
    .filter((x) => (only === "all" || x.module === only) && (!hidePipeline || !x.inPipeline) && (!words || savedText(x.module, x.item).toLowerCase().includes(words)))
    .sort((a, b) => b.at.localeCompare(a.at));
  const m = moduleById(id)!;
  return (
    <div>
      <h1 className="wj-sr-only">Saved</h1>
      <div className="mb-3 flex flex-col gap-3">
        <FilterBox text={text} onText={setText} label={`Filter saved ${m.label.toLowerCase()}`} dictation={dictation} dictateLabel="what to look for in your saves" history={history} onEnter={(t) => moduleStore(id).getState().rememberSearch(t, "saved")} onForget={(t) => moduleStore(id).getState().forgetSearch(t, "saved")} />
        <div role="group" aria-label="Module" className="flex items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] max-[380px]:gap-0.5">
          {[{ id: "all" as const, label: "All" }, ...live.map((x) => ({ id: x.id, label: x.label }))].map((c) => (
            <Chip key={c.id} active={only === c.id} isDefault={c.id === "all"} onClick={() => setOnly(c.id)} className={cn(REFINE_CHIP, "shrink-0")}>
              {c.label}
            </Chip>
          ))}
          <Link href="/app/saved" className={cn(REFINE_CHIP, "inline-flex shrink-0 items-center rounded-full border border-line bg-surface font-medium text-ink-2 hover:border-line-strong")}>
            Saved jobs
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <TogglePill label="Hide Pipeline" checked={hidePipeline} onChange={setHidePipeline} />
        </div>
      </div>
      {ready && list.length > 0 ? (
        <ResultsGrid label="Saved">
          {list.map((x) => (
            <li key={`${x.module}:${x.id}`}>
              <SavedCard module={x.module} item={x.item} />
            </li>
          ))}
        </ResultsGrid>
      ) : ready && all.length > 0 ? (
        <p role="status" className="rounded-[14px] border border-dashed border-line p-6 text-center text-[14px] text-ink-2">
          No saved {m.label.toLowerCase()} match{words ? ` “${text.trim()}”` : " these filters"}.{" "}
          <button
            type="button"
            onClick={() => {
              setText("");
              setOnly("all");
              setHidePipeline(false);
            }}
            className="font-medium text-brand-600 hover:underline"
          >
            Clear
          </button>
        </p>
      ) : (
        <EmptyState title="Nothing saved yet" body={`Tap the bookmark on ${m.label.toLowerCase() === "internships" ? "an internship" : "a listing"} to keep it here.`} action={{ label: `Find ${m.label.toLowerCase()}`, href: m.routes.find }} />
      )}
    </div>
  );
}

/** The module's own tab, in Jobs' Pipeline layout: its stages as tiles with real counts from the person's responses. */
export function ModulePipeline({ id }: { id: ShellModule }) {
  const m = moduleById(id)!;
  const responses = moduleStore(id)((s) => s.responses);
  const ready = useMounted();
  const [stage, setStage] = useState(m.pipeline.stages[0].id);
  const count = (st: string) => (ready ? Object.values(responses).filter((r) => r.stage === st).length : 0);
  return (
    <div>
      <PageHeader title={m.pipeline.label} />
      <StageTiles label="By stage" stages={m.pipeline.stages.map((s) => ({ id: s.id, label: s.label, count: count(s.id) }))} current={stage} onPick={setStage} />
      {(!ready || Object.keys(responses).length === 0) && <EmptyState icon={<Inbox className="size-5" aria-hidden />} title={`Nothing in ${m.pipeline.label} yet`} body={`What you ${m.response.verb === "apply" ? "apply to" : "respond to"} shows here.`} />}
    </div>
  );
}

/** You, in Jobs' layout: the Career Profile and its rows, with the module's own details as rows in the same style. */
export function ModuleYou({ id }: { id: ShellModule }) {
  const m = moduleById(id)!;
  return <YouOverview module={{ label: m.label, rows: m.persona.length ? [{ href: m.routes.you, label: "Your details", value: m.persona.map((f) => f.label).join(", "), icon: UserRound }] : [] }} />;
}
