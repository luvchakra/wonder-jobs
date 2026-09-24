/**
 * JobsLake persistence: Supabase (migration 0007) when configured, memory otherwise.
 *
 * If Supabase is configured but migration 0007 hasn't been applied, the store falls back to memory
 * and `status()` says so — the admin portal shows it, so nobody mistakes an in-memory history that
 * resets on restart for durable storage.
 */
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import type { SourceRun } from "@/domain/jobslake/health";
import { getSupabaseAdmin } from "@/server/supabase";
import type { AuditEvent, SourceRecord, StoredCredential } from "./types";

export interface StoreStatus {
  backend: "supabase" | "memory";
  durable: boolean;
  message: string;
}

export interface JobsLakeStore {
  status(): Promise<StoreStatus>;
  listSources(): Promise<SourceRecord[]>;
  putSource(rec: SourceRecord): Promise<void>;
  deleteSource(id: string): Promise<void>;
  recordRuns(runs: SourceRun[]): Promise<void>;
  listRuns(opts?: { sourceId?: string; limit?: number; sinceIso?: string }): Promise<(SourceRun & { relevant?: number; strong?: number })[]>;
  recordContribution(requestId: string, bySource: Record<string, { relevant: number; strong: number }>): Promise<void>;
  appendAudit(e: AuditEvent): Promise<void>;
  listAudit(limit?: number, sourceId?: string): Promise<AuditEvent[]>;
  putCredential(c: StoredCredential): Promise<void>;
  getCredential(ref: string): Promise<StoredCredential | undefined>;
  deleteCredential(ref: string): Promise<void>;
  upsertOpportunities(opps: CanonicalOpportunity[]): Promise<void>;
  getOpportunity(id: string): Promise<CanonicalOpportunity | undefined>;
  listOpportunities(opts?: { limit?: number; sinceIso?: string }): Promise<CanonicalOpportunity[]>;
}

type RunRow = SourceRun & { relevant?: number; strong?: number };

class MemoryStore implements JobsLakeStore {
  sources = new Map<string, SourceRecord>();
  runs: RunRow[] = [];
  audit: AuditEvent[] = [];
  creds = new Map<string, StoredCredential>();
  opps = new Map<string, CanonicalOpportunity>();
  constructor(private reason = "No database configured — JobsLake history is kept in memory and resets when the server restarts.") {}
  async status(): Promise<StoreStatus> {
    return { backend: "memory", durable: false, message: this.reason };
  }
  async listSources() {
    return [...this.sources.values()];
  }
  async putSource(rec: SourceRecord) {
    this.sources.set(rec.id, structuredClone(rec));
  }
  async deleteSource(id: string) {
    this.sources.delete(id);
  }
  async recordRuns(runs: SourceRun[]) {
    this.runs.unshift(...runs.map((r) => ({ ...r })));
    if (this.runs.length > 5000) this.runs.length = 5000;
  }
  async listRuns(opts: { sourceId?: string; limit?: number; sinceIso?: string } = {}) {
    return this.runs.filter((r) => (!opts.sourceId || r.sourceId === opts.sourceId) && (!opts.sinceIso || r.startedAt >= opts.sinceIso)).slice(0, opts.limit ?? 500);
  }
  async recordContribution(requestId: string, bySource: Record<string, { relevant: number; strong: number }>) {
    for (const r of this.runs) if (r.requestId === requestId && bySource[r.sourceId]) Object.assign(r, bySource[r.sourceId]);
  }
  async appendAudit(e: AuditEvent) {
    this.audit.unshift(e);
    if (this.audit.length > 2000) this.audit.length = 2000;
  }
  async listAudit(limit = 100, sourceId?: string) {
    return this.audit.filter((a) => !sourceId || a.sourceId === sourceId).slice(0, limit);
  }
  async putCredential(c: StoredCredential) {
    this.creds.set(c.ref, c);
  }
  async getCredential(ref: string) {
    return this.creds.get(ref);
  }
  async deleteCredential(ref: string) {
    this.creds.delete(ref);
  }
  async upsertOpportunities(opps: CanonicalOpportunity[]) {
    for (const o of opps) this.opps.set(o.id, o);
    if (this.opps.size > 20_000) {
      const oldest = [...this.opps.values()].sort((a, b) => a.freshness.lastObservedAt.localeCompare(b.freshness.lastObservedAt)).slice(0, this.opps.size - 20_000);
      for (const o of oldest) this.opps.delete(o.id);
    }
  }
  async getOpportunity(id: string) {
    return this.opps.get(id) ?? [...this.opps.values()].find((o) => o.sourceRecords.some((r) => r.legacyJobId === id));
  }
  async listOpportunities(opts: { limit?: number; sinceIso?: string } = {}) {
    return [...this.opps.values()]
      .filter((o) => !opts.sinceIso || o.freshness.lastObservedAt >= opts.sinceIso)
      .sort((a, b) => b.freshness.lastObservedAt.localeCompare(a.freshness.lastObservedAt))
      .slice(0, opts.limit ?? 500);
  }
}

const MISSING = /42P01|PGRST205|does not exist|schema cache/i;

/** Supabase-backed store that degrades to memory, visibly, when the JobsLake tables are missing. */
class SupabaseStore implements JobsLakeStore {
  private fallback: MemoryStore | null = null;
  private probed: Promise<void> | null = null;
  private sb() {
    const sb = getSupabaseAdmin();
    if (!sb) throw new Error("Supabase is not configured");
    return sb.schema("wonderjobs");
  }
  private async ready(): Promise<MemoryStore | null> {
    if (!this.probed) {
      this.probed = (async () => {
        const { error } = await this.sb().from("jobslake_sources").select("id").limit(1);
        if (error && MISSING.test(`${error.code} ${error.message}`)) this.fallback = new MemoryStore("Database is connected, but the JobsLake tables don't exist yet — apply migration 0007_jobslake.sql. Until then JobsLake history is kept in memory and resets when the server restarts.");
      })();
    }
    await this.probed;
    return this.fallback;
  }
  private fail(what: string, error: { message: string }): never {
    throw new Error(`JobsLake could not ${what}: ${error.message}`);
  }

  async status(): Promise<StoreStatus> {
    const fb = await this.ready();
    return fb ? fb.status() : { backend: "supabase", durable: true, message: "Stored in the WonderJobs database." };
  }
  async listSources() {
    const fb = await this.ready();
    if (fb) return fb.listSources();
    const { data, error } = await this.sb().from("jobslake_sources").select("record");
    if (error) this.fail("load sources", error);
    return (data ?? []).map((r) => r.record as SourceRecord);
  }
  async putSource(rec: SourceRecord) {
    const fb = await this.ready();
    if (fb) return fb.putSource(rec);
    const { error } = await this.sb().from("jobslake_sources").upsert({ id: rec.id, record: rec, status: rec.status, updated_at: new Date().toISOString() });
    if (error) this.fail("save the source", error);
  }
  async deleteSource(id: string) {
    const fb = await this.ready();
    if (fb) return fb.deleteSource(id);
    const { error } = await this.sb().from("jobslake_sources").delete().eq("id", id);
    if (error) this.fail("delete the source", error);
  }
  async recordRuns(runs: SourceRun[]) {
    const fb = await this.ready();
    if (fb) return fb.recordRuns(runs);
    if (!runs.length) return;
    const rows = runs.map((r) => ({ id: r.id, source_id: r.sourceId, trigger: r.trigger, request_id: r.requestId ?? null, started_at: r.startedAt, duration_ms: r.durationMs, outcome: r.outcome, retrieved: r.retrieved, valid: r.valid, duplicates: r.duplicates, error_code: r.errorCode ?? null, message: r.message ?? null }));
    const { error } = await this.sb().from("jobslake_runs").insert(rows);
    if (error) this.fail("record runs", error);
  }
  async listRuns(opts: { sourceId?: string; limit?: number; sinceIso?: string } = {}) {
    const fb = await this.ready();
    if (fb) return fb.listRuns(opts);
    let q = this.sb().from("jobslake_runs").select("*").order("started_at", { ascending: false }).limit(opts.limit ?? 500);
    if (opts.sourceId) q = q.eq("source_id", opts.sourceId);
    if (opts.sinceIso) q = q.gte("started_at", opts.sinceIso);
    const { data, error } = await q;
    if (error) this.fail("load runs", error);
    return (data ?? []).map((r) => ({ id: r.id, sourceId: r.source_id, trigger: r.trigger, requestId: r.request_id ?? undefined, startedAt: new Date(r.started_at).toISOString(), durationMs: r.duration_ms, outcome: r.outcome, retrieved: r.retrieved, valid: r.valid, duplicates: r.duplicates, relevant: r.relevant ?? undefined, strong: r.strong ?? undefined, errorCode: r.error_code ?? undefined, message: r.message ?? undefined }));
  }
  async recordContribution(requestId: string, bySource: Record<string, { relevant: number; strong: number }>) {
    const fb = await this.ready();
    if (fb) return fb.recordContribution(requestId, bySource);
    for (const [sourceId, v] of Object.entries(bySource)) {
      const { error } = await this.sb().from("jobslake_runs").update({ relevant: v.relevant, strong: v.strong }).eq("request_id", requestId).eq("source_id", sourceId);
      if (error) this.fail("record contribution", error);
    }
  }
  async appendAudit(e: AuditEvent) {
    const fb = await this.ready();
    if (fb) return fb.appendAudit(e);
    const { error } = await this.sb().from("jobslake_audit").insert({ at: e.at, actor: e.actor, action: e.action, source_id: e.sourceId ?? null, detail: e.detail ?? {} });
    if (error) this.fail("write the audit trail", error);
  }
  async listAudit(limit = 100, sourceId?: string) {
    const fb = await this.ready();
    if (fb) return fb.listAudit(limit, sourceId);
    let q = this.sb().from("jobslake_audit").select("*").order("at", { ascending: false }).limit(limit);
    if (sourceId) q = q.eq("source_id", sourceId);
    const { data, error } = await q;
    if (error) this.fail("load the audit trail", error);
    return (data ?? []).map((r) => ({ at: new Date(r.at).toISOString(), actor: r.actor, action: r.action, sourceId: r.source_id ?? undefined, detail: r.detail ?? {} }));
  }
  async putCredential(c: StoredCredential) {
    const fb = await this.ready();
    if (fb) return fb.putCredential(c);
    const { error } = await this.sb().from("jobslake_credentials").upsert({ ref: c.ref, ciphertext: c.ciphertext, masked: c.masked, created_at: c.createdAt, replaced_at: c.replacedAt ?? null });
    if (error) this.fail("save the credential", error);
  }
  async getCredential(ref: string) {
    const fb = await this.ready();
    if (fb) return fb.getCredential(ref);
    const { data, error } = await this.sb().from("jobslake_credentials").select("*").eq("ref", ref).maybeSingle();
    if (error) this.fail("load the credential", error);
    return data ? { ref: data.ref, ciphertext: data.ciphertext, masked: data.masked, createdAt: new Date(data.created_at).toISOString(), replacedAt: data.replaced_at ?? undefined } : undefined;
  }
  async deleteCredential(ref: string) {
    const fb = await this.ready();
    if (fb) return fb.deleteCredential(ref);
    const { error } = await this.sb().from("jobslake_credentials").delete().eq("ref", ref);
    if (error) this.fail("delete the credential", error);
  }
  async upsertOpportunities(opps: CanonicalOpportunity[]) {
    const fb = await this.ready();
    if (fb) return fb.upsertOpportunities(opps);
    for (let i = 0; i < opps.length; i += 200) {
      const rows = opps.slice(i, i + 200).map((o) => ({ id: o.id, data: o, employer: o.employer.name, title: o.title, posted_at: o.postedAt, last_observed_at: o.freshness.lastObservedAt }));
      const { error } = await this.sb().from("jobslake_opportunities").upsert(rows);
      if (error) this.fail("update the warm pool", error);
    }
  }
  async getOpportunity(id: string) {
    const fb = await this.ready();
    if (fb) return fb.getOpportunity(id);
    const { data, error } = await this.sb().from("jobslake_opportunities").select("data").eq("id", id).maybeSingle();
    if (error) this.fail("load the opportunity", error);
    if (data) return data.data as CanonicalOpportunity;
    // A legacy WonderJobs job id: look for the opportunity whose source records carry it.
    const { data: byLegacy, error: e2 } = await this.sb().from("jobslake_opportunities").select("data").contains("data", { sourceRecords: [{ legacyJobId: id }] }).limit(1);
    if (e2) this.fail("load the opportunity", e2);
    return (byLegacy?.[0]?.data as CanonicalOpportunity | undefined) ?? undefined;
  }
  async listOpportunities(opts: { limit?: number; sinceIso?: string } = {}) {
    const fb = await this.ready();
    if (fb) return fb.listOpportunities(opts);
    let q = this.sb().from("jobslake_opportunities").select("data").order("last_observed_at", { ascending: false }).limit(opts.limit ?? 500);
    if (opts.sinceIso) q = q.gte("last_observed_at", opts.sinceIso);
    const { data, error } = await q;
    if (error) this.fail("load the warm pool", error);
    return (data ?? []).map((r) => r.data as CanonicalOpportunity);
  }
}

const g = globalThis as unknown as { __jobsLakeStore?: JobsLakeStore };
/** One store per server process (survives dev HMR). */
export function jobsLakeStore(): JobsLakeStore {
  if (!g.__jobsLakeStore) g.__jobsLakeStore = getSupabaseAdmin() ? new SupabaseStore() : new MemoryStore();
  return g.__jobsLakeStore;
}

/** Tests only. */
export function __setJobsLakeStore(s: JobsLakeStore | undefined) {
  g.__jobsLakeStore = s;
}
export { MemoryStore as __MemoryStore };
