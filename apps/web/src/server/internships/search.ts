/**
 * Internships Find (WJ-417): one search of JobsLake's Internships dataset (module = 'internships'), turned into
 * internship listings with their terms, and the per-source provenance the student sees ("searched X in Y across Z").
 *
 * A WonderStar posting carries the terms its company gave (stipend a month, duration, start date, apply-by date, part
 * or full time). An outside posting carries only what it states: its pay (kept per year by JobsLake, shown a month)
 * and a duration its own title or opening says; its start date stays "not stated".
 */
import { search } from "@/server/jobslake/core";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { durationFromText, INTERNSHIPS, monthlyFromYearly, stillOpen, type InternshipListing } from "@/modules/internships/domain";
import { openInternships } from "./applications";
import { WONDERSTAR_INTERNSHIPS } from "./sources";

export type SourceState = "ok" | "empty" | "needs_setup" | "unavailable" | "skipped";

export interface InternshipSourceLine {
  id: string;
  name: string;
  state: SourceState;
  count: number;
  message?: string;
}

export interface InternshipSearchResult {
  searched: { query: string; places: string[] };
  results: InternshipListing[];
  sources: InternshipSourceLine[];
}

const MAX_RESULTS = 200;

function outside(o: CanonicalOpportunity): InternshipListing {
  const rec = o.sourceRecords.find((r) => r.canonical) ?? o.sourceRecords[0];
  const duration = durationFromText(`${o.title} ${o.description.slice(0, 600)}`);
  return {
    id: o.id,
    origin: "outside",
    title: o.title,
    company: o.employer.name,
    location: o.locations[0] ?? "",
    workMode: o.workplaceType,
    terms: { ...monthlyFromYearly(o.compensation?.min, o.compensation?.max, o.compensation?.currency ?? "INR"), ...(duration ? { durationMonths: duration } : {}) },
    termsFrom: "posting",
    skills: o.skills.slice(0, 12),
    description: o.description.slice(0, 1200),
    applyUrl: o.canonicalApplyUrl,
    postedAt: o.postedAt,
    sourceId: rec?.sourceId ?? "",
    sourceName: rec?.sourceName ?? "",
  };
}

/** Search internships for these words and places. The words are the student's own; there is no default. */
export async function searchInternships(input: { query: string; places: string[]; refresh?: boolean }): Promise<InternshipSearchResult> {
  const query = input.query.trim().slice(0, 120);
  const places = input.places.map((p) => p.trim()).filter(Boolean).slice(0, 5);
  const [{ response, plan }, posted] = await Promise.all([
    search({ query: { text: query, locations: places, jobTypes: ["internship"] }, filters: { jobTypes: ["internship"] }, searchMode: "balanced", limit: MAX_RESULTS, module: INTERNSHIPS, cache: input.refresh ? "refresh" : "use" }, { trigger: "search" }),
    openInternships(),
  ]);
  const byPosting = new Map(posted.map((p) => [p.posting.id, p]));
  const results: InternshipListing[] = [];
  for (const o of response.results) {
    if (o.jobType !== "internship") continue;
    const ws = o.sourceRecords.find((r) => r.sourceId === WONDERSTAR_INTERNSHIPS);
    if (ws) {
      // Only a posting that is still open (and before its last day to apply) is listed — with its company's own terms.
      const p = byPosting.get(ws.sourceJobId);
      if (!p || !stillOpen(p.posting.terms)) continue;
      const { posting, org } = p;
      results.push({ id: `ws_${posting.id}`, origin: "wonderstar", postingId: posting.id, title: posting.title, company: org.name, companyVerified: org.verified, location: posting.location, workMode: posting.workMode, terms: posting.terms, termsFrom: "company", skills: posting.skills, description: posting.description.slice(0, 4000), postedAt: posting.updatedAt, sourceId: WONDERSTAR_INTERNSHIPS, sourceName: ws.sourceName });
    } else results.push(outside(o));
  }
  // Every source the dataset has, with what it gave: asked, or why it wasn't.
  const lines: InternshipSourceLine[] = response.sources.map((s) => ({
    id: s.sourceId,
    name: s.sourceName,
    state: s.outcome === "ok" ? "ok" : s.outcome === "empty" ? "empty" : s.outcome === "needs_setup" ? "needs_setup" : s.outcome === "skipped" ? "skipped" : "unavailable",
    count: results.filter((r) => r.sourceId === s.sourceId).length,
    ...(s.message ? { message: s.message } : {}),
  }));
  for (const sk of plan.skipped) if (!lines.some((l) => l.id === sk.id)) lines.push({ id: sk.id, name: sk.name, state: /credential/i.test(sk.reason) ? "needs_setup" : "skipped", count: 0, message: /credential/i.test(sk.reason) ? "Needs setup" : sk.reason });
  return { searched: { query, places }, results, sources: lines };
}
