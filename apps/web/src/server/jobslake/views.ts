/**
 * Read models for the JobsLake APIs and admin portal: sources (never with a secret), health,
 * coverage, data quality and alerts. REST, MCP and the admin pages all serialize through these, so
 * the same question gets the same answer everywhere.
 *
 * Every number here is counted from stored runs or warm-pool opportunities. When there is nothing to
 * count the value is null / empty and the UI says "No data yet" — nothing is estimated.
 */
import { deriveAlerts, type Alert, type SourceHealth } from "@/domain/jobslake/health";
import { ACCESS_LABEL, CATEGORY_LABEL, STATUS_LABEL, type CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { credentialStatus, type CredentialStatus } from "./credentials";
import { healthBySource } from "./core";
import { isAvailable, listSources } from "./registry";
import { jobsLakeStore } from "./store";
import type { SourceRecord } from "./types";

export interface SourceView extends Omit<SourceRecord, "secretRef"> {
  statusLabel: string;
  accessLabel: string;
  categoryLabel: string;
  /** Whether this deployment can query it right now. */
  available: boolean;
  health: SourceHealth | null;
  credential: CredentialStatus | null;
}

/** A source for an API response. `secretRef` is dropped; only masked credential status is kept. */
export async function sourceView(s: SourceRecord, health: Record<string, SourceHealth>): Promise<SourceView> {
  const { secretRef, ...rest } = s;
  return {
    ...rest,
    statusLabel: STATUS_LABEL[s.status],
    accessLabel: ACCESS_LABEL[s.accessStrategy],
    categoryLabel: CATEGORY_LABEL[s.category],
    available: await isAvailable(s),
    health: health[s.id] ?? null,
    credential: await credentialStatus(secretRef),
  };
}

export async function listSourceViews(): Promise<SourceView[]> {
  const [sources, health] = await Promise.all([listSources(), healthBySource()]);
  return Promise.all(sources.map((s) => sourceView(s, health)));
}

/* -------------------------------------------------------------- coverage */

const ROLE_FAMILIES: [string, RegExp][] = [
  ["Security", /\b(security|iam|identity|infosec|soc|threat|cyber|grc|privacy)\b/i],
  ["Data & AI", /\b(data|analytics|analyst|machine learning|ml|ai|scientist|bi)\b/i],
  ["Engineering", /\b(engineer|engineering|developer|sre|devops|architect|programmer|swe|qa|test)\b/i],
  ["Product", /\b(product manager|product owner|product lead|head of product|product director|\bpm\b|product management)\b/i],
  ["Design", /\b(design|designer|ux|ui|researcher)\b/i],
  ["Sales", /\b(sales|account executive|business development|bdr|sdr|account manager)\b/i],
  ["Marketing", /\b(marketing|growth|content|seo|brand|communications|pr)\b/i],
  ["Customer", /\b(customer|support|success|service)\b/i],
  ["Finance & Legal", /\b(finance|accounting|accountant|controller|legal|counsel|tax|payroll)\b/i],
  ["People", /\b(recruit|talent|people|hr|human resources)\b/i],
  ["Operations", /\b(operations|ops|program manager|project manager|supply|logistics)\b/i],
];

/** Derived from the title only — labelled "derived" wherever it's shown. */
export function roleFamily(title: string): string {
  return ROLE_FAMILIES.find(([, re]) => re.test(title))?.[0] ?? "Other";
}

const FRESHNESS_BUCKETS: [string, number][] = [
  ["Under 1 day", 1],
  ["1–7 days", 7],
  ["8–30 days", 30],
  ["Over 30 days", Infinity],
];

type Counts = { key: string; count: number }[];
function tally(values: string[]): Counts {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export interface CoverageView {
  opportunities: number;
  since: string;
  bySource: Counts;
  byCountry: Counts;
  byRoleFamily: Counts;
  bySeniority: Counts;
  byIndustry: Counts;
  byFreshness: Counts;
  byWorkplace: Counts;
}

export function coverageFrom(opps: CanonicalOpportunity[], sinceIso: string, sourceNames: Map<string, string>): CoverageView {
  return {
    opportunities: opps.length,
    since: sinceIso,
    bySource: tally(opps.flatMap((o) => [...new Set(o.sourceRecords.map((r) => sourceNames.get(r.sourceId) ?? r.sourceName))])),
    byCountry: tally(opps.map((o) => o.country || "Unknown")),
    byRoleFamily: tally(opps.map((o) => roleFamily(o.title))),
    bySeniority: tally(opps.map((o) => o.enrichment.seniority)),
    byIndustry: tally(opps.map((o) => o.enrichment.industry || "Unknown")),
    byFreshness: FRESHNESS_BUCKETS.map(([key, max], i) => ({ key, count: opps.filter((o) => o.freshness.ageDays <= max && (i === 0 || o.freshness.ageDays > FRESHNESS_BUCKETS[i - 1][1])).length })),
    byWorkplace: tally(opps.map((o) => o.workplaceType)),
  };
}

/* --------------------------------------------------------------- quality */

export interface QualityView {
  opportunities: number;
  /** Each a share 0–1 of `opportunities`, or null when there are none. */
  requiredFields: number | null;
  validApplyUrls: number | null;
  freshUnder7Days: number | null;
  employerVerified: number | null;
  compensationDisclosed: number | null;
  multiSource: number | null;
  /** Share of retrieved records that were merged into another (from runs). */
  duplicateRate: number | null;
  bySource: { sourceId: string; name: string; retrieved: number; valid: number; duplicates: number; validRate: number | null; duplicateRate: number | null }[];
}

const share = (n: number, d: number) => (d ? n / d : null);

export function qualityFrom(opps: CanonicalOpportunity[], health: Record<string, SourceHealth>, sourceNames: Map<string, string>): QualityView {
  const n = opps.length;
  const c = (f: (o: CanonicalOpportunity) => boolean) => share(opps.filter(f).length, n);
  const hs = Object.values(health);
  const retrieved = hs.reduce((a, h) => a + h.retrieved, 0);
  return {
    opportunities: n,
    requiredFields: c((o) => o.quality.requiredFieldsPresent),
    validApplyUrls: c((o) => o.quality.validApplyUrl),
    freshUnder7Days: c((o) => o.freshness.ageDays <= 7),
    employerVerified: c((o) => o.quality.employerVerified),
    compensationDisclosed: c((o) => o.quality.compensationDisclosed),
    multiSource: c((o) => o.quality.sourceCount > 1),
    duplicateRate: share(hs.reduce((a, h) => a + h.duplicates, 0), retrieved),
    bySource: hs
      .filter((h) => h.retrieved > 0)
      .map((h) => ({ sourceId: h.sourceId, name: sourceNames.get(h.sourceId) ?? h.sourceId, retrieved: h.retrieved, valid: h.valid, duplicates: h.duplicates, validRate: share(h.valid, h.retrieved), duplicateRate: share(h.duplicates, h.retrieved) }))
      .sort((a, b) => b.retrieved - a.retrieved),
  };
}

/* ----------------------------------------------------- overview / alerts */

export async function poolSince(days = 7) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  return { since, opps: await jobsLakeStore().listOpportunities({ sinceIso: since, limit: 5000 }) };
}

export async function coverageView(days = 7): Promise<CoverageView> {
  const [{ since, opps }, sources] = await Promise.all([poolSince(days), listSources()]);
  return coverageFrom(opps, since, new Map(sources.map((s) => [s.id, s.name])));
}

export async function qualityView(days = 7): Promise<QualityView> {
  const [{ opps }, sources, health] = await Promise.all([poolSince(days), listSources(), healthBySource(days)]);
  return qualityFrom(opps, health, new Map(sources.map((s) => [s.id, s.name])));
}

export async function alertsView(): Promise<Alert[]> {
  const [sources, runs] = await Promise.all([listSources(), jobsLakeStore().listRuns({ sinceIso: new Date(Date.now() - 7 * 86_400_000).toISOString(), limit: 5000 })]);
  // Only sources JobsLake is meant to be reading raise alerts; a paused or do-not-use source is quiet by design.
  return sources
    .filter((s) => s.status === "active" || s.status === "degraded")
    .flatMap((s) => deriveAlerts(s.id, s.name, runs))
    .sort((a, b) => (a.severity === b.severity ? b.since.localeCompare(a.since) : a.severity === "critical" ? -1 : 1));
}

export interface OverviewView {
  store: Awaited<ReturnType<ReturnType<typeof jobsLakeStore>["status"]>>;
  sources: { total: number; active: number; available: number; needsSetup: number; paused: number; doNotUse: number; draft: number };
  health: { healthy: number; degraded: number; down: number; noData: number };
  runs24h: { total: number; failed: number; retrieved: number; valid: number };
  pool: { opportunities: number; employerVerified: number | null; multiSource: number | null };
  alerts: Alert[];
  recentRuns: Awaited<ReturnType<ReturnType<typeof jobsLakeStore>["listRuns"]>>;
}

export async function overviewView(): Promise<OverviewView> {
  const store = jobsLakeStore();
  const [status, views, runs, { opps }, alerts] = await Promise.all([store.status(), listSourceViews(), store.listRuns({ sinceIso: new Date(Date.now() - 86_400_000).toISOString(), limit: 5000 }), poolSince(7), alertsView()]);
  const q = qualityFrom(opps, {}, new Map());
  const live = views.filter((v) => v.status === "active" || v.status === "degraded");
  return {
    store: status,
    sources: {
      total: views.length,
      active: live.length,
      available: live.filter((v) => v.available).length,
      needsSetup: live.filter((v) => !v.available).length,
      paused: views.filter((v) => v.status === "paused" || v.status === "disabled").length,
      doNotUse: views.filter((v) => v.status === "do_not_use").length,
      draft: views.filter((v) => v.status === "draft" || v.status === "testing").length,
    },
    health: {
      healthy: live.filter((v) => v.health?.state === "healthy").length,
      degraded: live.filter((v) => v.health?.state === "degraded").length,
      down: live.filter((v) => v.health?.state === "down").length,
      noData: live.filter((v) => !v.health || v.health.state === "no_data").length,
    },
    runs24h: {
      total: runs.length,
      failed: runs.filter((r) => r.outcome === "timeout" || r.outcome === "unavailable" || r.outcome === "needs_setup").length,
      retrieved: runs.reduce((a, r) => a + r.retrieved, 0),
      valid: runs.reduce((a, r) => a + r.valid, 0),
    },
    pool: { opportunities: opps.length, employerVerified: q.employerVerified, multiSource: q.multiSource },
    alerts,
    recentRuns: runs.slice(0, 20),
  };
}

/** What `GET /v1/sources` gives a service caller: the descriptor, status and health — no config internals. */
export function publicSource(v: SourceView) {
  return {
    id: v.id,
    name: v.name,
    provider: v.provider,
    category: v.category,
    accessStrategy: v.accessStrategy,
    accessLabel: v.accessLabel,
    protocolVersion: v.protocolVersion,
    status: v.status,
    statusLabel: v.statusLabel,
    statusReason: v.statusReason,
    geography: v.geography,
    capabilities: v.capabilities,
    available: v.available,
    health: v.health ? { state: v.health.state, successRate: v.health.successRate, p50LatencyMs: v.health.p50LatencyMs, lastRunAt: v.health.lastRunAt, runs: v.health.runs } : null,
  };
}
