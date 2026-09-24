/**
 * Canonicalization: many source observations → one CanonicalOpportunity per real posting
 * (spec §29–31).
 *
 * Two observations are the same posting when any of these match (union-find, so matches chain):
 *   1. the apply URL, normalized (scheme, host case, trailing slash, tracking params);
 *   2. employer + normalized title + normalized location — the key WonderJobs' own dedupe uses;
 *   3. employer + normalized title + a fingerprint of the description's opening text, which catches
 *      the same posting listed with different location strings ("Remote" vs "Remote (Worldwide)").
 * Semantic similarity is not used: it would be a guess, and a wrong merge hides a real job.
 *
 * The canonical record is the most authoritative source (employer/ATS first). Each field is taken
 * from the most authoritative record that has it, and its provenance says which source that was —
 * a weaker source can fill a gap but never overwrite what a stronger one said.
 */
import type { Job } from "@/domain/jobs/types";
import { PROTOCOL_VERSION, sourceAuthority, type CanonicalOpportunity, type Confidence, type FieldProvenance, type JobSourceDescriptor, type ProvenanceField, type SourceRecord } from "./protocol";

export interface Observation {
  source: JobSourceDescriptor;
  job: Job;
}

export interface CanonicalizeResult {
  opportunities: CanonicalOpportunity[];
  /** Observations in, before merging. */
  normalized: number;
  duplicates: number;
}

/* ------------------------------------------------------------------ keys */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\bsr\.?\b/g, "senior")
    .replace(/\bjr\.?\b/g, "junior")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function normalizeTitle(title: string) {
  return norm(title);
}

const TRACKING = /^(utm_|gh_src|source|ref|src|lever-source|lever-origin)/i;

export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.hash = "";
    const path = u.pathname.replace(/\/(apply|application)\/?$/i, "").replace(/\/+$/, "");
    const q = u.searchParams.toString();
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${path}${q ? `?${q}` : ""}`;
  } catch {
    return null;
  }
}

/** A cheap, stable hash (FNV-1a) — ids only, never security. */
export function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function descriptionFingerprint(description: string) {
  const words = norm(description).split(" ").filter((w) => w.length > 3).slice(0, 60);
  return words.length >= 20 ? fnv(words.join(" ")) : null;
}

/**
 * Coarse location for the fingerprint key: "remote" for any remote spelling, else the first place
 * name. Companies reuse one description for the same role in several cities — those are separate
 * postings, so the fingerprint only merges within the same place.
 */
export function locationFamily(location: string) {
  if (/\b(remote|anywhere|worldwide|work from home|wfh)\b/i.test(location)) return "remote";
  return norm(location.split(/[,(·|/]| - /)[0] ?? "") || "unspecified";
}

function keysFor(j: Job): string[] {
  const employer = norm(j.company);
  const title = norm(j.title);
  const keys = [`id:${employer}|${title}|${norm(j.location)}`];
  const url = normalizeUrl(j.applyUrl);
  if (url) keys.push(`url:${url}`);
  const fp = descriptionFingerprint(j.description);
  if (fp) keys.push(`fp:${employer}|${title}|${locationFamily(j.location)}|${fp}`);
  return keys;
}

/* ------------------------------------------------------------ union-find */

/**
 * A source never lists one posting twice under two ids, so two observations from the same source
 * with different source job ids are different postings — e.g. the same title opened for two teams.
 * Merging only ever joins observations from different sources (or the same record seen twice).
 */
function groupObservations(obs: Observation[]): Observation[][] {
  const parent = obs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  // Per group root: sourceId → the one source job id that group holds for it.
  const ids = obs.map((o) => new Map([[o.source.id, o.job.externalId]]));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    for (const [src, id] of ids[rb]) {
      const mine = ids[ra].get(src);
      if (mine !== undefined && mine !== id) return; // would merge two postings of one source
    }
    for (const [src, id] of ids[rb]) ids[ra].set(src, id);
    parent[rb] = ra;
  };
  const byKey = new Map<string, number[]>();
  obs.forEach((o, i) => {
    for (const k of keysFor(o.job)) {
      const seen = byKey.get(k);
      if (!seen) byKey.set(k, [i]);
      else {
        for (const j of seen) union(j, i);
        seen.push(i);
      }
    }
  });
  const groups = new Map<number, Observation[]>();
  obs.forEach((o, i) => {
    const r = find(i);
    const g = groups.get(r) ?? [];
    g.push(o);
    groups.set(r, g);
  });
  return [...groups.values()];
}

/* --------------------------------------------------------------- merging */

const confidenceFor = (authority: number): Confidence => (authority >= 4 ? "high" : authority >= 2 ? "medium" : "low");

function completeness(j: Job) {
  return (j.description ? Math.min(3, j.description.length / 800) : 0) + (j.salaryMax != null ? 1 : 0) + (j.location && j.location !== "Not specified" ? 1 : 0);
}

function merge(group: Observation[], now: number): CanonicalOpportunity {
  // Strongest source first; within a tier the fuller record, then the earliest observed.
  const ranked = [...group].sort((a, b) => sourceAuthority(b.source) - sourceAuthority(a.source) || completeness(b.job) - completeness(a.job) || a.job.observedAt.localeCompare(b.job.observedAt));
  const top = ranked[0];
  const provenance: FieldProvenance[] = [];
  const pick = <T>(field: ProvenanceField, get: (j: Job) => T | undefined | null, has: (v: T) => boolean = (v) => v != null && String(v).trim() !== ""): T | undefined => {
    for (const o of ranked) {
      const v = get(o.job);
      if (v != null && has(v)) {
        provenance.push({ field, sourceId: o.source.id, observedAt: o.job.observedAt, confidence: confidenceFor(sourceAuthority(o.source)) });
        return v;
      }
    }
    return undefined;
  };

  const title = pick("title", (j) => j.title) ?? top.job.title;
  const employer = pick("employer", (j) => (j.company && j.company !== "Unknown company" ? j.company : undefined)) ?? top.job.company;
  const location = pick("locations", (j) => (j.location && j.location !== "Not specified" ? j.location : undefined)) ?? top.job.location;
  const description = pick("description", (j) => j.description) ?? "";
  const salarySource = ranked.find((o) => o.job.salaryMax != null || o.job.salaryMin != null);
  if (salarySource) provenance.push({ field: "compensation", sourceId: salarySource.source.id, observedAt: salarySource.job.observedAt, confidence: confidenceFor(sourceAuthority(salarySource.source)) });
  const postedAt = pick("postedAt", (j) => j.postedAt) ?? top.job.postedAt;
  const applyUrl = pick("canonicalApplyUrl", (j) => j.applyUrl) ?? top.job.applyUrl;
  const workMode = pick("workplaceType", (j) => j.workMode) ?? top.job.workMode;

  const records: SourceRecord[] = ranked.map((o, i) => ({
    sourceId: o.source.id,
    sourceName: o.source.name,
    provider: o.source.provider,
    category: o.source.category,
    accessStrategy: o.source.accessStrategy,
    sourceJobId: o.job.externalId,
    url: o.job.applyUrl,
    observedAt: o.job.observedAt,
    legacyJobId: o.job.id,
    canonical: i === 0,
  }));
  const lastObservedAt = ranked.reduce((m, o) => (o.job.observedAt > m ? o.job.observedAt : m), top.job.observedAt);
  const skills = [...new Set(ranked.flatMap((o) => o.job.skills))].slice(0, 20);

  const opp: CanonicalOpportunity = {
    id: `opp_${fnv(keysFor(top.job)[0])}`,
    protocolVersion: PROTOCOL_VERSION,
    employer: { name: employer, domain: ranked.find((o) => o.job.companyDomain)?.job.companyDomain },
    title,
    normalizedTitle: normalizeTitle(title),
    locations: [location],
    country: top.job.country,
    workplaceType: workMode,
    compensation: salarySource ? { min: salarySource.job.salaryMin, max: salarySource.job.salaryMax, currency: salarySource.job.currency } : undefined,
    description,
    requirements: top.job.requirements,
    niceToHave: top.job.niceToHave,
    skills,
    enrichment: { seniority: top.job.seniority, industry: top.job.industry, tags: top.job.tags },
    postedAt,
    canonicalApplyUrl: applyUrl,
    applyPath: top.job.applyPath,
    sourceRecords: records,
    provenance,
    quality: {
      requiredFieldsPresent: !!(title && employer && applyUrl && description),
      validApplyUrl: normalizeUrl(applyUrl) !== null,
      compensationDisclosed: !!salarySource,
      employerVerified: ranked.some((o) => o.source.category === "ats" || o.job.onEmployerSite),
      sourceCount: new Set(ranked.map((o) => o.source.id)).size,
    },
    freshness: { postedAt, lastObservedAt, ageDays: Math.max(0, Math.floor((now - Date.parse(postedAt)) / 86_400_000)) },
  };
  return opp;
}

export function canonicalize(obs: Observation[], now = Date.now()): CanonicalizeResult {
  const groups = groupObservations(obs);
  const opportunities = groups.map((g) => merge(g, now));
  return { opportunities, normalized: obs.length, duplicates: obs.length - opportunities.length };
}

/**
 * Warm pool + live retrieval (spec §67): live results win; a warm opportunity is added only when no
 * live result is the same posting (same id or same normalized apply URL). Returns how many of each.
 */
export function mergeWithWarm(live: CanonicalOpportunity[], warm: CanonicalOpportunity[]): { results: CanonicalOpportunity[]; live: number; warm: number } {
  const ids = new Set(live.map((o) => o.id));
  const urls = new Set(live.map((o) => normalizeUrl(o.canonicalApplyUrl)).filter((u): u is string => !!u));
  const extra = warm.filter((o) => {
    const u = normalizeUrl(o.canonicalApplyUrl);
    if (ids.has(o.id) || (u && urls.has(u))) return false;
    ids.add(o.id);
    if (u) urls.add(u);
    return true;
  });
  return { results: [...live, ...extra], live: live.length, warm: extra.length };
}
