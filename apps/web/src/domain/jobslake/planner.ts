/**
 * The source planner (spec §39–40, §68): which sources a search should use, in which wave, how
 * deeply — and a plain reason for each choice, so the admin can see why a source was or wasn't
 * asked. Deterministic: the same inputs always produce the same plan.
 */
import type { SearchMode, SearchRequest, SourceStatus } from "./protocol";
import type { SourceHealth } from "./health";

export type Depth = "shallow" | "normal" | "deep";

export interface PlannableSource {
  id: string;
  name: string;
  status: SourceStatus;
  /** False when the source needs credentials this deployment doesn't have. */
  available: boolean;
  /** "global", "remote", or ISO country codes like "IN". */
  geography: string[];
}

export interface PlannedSource {
  id: string;
  name: string;
  wave: 1 | 2 | 3;
  reason: string;
}

export interface SkippedSource {
  id: string;
  name: string;
  reason: string;
}

export interface SearchPlan {
  mode: SearchMode;
  depth: Depth;
  useWarmPool: boolean;
  waves: PlannedSource[][];
  skipped: SkippedSource[];
}

const COUNTRY_HINTS: [RegExp, string][] = [
  [/\b(india|bengaluru|bangalore|mumbai|delhi|gurgaon|gurugram|noida|hyderabad|chennai|pune|kolkata|ahmedabad)\b/i, "IN"],
  [/\b(usa|united states|new york|san francisco|seattle|austin|boston|chicago)\b/i, "US"],
  [/\b(uk|united kingdom|london|manchester)\b/i, "GB"],
  [/\b(germany|berlin|munich|hamburg)\b/i, "DE"],
  [/\b(singapore)\b/i, "SG"],
];

/** Where the candidate wants to work, coarsely: countries named, and whether remote is acceptable. */
export function locationScope(locations: string[]) {
  const countries = new Set<string>();
  let remote = locations.length === 0;
  for (const l of locations) {
    if (/remote|anywhere|worldwide/i.test(l)) remote = true;
    for (const [re, cc] of COUNTRY_HINTS) if (re.test(l)) countries.add(cc);
  }
  return { countries: [...countries], remote, anywhere: locations.length === 0 };
}

function geographyFit(src: PlannableSource, scope: ReturnType<typeof locationScope>) {
  if (scope.anywhere || src.geography.includes("global")) return true;
  if (src.geography.includes("remote")) return scope.remote;
  return src.geography.some((g) => scope.countries.includes(g)) || (scope.countries.length === 0 && !scope.remote);
}

function score(h: SourceHealth | undefined) {
  if (!h || h.state === "no_data") return 0.5;
  const yieldRate = h.retrieved ? h.valid / h.retrieved : 0;
  return (h.successRate ?? 0) * 0.7 + Math.min(1, yieldRate) * 0.3 - (h.state === "degraded" ? 0.2 : 0);
}

const pct = (x: number | null) => (x == null ? "no runs yet" : `${Math.round(x * 100)}% success`);

export function planSearch(req: Pick<SearchRequest, "searchMode" | "sourceIds" | "query">, sources: PlannableSource[], health: Record<string, SourceHealth>): SearchPlan {
  const scope = locationScope(req.query.locations);
  const skipped: SkippedSource[] = [];
  const eligible: PlannableSource[] = [];
  for (const s of sources) {
    if (req.sourceIds && req.sourceIds.length && !req.sourceIds.includes(s.id)) continue;
    if (s.status !== "active" && s.status !== "degraded") {
      skipped.push({ id: s.id, name: s.name, reason: `Status is ${s.status.replace("_", " ")}` });
      continue;
    }
    if (!s.available) {
      skipped.push({ id: s.id, name: s.name, reason: "Needs credentials on this deployment" });
      continue;
    }
    if (health[s.id]?.state === "down" && req.searchMode !== "maximum_coverage") {
      skipped.push({ id: s.id, name: s.name, reason: "Down on its recent runs" });
      continue;
    }
    eligible.push(s);
  }
  const ranked = eligible.map((s) => ({ s, fit: geographyFit(s, scope), sc: score(health[s.id]) })).sort((a, b) => Number(b.fit) - Number(a.fit) || b.sc - a.sc || a.s.name.localeCompare(b.s.name));
  const why = (x: (typeof ranked)[number]) => `${x.fit ? "Covers your locations" : "Outside your locations — discovery"} · ${pct(health[x.s.id]?.successRate ?? null)}`;
  const fits = ranked.filter((x) => x.fit);
  const misses = ranked.filter((x) => !x.fit);

  const waves: PlannedSource[][] = [];
  if (req.searchMode === "fast") {
    waves.push(fits.slice(0, 4).map((x) => ({ id: x.s.id, name: x.s.name, wave: 1, reason: why(x) })));
    for (const x of [...fits.slice(4), ...misses]) skipped.push({ id: x.s.id, name: x.s.name, reason: x.fit ? "Fast mode uses the four strongest sources" : "Outside your locations" });
  } else if (req.searchMode === "balanced") {
    waves.push(fits.slice(0, 4).map((x) => ({ id: x.s.id, name: x.s.name, wave: 1, reason: why(x) })));
    if (fits.length > 4) waves.push(fits.slice(4).map((x) => ({ id: x.s.id, name: x.s.name, wave: 2, reason: why(x) })));
    for (const x of misses) skipped.push({ id: x.s.id, name: x.s.name, reason: "Outside your locations" });
  } else {
    waves.push(fits.slice(0, 4).map((x) => ({ id: x.s.id, name: x.s.name, wave: 1, reason: why(x) })));
    if (fits.length > 4) waves.push(fits.slice(4).map((x) => ({ id: x.s.id, name: x.s.name, wave: 2, reason: why(x) })));
    if (misses.length) waves.push(misses.map((x) => ({ id: x.s.id, name: x.s.name, wave: 3, reason: why(x) })));
  }
  return {
    mode: req.searchMode,
    depth: req.searchMode === "fast" ? "shallow" : req.searchMode === "balanced" ? "normal" : "deep",
    useWarmPool: req.searchMode !== "maximum_coverage",
    waves: waves.filter((w) => w.length),
    skipped,
  };
}
