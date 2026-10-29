"use client";
import { memo, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { RefreshCw, Search } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/common/States";
import { WonderSearching } from "@/components/brand/WonderSearching";
import { useBottomBar } from "@/wonderstar/chrome/MobileNav";
import { useDictation } from "@/lib/dictation";
import { useUIStore } from "@/store/ui";
import { moduleStore } from "@/wonderstar/store";
import type { ModuleId } from "@/wonderstar/manifest";
import { cn } from "@/lib/cn";
import { ChoiceChips, DictationNotes, PillButton, RefineCheck, RefinePanel, RefinePlaces, RefineSelect, RefineToggle, ResultsGrid, ResultsLine, SearchBox, SearchSubmit, SearchingBanner, ShowMore, SortSelect, historyFor, refineSectionClass } from "./parts";

/**
 * A WonderStar module's Find (docs/WONDERSTAR_PLATFORM.md §4.1), with the jobs portal's structure and parts: the
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
  search: (query: string, places: string[]) => Promise<FindRun<L>>;
  refine: (list: L[], values: FacetValues, sort: string) => { kept: L[]; hidden: number };
  Card: React.ComponentType<{ item: L; onOpen: (id: string) => void }>;
  Sheet?: React.ComponentType<{ item: L | null; onClose: () => void }>;
  /** Before the first search, and when the words are missing. */
  idle: { title: string; body: string };
  needWords: string;
  dictateHint: string;
}

const PAGE = 24;
const noop = () => () => undefined;
const STATE_LABEL: Record<SourceState, string> = { ok: "", empty: "none found", needs_setup: "Needs setup", unavailable: "Unavailable", skipped: "not asked" };
const set = (v: FacetValues) => Object.values(v).filter((x) => x !== undefined && x !== "").length;

export function ModuleFind<L extends { id: string }>({ module, noun, placeholder, startWords, facets, sorts, search, refine, Card, Sheet, idle, needWords, dictateHint }: ModuleFindProps<L>) {
  const store = moduleStore(module);
  const recent = store((s) => s.recentSearches);
  const forget = store((s) => s.forgetSearch);
  // Persisted values exist only in the browser: read them after mount, so the first render matches the server's.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [typed, setTyped] = useState<string | null>(null);
  const draft = typed ?? (mounted ? (recent[0] ?? startWords ?? "") : "");
  const [boxFocused, setBoxFocused] = useState(false);
  const dictation = useDictation({ textAtStart: () => draft, onText: setTyped });
  const [places, setPlaces] = useState<string[]>([]);
  // What Refine shows while open (saved with Save), and what the list uses.
  const [values, setValues] = useState<FacetValues>({});
  const [editing, setEditing] = useState<FacetValues>({});
  const [sort, setSort] = useState(Object.keys(sorts)[0]);
  const [run, setRun] = useState<FindRun<L> | null>(null);
  const [busy, setBusy] = useState<{ query: string; places: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needWordsFor, setNeedWordsFor] = useState<string | null>(null);
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

  const go = async (text = draft) => {
    const q = text.trim();
    if (!q) {
      setNeedWordsFor("");
      return;
    }
    setNeedWordsFor(null);
    setError(null);
    setBusy({ query: q, places });
    try {
      const r = await search(q, places);
      store.getState().rememberSearch(q);
      setRun(r);
      setLimit(PAGE);
      setShowSources(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
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
    <div>
      <h1 className="wj-sr-only">Find {noun.many}</h1>
      {busy && (
        <SearchingBanner aside={<WonderSearching size={32} />}>
          <div className="min-w-0 flex-1 space-y-0.5 pt-1">
            <p className="text-[15px] font-semibold leading-5 text-ink">Searching…</p>
            <p className="break-words text-[13px] leading-[18px] text-ink-2">
              For “{busy.query}”{busy.places.length ? ` in ${busy.places.join(", ")}` : ""}
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
        {needWordsFor !== null && needWordsFor === draft.trim() && (
          <p role="alert" className="-mt-1 text-[12px] text-danger-600">
            {needWords}
          </p>
        )}
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
            <RefinePlaces places={places} onChange={setPlaces} />
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
          title={`Nothing found for “${run.searched.query}”`}
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
            summary={`Showing ${kept.length.toLocaleString("en-IN")} ${kept.length === 1 ? noun.one : noun.many} for “${run.searched.query}”${where === " anywhere" ? "" : where} from ${answered} ${answered === 1 ? "source" : "sources"}${hidden ? ` · ${hidden} hidden by Refine` : ""}`}
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
              Searched {answered} of {run.sources.length} {run.sources.length === 1 ? "source" : "sources"} for “{run.searched.query}”{run.searched.places.length ? ` in ${run.searched.places.join(", ")}` : ""}
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
