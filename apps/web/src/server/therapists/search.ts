/**
 * Therapists Find: one search of WorksLake's Therapists dataset (module = 'therapists'), turned into practitioner
 * listings with their terms, and the per-source provenance the client sees ("searched X across Y").
 *
 * The client's words are used for this search and the server does not store them: nothing here logs or keeps them. The
 * client's own module store keeps the last search in their own account, as every module's does.
 */
import { search } from "@/server/jobslake/core";
import { readOsmTags, termsFromOsm, THERAPISTS, type TherapistListing } from "@/modules/therapists/domain";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { OSM_ATTRIBUTION } from "@/wonderworks/find/osm";
import { openTherapistPosts } from "./listings";
import { OPENSTREETMAP_THERAPISTS, WONDERWORKS_THERAPISTS } from "./sources";

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

/** A practitioner's open listing as Find and its public page list it: with the terms they gave. */
export function wonderworksTherapist({ posting, org }: Awaited<ReturnType<typeof openTherapistPosts>>[number], sourceName: string): TherapistListing {
  return { id: `ws_${posting.id}`, origin: "wonderworks", postingId: posting.id, title: posting.title, company: org.name, location: posting.location, workMode: posting.workMode, terms: posting.terms, description: posting.description.slice(0, 4000), postedAt: posting.updatedAt, sourceId: WONDERWORKS_THERAPISTS, sourceName };
}

/**
 * An outside practice as Find lists it: a practice OpenStreetMap maps, with only what the map has and its credit. Its own
 * website when it has one, else the page OpenStreetMap lists it on. No fee, language or focus is stated, so none is shown;
 * it can't be booked here, and nothing about it is checked.
 */
export function outside(o: CanonicalOpportunity): TherapistListing {
  const rec = o.sourceRecords.find((r) => r.canonical) ?? o.sourceRecords[0];
  const facts = readOsmTags(o.enrichment.tags);
  return {
    id: o.id,
    origin: "outside",
    title: o.title,
    company: o.employer.name,
    location: o.locations[0] ?? "",
    terms: termsFromOsm(),
    description: o.description.slice(0, 1200),
    applyUrl: facts.web ?? o.canonicalApplyUrl,
    attribution: OSM_ATTRIBUTION,
    // A mapped practice has no listing date (the map's edit date isn't when it was listed), so none is shown.
    sourceId: rec?.sourceId ?? "",
    sourceName: rec?.sourceName ?? "",
  };
}

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
    if (!ws) {
      // A practice OpenStreetMap maps; any other source's record isn't ours to show.
      if (o.sourceRecords.some((r) => r.sourceId === OPENSTREETMAP_THERAPISTS)) results.push(outside(o));
      continue;
    }
    // Only a listing that is still open is shown, with the terms the practitioner gave.
    const p = byPosting.get(ws.sourceJobId);
    if (p) results.push(wonderworksTherapist(p, ws.sourceName));
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
