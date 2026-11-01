"use client";
import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import { RefreshCw, Search } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/common/States";
import { WonderSearching } from "@/components/brand/WonderSearching";
import { useBottomBar } from "@/wonderworks/chrome/MobileNav";
import { useDictation } from "@/lib/dictation";
import { useUIStore } from "@/store/ui";
import { moduleStore } from "@/wonderworks/store";
import type { ModuleId } from "@/wonderworks/manifest";
import { cn } from "@/lib/cn";
import { ChoiceChips, DictationNotes, PillButton, RefineCheck, RefinePanel, RefinePlaces, RefineSelect, RefineToggle, ResultsGrid, ResultsLine, SearchBox, SearchSubmit, SearchingBanner, ShowMore, SortSelect, historyFor, refineSectionClass } from "./parts";

/**
 * A WonderWorks module's Find (docs/WONDERWORKS_PLATFORM.md §4.1), with the jobs portal's structure and parts: the
 * search box (microphone, clear, recent searches), one row of Refine, the module's pill facets and the round Search
 * button, the Refine panel, the line that says how many and from where, the cards, and the same empty states. A module
 * plugs in only its own fields (`facets`), its search, its card and its sheet. Opening the page searches nothing.
 */

type Shell = Exclude<ModuleId, "jobs">;

/** One Refine field a module adds. `pill`: also shown in the row under the search box (at most two). `corner`: the check box at Refine's top right. */
export type FacetSpec =
  | { key: string; label: string; kind: "chips"; options: { value: string; label: string }[]; any: string; pill?: (value: string | undefined) => string; className?: string }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[]; any: string; className?: string }
  | { key: string; label: string; kind: "check"; title?: string; corner?: boolean };

/** What each facet is set to; unset is undefined, a check box is "1". */
export type FacetValues = Record<string, string | undefined>;

export type SourceState = "ok" | "empty" | "needs_setup" | "unavailable" | "skipped";
export interface FindRun<L> {
  searched: { query: string; places: string[] };
  results: L[];
  sources: { id: string; name: string; state: SourceState; count: number; message?: string }[];
}

export interface ModuleFindProps<L extends { id: string }> {
  module: Shell;
  /** "internship" / "internships". */
  noun: { one: string; many: string };
  placeholder: string;
  /** What to search for when nothing was searched before (e.g. the student's course); undefined asks. */
  startWords?: string;
  facets: FacetSpec[];
  /** The orders the list can take; the first is where it starts. */
  sorts: Record<string, string>;
  /** `signal` aborts when the person presses Stop; a module may pass it to its fetch (its result is dropped either way). */
  search: (query: string, places: string[], signal?: AbortSignal) => Promise<FindRun<L>>;
  refine: (list: L[], values: FacetValues, sort: string) => { kept: L[]; hidden: number };
  Card: React.ComponentType<{ item: L; onOpen: (id: string) => void }>;
  Sheet?: React.ComponentType<{ item: L | null; onClose: () => void }>;
  /** Before the first search, and when the words are missing. */
  idle: { title: string; body: string };
  /** No longer shown: a search without words shows the module's latest listings (owner, 2026-11-01). */
  needWords?: string;
  dictateHint: string;
  /** Worldwide only: Refine offers no Location and every search is anywhere (e.g. Scholarships & Projects). */
  global?: boolean;
}

const PAGE = 24;
/** Seconds since the search started, ticking once a second while it runs (it unmounts when the search ends). */
function SearchClock() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setS((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{s} s</span>;
}

/** What a run was for, in words: its query, or the latest listings when it had none. */
const forWhat = (query: string, start = false) => (query ? `${start ? "For" : "for"} “${query}”` : start ? "Latest listings" : "· latest");
const noop = () => () => undefined;
const STATE_LABEL: Record<SourceState, string> = { ok: "", empty: "none found", needs_setup: "Needs setup", unavailable: "Unavailable", skipped: "not asked" };
const set = (v: FacetValues) => Object.values(v).filter((x) => x !== undefined && x !== "").length;

export function ModuleFind<L extends { id: string }>({ module, noun, placeholder, startWords, facets, sorts, search, refine, Card, Sheet, idle, dictateHint, global = false }: ModuleFindProps<L>) {
  const store = moduleStore(module);
  const recent = store((s) => s.recentSearches);
  const forget = store((s) => s.forgetSearch);
  // Persisted values exist only in the browser: read them after mount, so the first render matches the server's.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [typed, setTyped] = useState<string | null>(null);
  // The last search, as stored: opening Find shows it again and searches nothing.
  const stored = useStore(store, (s) => s.lastRun);
  const run = mounted ? (stored as FindRun<L> | null) : null;
  // The box shows the words the shown results were searched for: empty after a search without words (cleared with ×),
  // so a reload never brings back an older search. Before any search, the module's starting words (or the last ones).
  const draft = typed ?? (mounted ? (run ? run.searched.query : (recent[0] ?? startWords ?? "")) : "");
  const [boxFocused, setBoxFocused] = useState(false);
  const dictation = useDictation({ textAtStart: () => draft, onText: setTyped });
  const [places, setPlaces] = useState<string[]>([]);
  // What Refine shows while open (saved with Save), and what the list uses.
  const [values, setValues] = useState<FacetValues>({});
  const [editing, setEditing] = useState<FacetValues>({});
  const [sort, setSort] = useState(Object.keys(sorts)[0]);
  const [busy, setBusy] = useState<{ query: string; places: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);

  // Refine is Find's own panel (the same one Jobs' Find opens): leaving Find closes it.
  const more = useUIStore((s) => s.refineOpen);
  const setMore = useUIStore((s) => s.setRefineOpen);
  useEffect(() => () => setMore(false), [setMore]);
  useBottomBar(more);
  const [section, setSection] = useState<string | null>(null);
  const openRefine = (at?: string) => {
    setEditing(values);
    setMore(true);
    setSection(at ?? null);
  };
  useEffect(() => {
    if (!more || !section) return;
    const el = document.getElementById(`wj-refine-${section}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
    const t = setTimeout(() => setSection(null), 1600);
    return () => clearTimeout(t);
  }, [more, section]);

  // The search in progress, so Stop can end it: its result is dropped and the list stays as it was.
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);
  const stop = () => {
    inFlight.current?.abort();
    inFlight.current = null;
    setBusy(null);
  };
  const go = async (text = draft) => {
    // No words: the module's latest listings (owner, 2026-11-01), not an error.
    const q = text.trim();
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    setError(null);
    setBusy({ query: q, places });
    try {
      const r = await search(q, places, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (q) store.getState().rememberSearch(q);
      store.getState().setLastRun(r);
      setLimit(PAGE);
      setShowSources(false);
    } catch (e) {
      if (!ctrl.signal.aborted) setError((e as Error).message);
    } finally {
      if (inFlight.current === ctrl) {
        inFlight.current = null;
        setBusy(null);
      }
    }
  };

  const { kept, hidden } = useMemo(() => refine(run?.results ?? [], values, sort), [refine, run, values, sort]);
  const visible = kept.slice(0, limit);
  const pills = facets.filter((f): f is Extract<FacetSpec, { kind: "chips" }> => f.kind === "chips" && !!f.pill).slice(0, 2);
  const corner = facets.find((f): f is Extract<FacetSpec, { kind: "check" }> => f.kind === "check" && !!f.corner);
  const shownValues = more ? editing : values;
  // One per Refine setting, as on Jobs' Find: each facet set, and places picked.
  const count = set(shownValues) + (places.length ? 1 : 0);
  const where = run?.searched.places.length ? ` in ${run.searched.places.join(", ")}` : " anywhere";
  const answered = run?.sources.filter((s) => s.state === "ok" || s.state === "empty").length ?? 0;
  const clear = () => {
    setEditing({});
    setValues({});
    setPlaces([]);
    setSort(Object.keys(sorts)[0]);
  };

  const field = (f: FacetSpec) => {
    const v = editing[f.key];
    const put = (x: string | undefined) => setEditing((e) => ({ ...e, [f.key]: x || undefined }));
    if (f.kind === "chips")
      return (
        <div key={f.key} id={`wj-refine-${f.key}`} role="group" aria-label={f.label} tabIndex={-1} className={cn(refineSectionClass(section === f.key), f.className)}>
          {f.label}
          <ChoiceChips options={[{ value: "", label: f.any, isDefault: true }, ...f.options]} value={v ?? ""} onPick={put} />
        </div>
      );
    if (f.kind === "select")
      return (
        <RefineSelect key={f.key} label={f.label} value={v ?? ""} onChange={put} options={[{ value: "", label: f.any }, ...f.options]} className={f.className} />
      );
    return f.corner ? null : <RefineCheck key={f.key} label={f.label} title={f.title} checked={v === "1"} onChange={(on) => put(on ? "1" : undefined)} className="min-h-7" />;
  };

  return (
    // Under the page's 20px top padding, the search box sits 8px from the top bar: the same gap as between it and the chips.
    <div className="-mt-3">
      <h1 className="wj-sr-only">Find {noun.many}</h1>
      {busy && (
        <SearchingBanner
          aside={
            <>
              <WonderSearching size={32} />
              {/* Stop: the search ends and the list stays as it was before it started (as on Jobs' Find). */}
              <button type="button" onClick={stop} className="inline-flex min-h-8 items-center rounded-full border border-brand-300 bg-surface px-2.5 text-[12px] font-medium text-brand-700 hover:bg-brand-100">
                Stop
              </button>
            </>
          }
        >
          <div className="min-w-0 flex-1 space-y-0.5 pt-1">
            <p className="text-[15px] font-semibold leading-5 text-ink">Searching {noun.many}…</p>
            <p className="break-words text-[13px] leading-[18px] text-ink-2">
              {busy.query ? `For “${busy.query}”` : `The latest ${noun.many}`}
              {busy.places.length ? ` in ${busy.places.join(", ")}` : " · anywhere"}
            </p>
            {/* What it's doing, in numbers it knows: how many sources it asks (the last search's count for this
                module), and how long it has taken so far. */}
            <p className="text-[12px] leading-4 text-ink-3">
              {run?.sources.length ? `Asking all ${run.sources.length} ${run.sources.length === 1 ? "source" : "sources"}` : "Asking every source"}
              {busy.query ? ", removing repeats" : ", newest first"} · <SearchClock />
            </p>
          </div>
        </SearchingBanner>
      )}
      <div className="mb-3 flex flex-col gap-2">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setBoxFocused(false);
            void go();
          }}
        >
          <SearchBox
            value={draft}
            onValue={setTyped}
            onClear={() => setTyped("")}
            placeholder={placeholder}
            label={`Search ${noun.many}`}
            dictation={dictation}
            dictateLabel="what you're looking for"
            focused={boxFocused}
            onFocused={setBoxFocused}
            history={historyFor(recent, draft)}
            onPick={(t) => {
              setTyped(t);
              setBoxFocused(false);
              (document.activeElement as HTMLElement | null)?.blur();
              void go(t);
            }}
            onForget={(t) => forget(t)}
          />
          {/* Refine, the module's own two facets and the search — one row, as on Jobs' Find. */}
          <div className="flex items-center gap-2">
            <RefineToggle open={more} count={count} onToggle={() => (more ? setMore(false) : openRefine())} />
            {pills.map((p, i) => (
              <PillButton key={p.key} label={p.label} shown={p.pill!(shownValues[p.key])} open={more} onClick={() => openRefine(p.key)} className={i === 0 ? "min-w-0 flex-auto" : "shrink-0"} />
            ))}
            <SearchSubmit label="Search" />
          </div>
        </form>
        <DictationNotes dictation={dictation} hint={dictateHint} />
        {more && (
          <RefinePanel
            backLabel={`Back to ${noun.many}`}
            onBack={() => setMore(false)}
            corner={corner && <RefineCheck label={corner.label} title={corner.title} checked={editing[corner.key] === "1"} onChange={(on) => setEditing((e) => ({ ...e, [corner.key]: on ? "1" : undefined }))} />}
            onSave={() => {
              setValues(editing);
              setLimit(PAGE);
              setMore(false);
            }}
            links={
              (set(editing) > 0 || places.length > 0) && (
                <button type="button" onClick={clear} className="inline-flex min-h-8 items-center font-medium text-ink-3 hover:text-ink hover:underline">
                  Clear refinements
                </button>
              )
            }
          >
            {facets.map(field)}
            {!global && <RefinePlaces places={places} onChange={setPlaces} />}
          </RefinePanel>
        )}
      </div>

      {error ? (
        <ErrorState title="Couldn't search" body={error} />
      ) : !run ? (
        busy ? null : <EmptyState icon={<Search className="size-5" aria-hidden />} title={idle.title} body={idle.body} />
      ) : kept.length === 0 ? (
        <EmptyState
          icon={<Search className="size-5" aria-hidden />}
          title={run.searched.query ? `Nothing found for “${run.searched.query}”` : `No ${noun.many} yet`}
          body={
            hidden
              ? `${hidden} found, all hidden by Refine. Loosen it to see them.`
              : run.sources.some((s) => s.state === "needs_setup" || s.state === "unavailable")
                ? `None of the sources that answered list that${where}; some couldn't be asked (see the sources below). Try other words, or fewer of them.`
                : `No source lists that${where} right now. Try other words, or fewer of them.`
          }
          action={hidden ? { label: "Clear refinements", onClick: clear } : undefined}
        />
      ) : (
        <>
          <h2 className="wj-sr-only">Results</h2>
          <ResultsLine
            summary={`Showing ${kept.length.toLocaleString("en-IN")} ${kept.length === 1 ? noun.one : noun.many} ${forWhat(run.searched.query)}${where === " anywhere" ? "" : where} from ${answered} ${answered === 1 ? "source" : "sources"}${hidden ? ` · ${hidden} hidden by Refine` : ""}`}
            sort={Object.keys(sorts).length > 1 && <SortSelect value={sort} labels={sorts} onChange={setSort} />}
          />
          <ResultsGrid label={`${noun.one[0].toUpperCase()}${noun.one.slice(1)} results`}>
            {visible.map((l) => (
              <Item key={l.id} item={l} Card={Card} onOpen={setOpen} />
            ))}
          </ResultsGrid>
          {visible.length < kept.length && <ShowMore left={kept.length - visible.length} onClick={() => setLimit((n) => n + PAGE)} />}
        </>
      )}

      {/* What the list is from — every source's count a tap away — under the results, out of the way. */}
      {run && !busy && (
        <div className="mb-4 mt-6 text-[13px]">
          <p className="flex items-center gap-1.5 text-ink-3">
            <button type="button" onClick={() => setShowSources((v) => !v)} aria-expanded={showSources} className="min-w-0 text-left underline-offset-2 hover:underline">
              Searched {answered} of {run.sources.length} {run.sources.length === 1 ? "source" : "sources"} {forWhat(run.searched.query)}{run.searched.places.length ? ` in ${run.searched.places.join(", ")}` : ""}
            </button>
            <button type="button" onClick={() => void go(run.searched.query)} aria-label="Search again" title="Search again" className="-my-1 shrink-0 rounded-full p-2 text-brand-600 hover:bg-brand-50">
              <RefreshCw className="size-3.5" aria-hidden />
            </button>
          </p>
          {showSources && (
            <ul aria-label="Sources" className="mt-2 space-y-1">
              {run.sources.map((s) => (
                <li key={s.id} className="flex justify-between gap-3">
                  <span className="text-ink-2">{s.name}</span>
                  <span className="text-ink-3">{s.state === "ok" ? s.count : s.state === "skipped" && s.message ? s.message : STATE_LABEL[s.state]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {Sheet && <Sheet item={kept.find((l) => l.id === open) ?? null} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** One card in the results, with its id-taking handler, so a card re-renders only when its own listing changes. */
const Item = memo(function Item<L extends { id: string }>({ item, Card, onOpen }: { item: L; Card: React.ComponentType<{ item: L; onOpen: (id: string) => void }>; onOpen: (id: string) => void }) {
  return (
    <li>
      <Card item={item} onOpen={onOpen} />
    </li>
  );
}) as <L extends { id: string }>(p: { item: L; Card: React.ComponentType<{ item: L; onOpen: (id: string) => void }>; onOpen: (id: string) => void }) => React.ReactElement;
