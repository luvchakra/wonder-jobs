/**
 * Per-tenant state documents (one JSON document per client store).
 * Supabase-backed when configured; in-memory otherwise so local development
 * and previews keep working (the browser also keeps a localStorage copy).
 */
import { getSupabaseAdmin, touchTenant } from "./supabase";

export const STATE_STORES = ["wj.career", "wj.jobs", "wj.applications", "wj.automation", "wj.ai", "wj.workflow", "wj.actions", "wj.ui"] as const;
export type StateStoreName = (typeof STATE_STORES)[number];
export const MAX_STATE_BYTES = 2_000_000;

export interface StateDoc {
  state: unknown;
  version: number;
  updatedAt: string;
}

export interface StateStore {
  get(tenantId: string, store: StateStoreName): Promise<StateDoc | undefined>;
  put(tenantId: string, store: StateStoreName, state: unknown): Promise<StateDoc>;
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
  async put(t: string, s: StateStoreName, state: unknown) {
    const prev = this.data.get(this.key(t, s));
    const doc = { state, version: (prev?.version ?? 0) + 1, updatedAt: new Date().toISOString() };
    this.data.set(this.key(t, s), doc);
    return doc;
  }
  async remove(t: string, s: StateStoreName) {
    this.data.delete(this.key(t, s));
  }
}

class SupabaseStateStore implements StateStore {
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
  async put(t: string, s: StateStoreName, state: unknown) {
    await touchTenant(t);
    const prev = await this.get(t, s);
    const doc = { state, version: (prev?.version ?? 0) + 1, updatedAt: new Date().toISOString() };
    const { error } = await this.sb().from("app_state").upsert({ tenant_id: t, store: s, state, version: doc.version, updated_at: doc.updatedAt }, { onConflict: "tenant_id,store" });
    if (error) throw new Error(`Could not save ${s}: ${error.message}`);
    return doc;
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
