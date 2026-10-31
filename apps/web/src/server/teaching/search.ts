/**
 * Teaching Find: one search of WorksLake's Teaching dataset (module = 'teaching'), turned into teaching openings with
 * their terms, and the per-source provenance the teacher sees ("searched X in Y across Z").
 *
 * A WonderWorks school's opening carries the terms the school gave. An outside posting carries only what it states:
 * its pay (kept per year by WorksLake, shown a month) and the subject, grades, board and qualifications its own title
 * and text name (domain.ts::termsFromPosting).
 */
import { search } from "@/server/jobslake/core";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { isTeachingTitle, TEACHING, termsFromPosting, type TeachingListing } from "@/modules/teaching/domain";
import { openTeachingPosts } from "./listings";
import { WONDERSTAR_TEACHING } from "./sources";

export type SourceState = "ok" | "empty" | "needs_setup" | "unavailable" | "skipped";

export interface TeachingSourceLine {
  id: string;
  name: string;
  state: SourceState;
  count: number;
  message?: string;
}

export interface TeachingSearchResult {
  searched: { query: string; places: string[] };
  results: TeachingListing[];
  sources: TeachingSourceLine[];
}

const MAX_RESULTS = 200;

export function outside(o: CanonicalOpportunity): TeachingListing {
  const rec = o.sourceRecords.find((r) => r.canonical) ?? o.sourceRecords[0];
  return {
    id: o.id,
    origin: "outside",
    title: o.title,
    company: o.employer.name,
    location: o.locations[0] ?? "",
    workMode: o.workplaceType,
    terms: termsFromPosting({ title: o.title, description: o.description, jobType: o.jobType, payMin: o.compensation?.min, payMax: o.compensation?.max, currency: o.compensation?.currency }),
    termsFrom: "posting",
    description: o.description.slice(0, 1200),
    applyUrl: o.canonicalApplyUrl,
    postedAt: o.postedAt,
    sourceId: rec?.sourceId ?? "",
    sourceName: rec?.sourceName ?? "",
  };
}

/** A WonderWorks school's open opening as Find and its public page list it: with the terms the school gave. */
export function wonderworksTeaching({ posting, org }: Awaited<ReturnType<typeof openTeachingPosts>>[number], sourceName: string): TeachingListing {
  return { id: `ws_${posting.id}`, origin: "wonderstar", postingId: posting.id, title: posting.title, company: org.name, companyVerified: org.verified, location: posting.location, workMode: posting.workMode, terms: posting.terms, termsFrom: "company", description: posting.description.slice(0, 4000), postedAt: posting.updatedAt, sourceId: WONDERSTAR_TEACHING, sourceName };
}

/** Search teaching openings for these words and places. The words are the teacher's own; there is no default. */
export async function searchTeaching(input: { query: string; places: string[]; refresh?: boolean }): Promise<TeachingSearchResult> {
  const query = input.query.trim().slice(0, 120);
  const places = input.places.map((p) => p.trim()).filter(Boolean).slice(0, 5);
  const [{ response, plan }, posted] = await Promise.all([
    search({ query: { text: query, locations: places }, searchMode: "balanced", limit: MAX_RESULTS, module: TEACHING, cache: input.refresh ? "refresh" : "use" }, { trigger: "search" }),
    openTeachingPosts(),
  ]);
  const byPosting = new Map(posted.map((p) => [p.posting.id, p]));
  const results: TeachingListing[] = [];
  for (const o of response.results) {
    const ws = o.sourceRecords.find((r) => r.sourceId === WONDERSTAR_TEACHING);
    if (ws) {
      // Only an opening that is still open is listed — with its school's own terms.
      const p = byPosting.get(ws.sourceJobId);
      if (!p) continue;
      results.push(wonderworksTeaching(p, ws.sourceName));
    } else if (isTeachingTitle(o.title)) results.push(outside(o));
  }
  // Every source the dataset has, with what it gave: asked, or why it wasn't.
  const lines: TeachingSourceLine[] = response.sources.map((s) => ({
    id: s.sourceId,
    name: s.sourceName,
    state: s.outcome === "ok" ? "ok" : s.outcome === "empty" ? "empty" : s.outcome === "needs_setup" ? "needs_setup" : s.outcome === "skipped" ? "skipped" : "unavailable",
    count: results.filter((r) => r.sourceId === s.sourceId).length,
    ...(s.message ? { message: s.message } : {}),
  }));
  for (const sk of plan.skipped) if (!lines.some((l) => l.id === sk.id)) lines.push({ id: sk.id, name: sk.name, state: /credential/i.test(sk.reason) ? "needs_setup" : "skipped", count: 0, message: /credential/i.test(sk.reason) ? "Needs setup" : sk.reason });
  return { searched: { query, places }, results, sources: lines };
}
