/**
 * Search coverage (owner, 2026-11-26: "how do i ensure job search can serve all kind of users of this app" → "yes
 * build the coverage page"): what Jobs' sources actually return for the many kinds of work people look for, so the
 * next source to add is chosen from evidence, not guessed.
 *
 * Two views, both counted, never estimated:
 *  - probes: a fixed set of searches (a job family × a place), run weekly on the GitHub runner. For each, how many
 *    results really are that kind of job (every word of the probe in the title, so "insurance underwriter" doesn't
 *    count a TA Operations job) and which sources they came from.
 *  - real searches: candidates' own searches of the last days (their words only, never who searched), with how many
 *    jobs the candidate's matching judged relevant, so the thinnest ones show.
 */

export interface CoverageFamily {
  id: string;
  label: string;
  group: string;
  /** What the probe searches for: a common title in that family. */
  query: string;
}

/** The kinds of work the probes cover: across sectors and levels, not only tech. */
export const COVERAGE_FAMILIES: CoverageFamily[] = [
  { id: "software", label: "Software engineering", group: "Technology", query: "software engineer" },
  { id: "data", label: "Data analysis", group: "Technology", query: "data analyst" },
  { id: "it_support", label: "IT support", group: "Technology", query: "IT support" },
  { id: "product", label: "Product management", group: "Technology", query: "product manager" },
  { id: "design", label: "Design", group: "Creative", query: "graphic designer" },
  { id: "content", label: "Writing and content", group: "Creative", query: "content writer" },
  { id: "marketing", label: "Marketing", group: "Business", query: "marketing manager" },
  { id: "sales", label: "Sales", group: "Business", query: "sales executive" },
  { id: "customer", label: "Customer service", group: "Business", query: "customer service" },
  { id: "hr", label: "HR and recruiting", group: "Business", query: "HR manager" },
  { id: "operations", label: "Operations", group: "Business", query: "operations manager" },
  { id: "accounting", label: "Accounting", group: "Finance", query: "accountant" },
  { id: "banking", label: "Banking", group: "Finance", query: "relationship manager bank" },
  { id: "insurance", label: "Insurance", group: "Finance", query: "insurance underwriter" },
  { id: "legal", label: "Legal", group: "Professional", query: "lawyer" },
  { id: "consulting", label: "Consulting", group: "Professional", query: "consultant" },
  { id: "nursing", label: "Nursing", group: "Healthcare", query: "staff nurse" },
  { id: "doctor", label: "Doctors", group: "Healthcare", query: "physician" },
  { id: "pharmacy", label: "Pharmacy", group: "Healthcare", query: "pharmacist" },
  { id: "teaching", label: "School teaching", group: "Education", query: "teacher" },
  { id: "civil", label: "Civil engineering", group: "Engineering", query: "civil engineer" },
  { id: "mechanical", label: "Mechanical engineering", group: "Engineering", query: "mechanical engineer" },
  { id: "electrician", label: "Electricians", group: "Trades", query: "electrician" },
  { id: "driver", label: "Driving", group: "Trades", query: "driver" },
  { id: "warehouse", label: "Warehouse and logistics", group: "Trades", query: "warehouse" },
  { id: "construction", label: "Construction", group: "Trades", query: "site supervisor" },
  { id: "chef", label: "Cooking", group: "Hospitality", query: "chef" },
  { id: "hotel", label: "Hotels", group: "Hospitality", query: "hotel front office" },
  { id: "retail", label: "Retail", group: "Hospitality", query: "store manager" },
  { id: "admin", label: "Office administration", group: "Business", query: "administrative assistant" },
];

/** Where the probes look: Jobs' main places, and remote work. */
export const COVERAGE_PLACES = ["India", "United States", "United Kingdom", "United Arab Emirates", "Remote"] as const;
export type CoveragePlace = (typeof COVERAGE_PLACES)[number];

/** At or above this many real matches a probe is covered; below THIN it is a gap. */
export const COVERED = 10;
export const THIN = 3;
export type CoverageState = "covered" | "thin" | "gap" | "failed";

export const COVERAGE_STATE_LABEL: Record<CoverageState, string> = { covered: "Covered", thin: "Thin", gap: "Gap", failed: "Didn't run" };

export function coverageState(matches: number | null): CoverageState {
  if (matches === null) return "failed";
  return matches >= COVERED ? "covered" : matches >= THIN ? "thin" : "gap";
}

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

/** Shared stems so "nurse"/"nursing", "accountant"/"accounting", "underwriter"/"underwriting" count alike. */
const stem = (w: string) => (w.length > 5 ? w.slice(0, 5) : w);

/**
 * Whether a result's title really is the probe's kind of job: every word of the probe (by stem) is in the title. "IT"
 * and short words count whole. Strict on purpose — the page says how thin coverage is, so it never counts a job that
 * only shares a generic word.
 */
export function isRealMatch(title: string, probe: string): boolean {
  const have = new Set(words(title).map(stem));
  return words(probe).every((w) => have.has(stem(w)));
}

export interface ProbeResult {
  familyId: string;
  place: CoveragePlace;
  /** Results the search returned. */
  results: number;
  /** Of those, the probe's own kind of job (`isRealMatch`); null when the search failed. */
  matches: number | null;
  /** Real matches by source (a job seen on several sources counts for each). */
  bySource: Record<string, number>;
  /** Sources that couldn't be asked (needs setup, unavailable, timed out). */
  missing: { sourceId: string; outcome: string }[];
  error?: string;
}

export interface CoverageReport {
  ranAt: string;
  finishedAt?: string;
  /** Where it ran: "github" (the weekly workflow) or "test". */
  ranOn: string;
  durationMs: number;
  probes: ProbeResult[];
}

export interface FamilyRow {
  family: CoverageFamily;
  cells: { place: CoveragePlace; matches: number | null; state: CoverageState; results: number }[];
  /** The family's weakest state across places, for sorting gaps first. */
  worst: CoverageState;
}

const ORDER: Record<CoverageState, number> = { failed: 0, gap: 1, thin: 2, covered: 3 };

/** The matrix: one row per family, one cell per place; gaps first. */
export function coverageMatrix(report: CoverageReport | undefined): FamilyRow[] {
  const byKey = new Map((report?.probes ?? []).map((p) => [`${p.familyId}|${p.place}`, p]));
  return COVERAGE_FAMILIES.map((family) => {
    const cells = COVERAGE_PLACES.map((place) => {
      const p = byKey.get(`${family.id}|${place}`);
      const matches = p ? p.matches : null;
      return { place, matches, state: coverageState(matches), results: p?.results ?? 0 };
    });
    const worst = cells.reduce<CoverageState>((w, c) => (ORDER[c.state] < ORDER[w] ? c.state : w), "covered");
    return { family, cells, worst };
  }).sort((a, b) => ORDER[a.worst] - ORDER[b.worst] || a.family.group.localeCompare(b.family.group));
}

/** Which sources bring real matches, across every probe: the ones a gap could be filled from, and the ones that never help. */
export function sourceContribution(report: CoverageReport | undefined): { sourceId: string; matches: number; probes: number }[] {
  const out = new Map<string, { matches: number; probes: number }>();
  for (const p of report?.probes ?? []) {
    for (const [sourceId, n] of Object.entries(p.bySource)) {
      const row = out.get(sourceId) ?? { matches: 0, probes: 0 };
      row.matches += n;
      if (n > 0) row.probes += 1;
      out.set(sourceId, row);
    }
  }
  return [...out].map(([sourceId, v]) => ({ sourceId, ...v })).sort((a, b) => b.matches - a.matches);
}

/** Sources that couldn't be asked in this report (each once, with how many probes it missed). */
export function missingSources(report: CoverageReport | undefined): { sourceId: string; outcome: string; probes: number }[] {
  const out = new Map<string, { outcome: string; probes: number }>();
  for (const p of report?.probes ?? []) for (const m of p.missing) out.set(m.sourceId, { outcome: m.outcome, probes: (out.get(m.sourceId)?.probes ?? 0) + 1 });
  return [...out].map(([sourceId, v]) => ({ sourceId, ...v })).sort((a, b) => b.probes - a.probes);
}

/* ---------------------------------------------------------------- real searches */

export interface SearchRunLike {
  requestId?: string;
  sourceId?: string;
  trigger: string;
  startedAt: string;
  valid: number;
  relevant?: number;
  strong?: number;
  search?: { query: string; places: string[] };
}

export interface RealSearchRow {
  /** The words, lower-cased and trimmed: never who searched. */
  query: string;
  searches: number;
  /** Average jobs the candidates' matching judged relevant per search, when it reported back. */
  avgRelevant: number | null;
  avgFound: number;
  lastAt: string;
}

/**
 * Candidates' own searches of the period, grouped by their words, thinnest first. Only searches whose relevance was
 * reported back count towards avgRelevant; one with none reported shows null, never 0.
 */
export function realSearches(runs: SearchRunLike[], limit = 40): RealSearchRow[] {
  const byRequest = new Map<string, { query: string; at: string; valid: number; relevant: number; measured: boolean }>();
  for (const r of runs) {
    if (r.trigger !== "search" || !r.requestId || !r.search?.query?.trim()) continue;
    const row = byRequest.get(r.requestId) ?? { query: r.search.query.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80), at: r.startedAt, valid: 0, relevant: 0, measured: false };
    row.valid += r.valid;
    if (r.relevant !== undefined) {
      row.relevant += r.relevant;
      row.measured = true;
    }
    if (r.startedAt > row.at) row.at = r.startedAt;
    byRequest.set(r.requestId, row);
  }
  const byQuery = new Map<string, { searches: number; found: number; relevant: number; measured: number; lastAt: string }>();
  for (const r of byRequest.values()) {
    const q = byQuery.get(r.query) ?? { searches: 0, found: 0, relevant: 0, measured: 0, lastAt: r.at };
    q.searches += 1;
    q.found += r.valid;
    if (r.measured) {
      q.relevant += r.relevant;
      q.measured += 1;
    }
    if (r.at > q.lastAt) q.lastAt = r.at;
    byQuery.set(r.query, q);
  }
  return [...byQuery]
    .map(([query, q]) => ({ query, searches: q.searches, avgRelevant: q.measured ? Math.round((q.relevant / q.measured) * 10) / 10 : null, avgFound: Math.round(q.found / q.searches), lastAt: q.lastAt }))
    .sort((a, b) => (a.avgRelevant ?? Infinity) - (b.avgRelevant ?? Infinity) || b.searches - a.searches)
    .slice(0, limit);
}

/** What the admin page reads (`/api/jobs-lake/admin/coverage`). */
export interface CoverageView {
  report: { ranAt: string; finishedAt?: string; ranOn: string; durationMs: number; probes: number; planned: number } | null;
  places: readonly CoveragePlace[];
  matrix: FamilyRow[];
  contribution: { sourceId: string; matches: number; probes: number }[];
  missing: { sourceId: string; outcome: string; probes: number }[];
  real: { days: number; rows: RealSearchRow[] };
}
