/**
 * WonderWorks' persisted-catalog helpers, taken from WonderJobs' store (store/jobs.ts): what a reload needs of a
 * module's last search, capped and trimmed, and recomputed only when what it's made from changed. Every module's
 * store persists through these instead of writing its own (CLAUDE.md, Performance: small, rarely written stores).
 */

/** A long text kept short in storage; the trailing "…" tells the page it has only the start. */
export function shortened(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/**
 * Which ids a persisted catalog keeps: every id in `keep` (what the person saved — saving is how they said to keep
 * it), then the best of `order` by `score` until `cap` ids are kept.
 */
export function bestIds(order: readonly string[], score: (id: string) => number, cap: number, keep: Iterable<string> = []) {
  const ids = new Set<string>(keep);
  for (const id of [...order].sort((a, b) => score(b) - score(a))) {
    if (ids.size >= cap) break;
    ids.add(id);
  }
  return ids;
}

/** The entries of `rec` for `ids`, in the order of `ids`, each passed through `map`; ids `rec` lacks are skipped. */
export function pick<T>(rec: Readonly<Record<string, T>>, ids: Iterable<string>, map: (v: T) => T = (v) => v): Record<string, T> {
  const out: Record<string, T> = {};
  for (const id of ids) if (rec[id] !== undefined) out[id] = map(rec[id]);
  return out;
}

/**
 * A result list set aside (another mode's or another search's), kept in storage: its best `cap` items by score,
 * in their own order, items passed through `trim`. Undefined when nothing is left.
 */
export function trimAside<T>(aside: { order: readonly string[]; items: Readonly<Record<string, T>> } | undefined, score: (id: string) => number, cap: number, trim: (item: T) => T = (v) => v) {
  if (!aside) return undefined;
  const best = [...aside.order].sort((a, b) => score(b) - score(a)).slice(0, cap).filter((id) => aside.items[id]);
  if (!best.length) return undefined;
  return { order: aside.order.filter((id) => best.includes(id)), items: Object.fromEntries(best.map((id) => [id, trim(aside.items[id])])), ids: best };
}

/** The last `cap` entries of `rec` that pass `keepIf`, in insertion order. */
export function lastEntries<T>(rec: Readonly<Record<string, T>> | undefined, cap: number, keepIf: (id: string, v: T) => boolean = () => true): Record<string, T> {
  return Object.fromEntries(Object.entries(rec ?? {}).filter(([id, v]) => keepIf(id, v)).slice(-cap));
}

/** Entries stamped within `days` of `now` (by `at`), the last `cap` of them: a closed posting, say, kept out for a week. */
export function recentEntries<T>(rec: Readonly<Record<string, T>> | undefined, at: (v: T) => string, days: number, cap: number, now = Date.now()) {
  const since = now - days * 86_400_000;
  return lastEntries(rec, cap, (_, v) => Date.parse(at(v)) > since);
}

/** A search history with `text` moved to the front (once, whatever its case), at most `cap` long. Blank text changes nothing. */
export function remembered(list: readonly string[], text: string, cap: number) {
  const t = text.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!t) return list;
  return [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, cap);
}

/** A persisted search history read back: strings only, at most `cap`. */
export const readHistory = (v: unknown, cap: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, cap) : []);

/**
 * `build` memoised on the identity of its inputs. Persisting runs on every change to a store — a filter keystroke,
 * a link check — so the expensive part (sorting and copying a catalog) runs only when what it's made from changed.
 */
export function memoOnInputs<I extends readonly unknown[], O>(build: (...inputs: I) => O) {
  let memo: { from: I; out: O } | null = null;
  return (...from: I): O => {
    if (memo && memo.from.length === from.length && memo.from.every((x, i) => x === from[i])) return memo.out;
    const out = build(...from);
    memo = { from, out };
    return out;
  };
}
