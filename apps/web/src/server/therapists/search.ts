/**
 * Therapists Find: one search of WorksLake's Therapists dataset (module = 'therapists'), turned into practitioner
 * listings with their terms, and the per-source provenance the client sees ("searched X across Y").
 *
 * The client's words are used for this search and are not stored: nothing here logs or keeps them, and the client's
 * own store keeps no search history (wonderworks/store.ts::PRIVATE_SEARCH_MODULES).
 */
import { search } from "@/server/jobslake/core";
import { THERAPISTS, type TherapistListing } from "@/modules/therapists/domain";
import { openTherapistPosts } from "./listings";
import { WONDERWORKS_THERAPISTS } from "./sources";

export type SourceState = "ok" | "empty" | "needs_setup" | "unavailable" | "skipped";

export interface TherapistsSourceLine {
  id: string;
  name: string;
  state: SourceState;
  count: number;
  message?: string;
}

export interface TherapistsSearchResult {
  searched: { query: string; places: string[] };
  results: TherapistListing[];
  sources: TherapistsSourceLine[];
}

const MAX_RESULTS = 200;

/** Search practitioners for these words and places. The words are the client's own; there is no default. */
export async function searchTherapists(input: { query: string; places: string[]; refresh?: boolean }): Promise<TherapistsSearchResult> {
  const query = input.query.trim().slice(0, 120);
  const places = input.places.map((p) => p.trim()).filter(Boolean).slice(0, 5);
  const [{ response, plan }, posted] = await Promise.all([
    search({ query: { text: query, locations: places }, searchMode: "balanced", limit: MAX_RESULTS, module: THERAPISTS, cache: input.refresh ? "refresh" : "use" }, { trigger: "search" }),
    openTherapistPosts(),
  ]);
  const byPosting = new Map(posted.map((p) => [p.posting.id, p]));
  const results: TherapistListing[] = [];
  for (const o of response.results) {
    const ws = o.sourceRecords.find((r) => r.sourceId === WONDERWORKS_THERAPISTS);
    // Only a listing that is still open is shown, with the terms the practitioner gave.
    const p = ws ? byPosting.get(ws.sourceJobId) : undefined;
    if (!ws || !p) continue;
    const { posting, org } = p;
    results.push({ id: `ws_${posting.id}`, postingId: posting.id, title: posting.title, company: org.name, location: posting.location, workMode: posting.workMode, terms: posting.terms, description: posting.description.slice(0, 4000), postedAt: posting.updatedAt, sourceId: WONDERWORKS_THERAPISTS, sourceName: ws.sourceName });
  }
  const lines: TherapistsSourceLine[] = response.sources.map((s) => ({
    id: s.sourceId,
    name: s.sourceName,
    state: s.outcome === "ok" ? "ok" : s.outcome === "empty" ? "empty" : s.outcome === "needs_setup" ? "needs_setup" : s.outcome === "skipped" ? "skipped" : "unavailable",
    count: results.filter((r) => r.sourceId === s.sourceId).length,
    ...(s.message ? { message: s.message } : {}),
  }));
  for (const sk of plan.skipped) if (!lines.some((l) => l.id === sk.id)) lines.push({ id: sk.id, name: sk.name, state: /credential/i.test(sk.reason) ? "needs_setup" : "skipped", count: 0, message: /credential/i.test(sk.reason) ? "Needs setup" : sk.reason });
  return { searched: { query, places }, results, sources: lines };
}
