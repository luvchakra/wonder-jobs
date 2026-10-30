/**
 * Talent & Services Find: one search of WorksLake's Talent & Services dataset (module = 'services'), turned into
 * service listings with their terms, and the per-source provenance the client sees ("searched X in Y across Z").
 *
 * A WonderWorks pro's listing carries the terms the pro gave. An outside pro carries only what the source reports: a
 * rate, skills, a rating, reviews and on-time share (domain.ts::termsFromPro).
 */
import { search } from "@/server/jobslake/core";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { readProTags, SERVICES, termsFromPro, type ServiceListing } from "@/modules/services/domain";
import { openServicePosts } from "./listings";
import { WONDERSTAR_SERVICES } from "./sources";

export type SourceState = "ok" | "empty" | "needs_setup" | "unavailable" | "skipped";

export interface ServicesSourceLine {
  id: string;
  name: string;
  state: SourceState;
  count: number;
  message?: string;
}

export interface ServicesSearchResult {
  searched: { query: string; places: string[] };
  results: ServiceListing[];
  sources: ServicesSourceLine[];
}

const MAX_RESULTS = 200;

export function outside(o: CanonicalOpportunity): ServiceListing {
  const rec = o.sourceRecords.find((r) => r.canonical) ?? o.sourceRecords[0];
  return {
    id: o.id,
    origin: "outside",
    title: o.title,
    company: o.employer.name,
    location: o.locations[0] ?? "",
    workMode: o.workplaceType,
    terms: termsFromPro(readProTags(o.enrichment.tags)),
    termsFrom: "posting",
    description: o.description.slice(0, 1200),
    applyUrl: o.canonicalApplyUrl,
    postedAt: o.postedAt,
    sourceId: rec?.sourceId ?? "",
    sourceName: rec?.sourceName ?? "",
  };
}

/** Search services for these words and places. The words are the client's own; there is no default. */
export async function searchServices(input: { query: string; places: string[]; refresh?: boolean }): Promise<ServicesSearchResult> {
  const query = input.query.trim().slice(0, 120);
  const places = input.places.map((p) => p.trim()).filter(Boolean).slice(0, 5);
  const [{ response, plan }, posted] = await Promise.all([
    search({ query: { text: query, locations: places }, searchMode: "balanced", limit: MAX_RESULTS, module: SERVICES, cache: input.refresh ? "refresh" : "use" }, { trigger: "search" }),
    openServicePosts(),
  ]);
  const byPosting = new Map(posted.map((p) => [p.posting.id, p]));
  const results: ServiceListing[] = [];
  for (const o of response.results) {
    const ws = o.sourceRecords.find((r) => r.sourceId === WONDERSTAR_SERVICES);
    if (ws) {
      // Only a listing that is still open is shown — with its pro's own terms.
      const p = byPosting.get(ws.sourceJobId);
      if (!p) continue;
      const { posting, org } = p;
      results.push({ id: `ws_${posting.id}`, origin: "wonderstar", postingId: posting.id, title: posting.title, company: org.name, companyVerified: org.verified, location: posting.location, workMode: posting.workMode, terms: posting.terms, termsFrom: "company", description: posting.description.slice(0, 4000), postedAt: posting.updatedAt, sourceId: WONDERSTAR_SERVICES, sourceName: ws.sourceName });
    } else results.push(outside(o));
  }
  // Every source the dataset has, with what it gave: asked, or why it wasn't.
  const lines: ServicesSourceLine[] = response.sources.map((s) => ({
    id: s.sourceId,
    name: s.sourceName,
    state: s.outcome === "ok" ? "ok" : s.outcome === "empty" ? "empty" : s.outcome === "needs_setup" ? "needs_setup" : s.outcome === "skipped" ? "skipped" : "unavailable",
    count: results.filter((r) => r.sourceId === s.sourceId).length,
    ...(s.message ? { message: s.message } : {}),
  }));
  for (const sk of plan.skipped) if (!lines.some((l) => l.id === sk.id)) lines.push({ id: sk.id, name: sk.name, state: /credential/i.test(sk.reason) ? "needs_setup" : "skipped", count: 0, message: /credential/i.test(sk.reason) ? "Needs setup" : sk.reason });
  return { searched: { query, places }, results, sources: lines };
}
