/**
 * The JobsLake search cache: what each source returned for a search, reused when the next search
 * asks the same source the same question — even worded differently. Pure rules only; the store and
 * the search wiring live in `server/jobslake/cache.ts` and `core.ts`.
 *
 * "The same question" is decided by `searchKey`: the query's words without filler, case, order or
 * plural endings, and the places reduced to the city (with common aliases). So "Senior Director,
 * Identity and Access Management" and "senior director identity access management" share answers;
 * "Mumbai, Maharashtra" and "Bombay" do too.
 *
 * Cached answers are real fetches, kept with the time they were fetched (each job keeps its own
 * `observedAt`), and served only while fresh — or, labelled with their age, when the source fails.
 */
import type { Depth } from "./planner";

/** A cached answer is served instead of asking the source again for this long. */
export const FRESH_MS = 6 * 3_600_000;
/** An empty answer is a real answer too, but checked again sooner. */
export const EMPTY_FRESH_MS = 1 * 3_600_000;
/** After this, an answer is never served — before it, only when the source fails right now. */
export const STALE_MS = 24 * 3_600_000;

const STOP = new Set(["a", "an", "and", "the", "of", "for", "in", "at", "to", "with", "or", "on", "job", "jobs", "role", "roles", "position", "positions", "opening", "openings", "vacancy", "vacancies"]);

const PLACE_ALIASES: Record<string, string> = {
  bangalore: "bengaluru",
  bombay: "mumbai",
  "navi mumbai": "mumbai",
  gurgaon: "gurugram",
  "new delhi": "delhi",
  "delhi ncr": "delhi",
  ncr: "delhi",
  madras: "chennai",
  calcutta: "kolkata",
  poona: "pune",
  nyc: "new york",
  "new york city": "new york",
  sf: "san francisco",
  "bay area": "san francisco",
  "work from home": "remote",
  wfh: "remote",
  anywhere: "remote",
  worldwide: "remote",
};

/** Light stemming: plural endings only, so "engineers" and "engineer" are one word but "access" stays. */
export function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) return w.slice(0, -1);
  return w;
}

/** The query's words that change what a source returns: lower-case, no filler, singular, sorted, once each. */
export function queryTokens(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9+#.]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w && !STOP.has(w))
    .map(stem);
  return [...new Set(words)].sort();
}

/** Places as a source would hear them: the city (text before the first comma), with common aliases folded. */
export function placeTokens(locations: string[]): string[] {
  const out = locations
    .map((l) => l.toLowerCase().split(",")[0].replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((l) => PLACE_ALIASES[l] ?? l);
  return [...new Set(out)].sort();
}

/** The cache identity of a search: same key → a source would be asked the same question. */
export function searchKey(criteria: { query: string; locations: string[] }): string {
  return `v1|q=${queryTokens(criteria.query).join(" ")}|l=${placeTokens(criteria.locations).join(";")}`;
}

const DEPTH_RANK: Record<Depth, number> = { shallow: 0, normal: 1, deep: 2 };

/** Depths whose cached answer can serve a request at `depth`: the same, or a deeper fetch (which saw more). */
export function servingDepths(depth: Depth): Depth[] {
  return (Object.keys(DEPTH_RANK) as Depth[]).filter((d) => DEPTH_RANK[d] >= DEPTH_RANK[depth]);
}

export type CacheState = "fresh" | "stale" | "expired";

export function cacheState(entry: { fetchedAt: string; retrieved: number }, now: number): CacheState {
  const age = now - Date.parse(entry.fetchedAt);
  if (!(age >= 0)) return "expired";
  if (age < (entry.retrieved ? FRESH_MS : EMPTY_FRESH_MS)) return "fresh";
  return age < STALE_MS ? "stale" : "expired";
}

/** Of several usable answers for one source, the most recent one. */
export function pickEntry<T extends { fetchedAt: string; retrieved: number }>(entries: T[], now: number, allowStale: boolean): T | undefined {
  return entries
    .filter((e) => {
      const s = cacheState(e, now);
      return s === "fresh" || (allowStale && s === "stale");
    })
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0];
}

/** "12 min" / "3 h" — how old a cached answer is, for the label beside it. */
export function ageLabel(fetchedAt: string, now: number): string {
  const min = Math.max(1, Math.round((now - Date.parse(fetchedAt)) / 60_000));
  return min < 60 ? `${min} min` : `${Math.round(min / 60)} h`;
}
