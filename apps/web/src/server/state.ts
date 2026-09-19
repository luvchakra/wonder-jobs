/**
 * Per-tenant state documents (one JSON document per client store).
 * Supabase-backed when configured; in-memory otherwise so local development
 * and previews keep working (the browser also keeps a localStorage copy).
 *
 * Reads and writes are batched: the client loads every store in one request
 * and saves all dirty stores in one request, and the Supabase path does each
 * of those in a single database round trip.
 */
import { getSupabaseAdmin, touchTenant } from "./supabase";

export const STATE_STORES = ["wj.career", "wj.jobs", "wj.applications", "wj.automation", "wj.ai", "wj.workflow", "wj.actions", "wj.ui"] as const;
export type StateStoreName = (typeof STATE_STORES)[number];
export const MAX_STATE_BYTES = 2_000_000;
/** A batched save may carry every store at once. */
export const MAX_BATCH_BYTES = 6_000_000;

export interface StateDoc {
  state: unknown;
  version: number;
  updatedAt: string;
}

export type StateDocs = Partial<Record<StateStoreName, StateDoc>>;
export type SaveResult = Partial<Record<StateStoreName, { version: number; updatedAt: string }>>;

export interface StateStore {
  get(tenantId: string, store: StateStoreName): Promise<StateDoc | undefined>;
  getAll(tenantId: string): Promise<StateDocs>;
  put(tenantId: string, store: StateStoreName, state: unknown): Promise<StateDoc>;
  /** Tenants that have a document for this store. Used by the scheduled-run cron to find work. */
  listTenants(store: StateStoreName, limit?: number): Promise<string[]>;
  putMany(tenantId: string, docs: Partial<Record<StateStoreName, unknown>>): Promise<SaveResult>;
  remove(tenantId: string, store: StateStoreName): Promise<void>;
}

class MemoryStateStore implements StateStore {
  private data = new Map<string, StateDoc>();
  private key(t: string, s: string) {
    return `${t}::${s}`;
  }
  async get(t: string, s: StateStoreName) {
    return this.data.get(this.key(t, s));
  }
  async getAll(t: string) {
    const out: StateDocs = {};
    for (const s of STATE_STORES) {
      const doc = this.data.get(this.key(t, s));
      if (doc) out[s] = doc;
    }
    return out;
  }
  async put(t: string, s: StateStoreName, state: unknown) {
    const prev = this.data.get(this.key(t, s));
    const doc = { state, version: (prev?.version ?? 0) + 1, updatedAt: new Date().toISOString() };
    this.data.set(this.key(t, s), doc);
    return doc;
  }
  async listTenants(store: StateStoreName, limit = 200) {
    const out: string[] = [];
    for (const key of this.data.keys()) {
      const [tenant, s] = key.split("::");
      if (s === store && !out.includes(tenant)) out.push(tenant);
      if (out.length >= limit) break;
    }
    return out;
  }
  async putMany(t: string, docs: Partial<Record<StateStoreName, unknown>>) {
    const out: SaveResult = {};
    for (const [s, state] of Object.entries(docs) as [StateStoreName, unknown][]) {
      const doc = await this.put(t, s, state);
      out[s] = { version: doc.version, updatedAt: doc.updatedAt };
    }
    return out;
  }
  async remove(t: string, s: StateStoreName) {
    this.data.delete(this.key(t, s));
  }
}

class SupabaseStateStore implements StateStore {
  /** False once the batched function is known to be missing (migration 0002 not applied yet). */
  private rpcAvailable = true;

  private sb() {
    const sb = getSupabaseAdmin();
    if (!sb) throw new Error("Supabase is not configured");
    return sb;
  }
  async get(t: string, s: StateStoreName) {
    const { data, error } = await this.sb().from("app_state").select("state, version, updated_at").eq("tenant_id", t).eq("store", s).maybeSingle();
    if (error) throw new Error(`Could not load ${s}: ${error.message}`);
    return data ? { state: data.state, version: data.version as number, updatedAt: data.updated_at as string } : undefined;
  }
  async getAll(t: string) {
    const { data, error } = await this.sb().from("app_state").select("store, state, version, updated_at").eq("tenant_id", t);
    if (error) throw new Error(`Could not load state: ${error.message}`);
    const out: StateDocs = {};
    for (const row of (data ?? []) as { store: string; state: unknown; version: number; updated_at: string }[]) {
      if (isStateStoreName(row.store)) out[row.store] = { state: row.state, version: row.version, updatedAt: row.updated_at };
    }
    return out;
  }
  async listTenants(store: StateStoreName, limit = 200) {
    const { data, error } = await this.sb().from("app_state").select("tenant_id").eq("store", store).order("updated_at", { ascending: false }).limit(limit);
    if (error) throw new Error(`Could not list tenants: ${error.message}`);
    return [...new Set((data ?? []).map((r) => (r as { tenant_id: string }).tenant_id))];
  }
  async put(t: string, s: StateStoreName, state: unknown) {
    const res = await this.putMany(t, { [s]: state });
    const r = res[s];
    if (!r) throw new Error(`Could not save ${s}`);
    return { state, version: r.version, updatedAt: r.updatedAt };
  }
  async putMany(t: string, docs: Partial<Record<StateStoreName, unknown>>) {
    if (this.rpcAvailable) {
      const { data, error } = await this.sb().rpc("put_state", { p_tenant: t, p_docs: docs });
      if (!error) return (data ?? {}) as SaveResult;
      // PGRST202 = function not found in the schema cache: fall back until the migration lands.
      if (error.code !== "PGRST202" && !/put_state/.test(error.message)) throw new Error(`Could not save state: ${error.message}`);
      this.rpcAvailable = false;
    }
    await touchTenant(t);
    const out: SaveResult = {};
    for (const [s, state] of Object.entries(docs) as [StateStoreName, unknown][]) {
      const prev = await this.get(t, s);
      const doc = { version: (prev?.version ?? 0) + 1, updatedAt: new Date().toISOString() };
      const { error } = await this.sb().from("app_state").upsert({ tenant_id: t, store: s, state, version: doc.version, updated_at: doc.updatedAt }, { onConflict: "tenant_id,store" });
      if (error) throw new Error(`Could not save ${s}: ${error.message}`);
      out[s] = doc;
    }
    return out;
  }
  async remove(t: string, s: StateStoreName) {
    const { error } = await this.sb().from("app_state").delete().eq("tenant_id", t).eq("store", s);
    if (error) throw new Error(`Could not remove ${s}: ${error.message}`);
  }
}

const g = globalThis as unknown as { __wjStateStore?: StateStore };
export const stateStore: StateStore = getSupabaseAdmin() ? new SupabaseStateStore() : (g.__wjStateStore ?? (g.__wjStateStore = new MemoryStateStore()));

export function isStateStoreName(s: string): s is StateStoreName {
  return (STATE_STORES as readonly string[]).includes(s);
}
