/**
 * The WonderJobs side of Protocol v1: turning a candidate's search into a `SearchRequest`, and a
 * `CanonicalOpportunity` into the `CanonicalJob` the rest of WonderJobs (matching, quality, saved
 * jobs, applications) already understands.
 *
 * Identity is preserved: a job's id is the id WonderJobs has always given the canonical posting
 * (`careers_…`, `remotive_…`), so saved jobs, applications and the extension keep resolving.
 */
import type { CanonicalJob, JobSourceSighting } from "@/domain/jobs/types";
import type { Evidence } from "@/domain/workflow/types";
import { ageLabel } from "./cache";
import { ACCESS_LABEL, type CanonicalOpportunity, type SearchMetadata, type SearchMode, type SearchRequest, type SourceSearchStatus } from "./protocol";

export function searchRequestFor(criteria: { query: string; locations: string[]; variants?: string[] }, sourceIds: string[], searchMode: SearchMode = "balanced", limit = 300): SearchRequest {
  // Only what JobsLake needs to search (spec §57): terms, broader phrasings of them, places and which sources — nothing about the candidate.
  return { query: { text: criteria.query, locations: criteria.locations, ...(criteria.variants?.length ? { variants: criteria.variants } : {}) }, sourceIds, searchMode, limit };
}

/** Evidence for the phrasings a smart search ran alongside the candidate's own words. */
export function phrasingEvidence(variants: string[], fromAi: string[]): Evidence | null {
  if (!variants.length) return null;
  return { label: "Also searched", value: `${variants.map((v) => `“${v}”`).join(", ")}${fromAi.length ? ` · ${fromAi.length === variants.length ? "picked" : `${fromAi.length} picked`} by AI from your Career Profile` : ""}`, tone: "info" };
}

export function toCanonicalJob(o: CanonicalOpportunity): CanonicalJob {
  const top = o.sourceRecords.find((r) => r.canonical) ?? o.sourceRecords[0];
  const others = o.sourceRecords.filter((r) => r !== top);
  const name = new Map(o.sourceRecords.map((r) => [r.sourceId, r.sourceName]));
  const sightings: JobSourceSighting[] = o.sourceRecords.map((r) => ({
    sourceId: r.sourceId,
    sourceName: r.sourceName,
    provider: r.provider,
    accessLabel: ACCESS_LABEL[r.accessStrategy],
    employerSource: r.category === "ats",
    url: r.url,
    observedAt: r.observedAt,
    canonical: r === top,
  }));
  return {
    id: top.legacyJobId,
    title: o.title,
    company: o.employer.name,
    companyDomain: o.employer.domain,
    location: o.locations[0] ?? "",
    country: o.country,
    workMode: o.workplaceType,
    salaryMin: o.compensation?.min,
    salaryMax: o.compensation?.max,
    currency: o.compensation?.currency ?? "",
    postedAt: o.postedAt,
    observedAt: o.freshness.lastObservedAt,
    description: o.description,
    requirements: o.requirements,
    niceToHave: o.niceToHave,
    skills: o.skills,
    seniority: o.enrichment.seniority,
    industry: o.enrichment.industry,
    applyUrl: o.canonicalApplyUrl,
    applyPath: o.applyPath,
    onEmployerSite: o.quality.employerVerified && o.applyPath === "employer_site",
    repostCount: 0,
    tags: o.enrichment.tags,
    canonicalKey: o.id,
    sourceIds: [...new Set(o.sourceRecords.map((r) => r.legacySourceId))],
    duplicateOf: others.map((r) => r.legacyJobId),
    lake: {
      opportunityId: o.id,
      sightings,
      employerVerified: o.quality.employerVerified,
      fieldSources: o.provenance
        .filter((p): p is typeof p & { field: "title" | "canonicalApplyUrl" | "postedAt" | "compensation" } => p.field === "title" || p.field === "canonicalApplyUrl" || p.field === "postedAt" || p.field === "compensation")
        .map((p) => ({ field: p.field, sourceName: name.get(p.sourceId) ?? p.sourceId })),
    },
  };
}

/**
 * The search stage's evidence for one source, as JobsLake reported it. Skipped sources (not asked,
 * by plan) aren't evidence of anything and return null — except a paid source, which always says why
 * it wasn't asked, so the candidate can see it was considered.
 */
export function sourceEvidence(s: SourceSearchStatus): Evidence | null {
  switch (s.outcome) {
    case "ok":
    case "empty": {
      const n = `${s.retrieved.toLocaleString("en-IN")} jobs`;
      // A cached answer says how old it is; one standing in for a failed source says that too.
      if (s.cachedAt && s.cacheUse === "fallback") return { label: s.sourceName, value: `Didn't answer — ${n} from its answer ${ageLabel(s.cachedAt, Date.now())} ago`, tone: "warning" };
      if (s.cachedAt) return { label: s.sourceName, value: `${n} · from the same search ${ageLabel(s.cachedAt, Date.now())} ago`, tone: "success" };
      return { label: s.sourceName, value: n, tone: "success" };
    }
    case "needs_setup":
      return { label: s.sourceName, value: "Needs setup", tone: "warning" };
    case "timeout":
      return { label: s.sourceName, value: "Didn't respond in time", tone: "danger" };
    case "unavailable":
      return { label: s.sourceName, value: "Unavailable", tone: "danger" };
    case "skipped":
      return s.paid && s.message ? { label: s.sourceName, value: s.message, tone: "neutral" } : null;
  }
}

/** "Searched N sources" — how broad the search actually was, and how much JobsLake merged. */
export function breadthEvidence(m: SearchMetadata): Evidence[] {
  const out: Evidence[] = [{ label: "Sources searched", value: `${m.sourcesSucceeded} of ${m.sourcesPlanned} answered`, tone: m.sourcesFailed ? "warning" : "info" }];
  if (m.warm) out.push({ label: "From recent searches", value: `${m.warm.toLocaleString("en-IN")} jobs seen in the last 7 days`, tone: "info" });
  return out;
}

/** Per-source contribution for JobsLake telemetry: how many of each source's jobs were relevant / strong. Counts only. */
export function contributionBySource(jobs: CanonicalJob[], fitById: Record<string, "strong" | "worth_considering" | "stretch" | "low_fit" | undefined>) {
  const out: Record<string, { relevant: number; strong: number }> = {};
  for (const j of jobs) {
    const fit = fitById[j.id];
    for (const s of j.lake?.sightings ?? []) {
      const row = (out[s.sourceId] ??= { relevant: 0, strong: 0 });
      if (fit === "strong" || fit === "worth_considering") row.relevant++;
      if (fit === "strong") row.strong++;
    }
  }
  return out;
}
