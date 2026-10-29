/**
 * Teaching Find (WJ-420): one search of JobsLake's Teaching dataset (module = 'teaching'), turned into teaching roles with
 * their terms, and the per-source provenance the teacher sees. A WonderStar school's role carries the terms the school
 * gave; an outside posting carries only what it states (its pay, and a board or grades its own text names).
 */
import { search } from "@/server/jobslake/core";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { boardFromText, gradesFromText, isTeachingTitle, monthlyFromYearly, TEACHING, type TeachingListing } from "@/modules/teaching/domain";
import { openTeachingRoles } from "./applications";
import { WONDERSTAR_TEACHING } from "./sources";

export interface TeachingSourceLine {
  id: string;
  name: string;
  state: "ok" | "empty" | "needs_setup" | "unavailable" | "skipped";
  count: number;
  message?: string;
}

export interface TeachingSearchResult {
  searched: { query: string; places: string[] };
  results: TeachingListing[];
  sources: TeachingSourceLine[];
}

function outside(o: CanonicalOpportunity): TeachingListing {
  const rec = o.sourceRecords.find((r) => r.canonical) ?? o.sourceRecords[0];
  const text = `${o.title} ${o.description.slice(0, 1500)}`;
  const board = boardFromText(text);
  return {
    id: o.id,
    origin: "outside",
    title: o.title,
    company: o.employer.name,
    location: o.locations[0] ?? "",
    workMode: o.workplaceType,
    terms: { ...monthlyFromYearly(o.compensation?.min, o.compensation?.max, o.compensation?.currency ?? "INR"), grades: gradesFromText(text), requires: [], ...(board ? { board } : {}) },
    termsFrom: "posting",
    description: o.description.slice(0, 1200),
    applyUrl: o.canonicalApplyUrl,
    postedAt: o.postedAt,
    sourceId: rec?.sourceId ?? "",
    sourceName: rec?.sourceName ?? "",
  };
}

/** Search teaching roles for these words and places. The words are the teacher's own; there is no default. */
export async function searchTeaching(input: { query: string; places: string[]; refresh?: boolean }): Promise<TeachingSearchResult> {
  const query = input.query.trim().slice(0, 120);
  const places = input.places.map((p) => p.trim()).filter(Boolean).slice(0, 5);
  const [{ response, plan }, posted] = await Promise.all([search({ query: { text: query, locations: places }, searchMode: "balanced", limit: 200, module: TEACHING, cache: input.refresh ? "refresh" : "use" }, { trigger: "search" }), openTeachingRoles()]);
  const byPosting = new Map(posted.map((p) => [p.posting.id, p]));
  const results: TeachingListing[] = [];
  for (const o of response.results) {
    const ws = o.sourceRecords.find((r) => r.sourceId === WONDERSTAR_TEACHING);
    if (ws) {
      const p = byPosting.get(ws.sourceJobId);
      if (!p) continue;
      const { posting, org } = p;
      results.push({ id: `ws_${posting.id}`, origin: "wonderstar", postingId: posting.id, title: posting.title, company: org.name, companyVerified: org.verified, location: posting.location, workMode: posting.workMode, terms: posting.terms, termsFrom: "school", description: posting.description.slice(0, 4000), postedAt: posting.updatedAt, sourceId: WONDERSTAR_TEACHING, sourceName: ws.sourceName });
    } else if (isTeachingTitle(o.title)) results.push(outside(o));
  }
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
