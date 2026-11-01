/**
 * Scholarships & Projects Find: one search of WorksLake's Scholarships dataset (module = 'scholarships'), turned into
 * listings with their terms, and the per-source provenance the student sees ("searched X across Z sources").
 *
 * An empty query is allowed: core returns the dataset's latest listings. A WonderWorks organisation's listing carries
 * the terms it gave. An outside listing carries only what its source states (`attributes`: deadline, award, levels,
 * official link…) and the levels its own text names. Every listing past its deadline is left out, and so is every
 * outside listing that mentions a fee to apply.
 */
import { search } from "@/server/jobslake/core";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { asksForFee, isDate, isProjectText, levelsFromText, LEVELS, officialLink, SCHOLARSHIPS, stillOpen, type Level, type ScholarshipListing, type ScholarshipTerms } from "@/modules/scholarships/domain";
import { openScholarships } from "./applications";
import { WONDERSTAR_SCHOLARSHIPS } from "./sources";

export type SourceState = "ok" | "empty" | "needs_setup" | "unavailable" | "skipped";

export interface ScholarshipSourceLine {
  id: string;
  name: string;
  state: SourceState;
  count: number;
  message?: string;
}

export interface ScholarshipSearchResult {
  searched: { query: string; places: string[] };
  results: ScholarshipListing[];
  sources: ScholarshipSourceLine[];
}

const MAX_RESULTS = 200;
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => {
  const n = typeof v === "string" && v.trim() ? Number(v.replace(/[, ]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
};
const words = (v: unknown) => str(v).split(/[;,|]/).map((x) => x.trim()).filter(Boolean);

/** The terms an outside listing's source states, read from its attributes; nothing guessed. */
export function termsFromAttributes(o: Pick<CanonicalOpportunity, "title" | "description" | "attributes" | "canonicalApplyUrl">): ScholarshipTerms {
  const a = (o.attributes ?? {}) as Record<string, unknown>;
  const text = `${o.title} ${o.description.slice(0, 2000)}`;
  const kind = a.kind === "project" || a.kind === "scholarship" ? a.kind : isProjectText(o.title) ? "project" : "scholarship";
  const statedLevels = words(a.levels).map((l) => l.toLowerCase()).flatMap((l): Level[] => ((LEVELS as readonly string[]).includes(l) ? [l as Level] : levelsFromText(l)));
  const levels = [...new Set(statedLevels.length ? statedLevels : levelsFromText(text))];
  const deadline = str(a.deadline ?? a.closeDate ?? a.applyBy, 10);
  const officialUrl = officialLink(a.officialUrl) ?? officialLink(o.canonicalApplyUrl);
  const award = num(a.award ?? a.awardAmount ?? a.amount);
  const stipend = num(a.stipend);
  const period = a.awardPeriod === "one_time" || a.awardPeriod === "per_year" || a.awardPeriod === "per_month" ? a.awardPeriod : undefined;
  const fields = words(a.fields ?? a.field);
  const documents = words(a.documents);
  return {
    kind,
    currency: /^[A-Z]{3}$/.test(str(a.currency)) ? str(a.currency) : "INR",
    ...(isDate(deadline) ? { deadline } : {}),
    ...(officialUrl ? { officialUrl } : {}),
    ...(levels.length ? { levels } : {}),
    ...(fields.length ? { fields } : {}),
    ...(str(a.region, 120) ? { region: str(a.region, 120) } : {}),
    ...(documents.length ? { documents } : {}),
    ...(kind === "scholarship" && award ? { awardAmount: award, ...(period ? { awardPeriod: period } : {}) } : {}),
    ...(kind === "project" && stipend !== undefined ? { stipend } : {}),
    ...(kind === "project" && num(a.durationWeeks) ? { durationWeeks: num(a.durationWeeks) } : {}),
    ...(a.certificate === true || a.certificate === "true" ? { certificate: true } : {}),
  };
}

/** An outside listing, or null when it can't be shown: no official link, past its deadline, or a fee to apply. */
export function outside(o: CanonicalOpportunity, today = new Date().toISOString().slice(0, 10)): ScholarshipListing | null {
  const rec = o.sourceRecords.find((r) => r.canonical) ?? o.sourceRecords[0];
  if (asksForFee(`${o.title}\n${o.description}`)) return null;
  const terms = termsFromAttributes(o);
  if (!terms.officialUrl || !stillOpen(terms, today)) return null;
  const notice = str((o.attributes as Record<string, unknown> | undefined)?.notice);
  return {
    id: o.id,
    origin: "outside",
    title: o.title,
    company: o.employer.name,
    ...(o.employer.domain ? { companyDomain: o.employer.domain } : {}),
    location: o.locations[0] ?? "",
    workMode: o.workplaceType,
    terms,
    termsFrom: "posting",
    skills: o.skills.slice(0, 12),
    description: o.description.slice(0, 1200),
    applyUrl: terms.officialUrl,
    postedAt: o.postedAt,
    sourceId: rec?.sourceId ?? "",
    sourceName: rec?.sourceName ?? "",
    ...(notice ? { notice } : {}),
  };
}

/** A WonderWorks organisation's open listing, with the terms it gave. */
export function wonderworksScholarship({ posting, org }: Awaited<ReturnType<typeof openScholarships>>[number], sourceName: string): ScholarshipListing {
  return { id: `ws_${posting.id}`, origin: "wonderstar", postingId: posting.id, title: posting.title, company: org.name, ...(org.domain ? { companyDomain: org.domain } : {}), companyVerified: org.verified, location: posting.location, workMode: posting.workMode, terms: posting.terms, termsFrom: "company", skills: posting.skills, description: posting.description.slice(0, 4000), questions: posting.questions, applyUrl: posting.terms.officialUrl, postedAt: posting.updatedAt, sourceId: WONDERSTAR_SCHOLARSHIPS, sourceName };
}

/** Search scholarships and projects for these words and places. Empty words: the latest listings. */
export async function searchScholarships(input: { query: string; places: string[]; refresh?: boolean }): Promise<ScholarshipSearchResult> {
  const query = input.query.trim().slice(0, 120);
  const places = input.places.map((p) => p.trim()).filter(Boolean).slice(0, 5);
  const [{ response, plan }, posted] = await Promise.all([
    search({ query: { text: query, locations: places }, searchMode: "balanced", limit: MAX_RESULTS, module: SCHOLARSHIPS, cache: input.refresh ? "refresh" : "use" }, { trigger: "search" }),
    openScholarships(),
  ]);
  const byPosting = new Map(posted.map((p) => [p.posting.id, p]));
  const results: ScholarshipListing[] = [];
  for (const o of response.results) {
    const ws = o.sourceRecords.find((r) => r.sourceId === WONDERSTAR_SCHOLARSHIPS);
    if (ws) {
      const p = byPosting.get(ws.sourceJobId);
      if (p) results.push(wonderworksScholarship(p, ws.sourceName));
    } else {
      const l = outside(o);
      if (l) results.push(l);
    }
  }
  const lines: ScholarshipSourceLine[] = response.sources.map((s) => ({
    id: s.sourceId,
    name: s.sourceName,
    state: s.outcome === "ok" ? "ok" : s.outcome === "empty" ? "empty" : s.outcome === "needs_setup" ? "needs_setup" : s.outcome === "skipped" ? "skipped" : "unavailable",
    count: results.filter((r) => r.sourceId === s.sourceId).length,
    ...(s.message ? { message: s.message } : {}),
  }));
  for (const sk of plan.skipped) if (!lines.some((l) => l.id === sk.id)) lines.push({ id: sk.id, name: sk.name, state: /credential/i.test(sk.reason) ? "needs_setup" : "skipped", count: 0, message: /credential/i.test(sk.reason) ? "Needs setup" : sk.reason });
  return { searched: { query, places }, results, sources: lines };
}
