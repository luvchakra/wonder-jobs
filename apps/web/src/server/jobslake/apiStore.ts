/**
 * Persistence for the JobsLake developer API (migration 0015): API keys (hashes only), per-day usage
 * and pay-as-you-go billing state. Supabase when configured, memory otherwise (local / tests).
 *
 * Tenant isolation: every read and write takes the owner (the session's tenant id) and filters by it
 * explicitly — RLS has no policies and would not catch a missing filter. Two lookups are deliberately
 * not owner-scoped: `findKeyByHash` (authentication itself — it is how the owner is learned, from a
 * hash of a 256-bit secret) and `listSubscribedBilling` (the daily usage report across accounts, server-only).
 *
 * Unlike the rest of JobsLake this store does NOT degrade to memory when its tables are missing: keys
 * and usage that vanish on restart would be wrong in a way nobody could see. Errors surface instead.
 */
import { getSupabaseAdmin, touchTenant } from "@/server/supabase";
import { monthStart } from "@/domain/jobslake/apiPlan";

export interface ApiKeyRecord {
  id: string;
  ownerId: string;
  name: string;
  /** The first characters of the key, shown so the owner can tell keys apart. */
  prefix: string;
  keyHash: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface ApiUsageRow {
  day: string;
  units: number;
  reportedUnits: number;
}

export interface ApiBillingRecord {
  ownerId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  status: "active" | "inactive";
  enabledAt?: string;
  updatedAt: string;
}

export interface ApiStore {
  createKey(k: ApiKeyRecord): Promise<void>;
  listKeys(ownerId: string): Promise<ApiKeyRecord[]>;
  /** Revokes the owner's own key; false when the owner has no such active key. */
  revokeKey(ownerId: string, id: string, at: string): Promise<boolean>;
  /** Authentication: the key with this hash, whoever owns it. */
  findKeyByHash(hash: string): Promise<ApiKeyRecord | undefined>;
  touchKey(ownerId: string, id: string, at: string): Promise<void>;
  /** Adds `n` units (negative to refund) to the owner's day; returns the month-to-date total. */
  meter(ownerId: string, day: string, n: number): Promise<number>;
  /** The owner's usage rows from `fromDay` on. */
  usage(ownerId: string, fromDay: string): Promise<ApiUsageRow[]>;
  markReported(ownerId: string, day: string, units: number): Promise<void>;
  getBilling(ownerId: string): Promise<ApiBillingRecord | undefined>;
  putBilling(rec: ApiBillingRecord): Promise<void>;
  /** Every account that confirmed a pay-as-you-go subscription, active or not (the daily report re-reads each from Stripe). */
  listSubscribedBilling(): Promise<ApiBillingRecord[]>;
}

export class MemoryApiStore implements ApiStore {
  keys = new Map<string, ApiKeyRecord>();
  usageRows = new Map<string, ApiUsageRow & { ownerId: string }>();
  billing = new Map<string, ApiBillingRecord>();
  async createKey(k: ApiKeyRecord) {
    this.keys.set(k.id, { ...k });
  }
  async listKeys(ownerId: string) {
    return [...this.keys.values()].filter((k) => k.ownerId === ownerId).map((k) => ({ ...k }));
  }
  async revokeKey(ownerId: string, id: string, at: string) {
    const k = this.keys.get(id);
    if (!k || k.ownerId !== ownerId || k.revokedAt) return false;
    k.revokedAt = at;
    return true;
  }
  async findKeyByHash(hash: string) {
    const k = [...this.keys.values()].find((x) => x.keyHash === hash);
    return k ? { ...k } : undefined;
  }
  async touchKey(ownerId: string, id: string, at: string) {
    const k = this.keys.get(id);
    if (k && k.ownerId === ownerId) k.lastUsedAt = at;
  }
  async meter(ownerId: string, day: string, n: number) {
    const key = `${ownerId}|${day}`;
    const row = this.usageRows.get(key) ?? { ownerId, day, units: 0, reportedUnits: 0 };
    row.units = Math.max(0, row.units + n);
    this.usageRows.set(key, row);
    const from = monthStart(day);
    return [...this.usageRows.values()].filter((r) => r.ownerId === ownerId && r.day >= from && r.day <= day).reduce((s, r) => s + r.units, 0);
  }
  async usage(ownerId: string, fromDay: string) {
    return [...this.usageRows.values()]
      .filter((r) => r.ownerId === ownerId && r.day >= fromDay)
      .sort((a, b) => a.day.localeCompare(b.day))
      .map(({ day, units, reportedUnits }) => ({ day, units, reportedUnits }));
  }
  async markReported(ownerId: string, day: string, units: number) {
    const row = this.usageRows.get(`${ownerId}|${day}`);
    if (row) row.reportedUnits = units;
  }
  async getBilling(ownerId: string) {
    const b = this.billing.get(ownerId);
    return b ? { ...b } : undefined;
  }
  async putBilling(rec: ApiBillingRecord) {
    this.billing.set(rec.ownerId, { ...rec });
  }
  async listSubscribedBilling() {
    return [...this.billing.values()].filter((b) => !!b.stripeSubscriptionId).map((b) => ({ ...b }));
  }
}

type KeyRow = { id: string; owner_id: string; name: string; prefix: string; key_hash: string; created_at: string; last_used_at: string | null; revoked_at: string | null };
const iso = (v: string | null | undefined) => (v ? new Date(v).toISOString() : undefined);
const fromKeyRow = (r: KeyRow): ApiKeyRecord => ({ id: r.id, ownerId: r.owner_id, name: r.name, prefix: r.prefix, keyHash: r.key_hash, createdAt: iso(r.created_at)!, lastUsedAt: iso(r.last_used_at), revokedAt: iso(r.revoked_at) });
type BillingRow = { owner_id: string; stripe_customer_id: string | null; stripe_subscription_id: string | null; status: "active" | "inactive"; enabled_at: string | null; updated_at: string };
const fromBillingRow = (r: BillingRow): ApiBillingRecord => ({ ownerId: r.owner_id, stripeCustomerId: r.stripe_customer_id ?? undefined, stripeSubscriptionId: r.stripe_subscription_id ?? undefined, status: r.status, enabledAt: iso(r.enabled_at), updatedAt: iso(r.updated_at)! });

class SupabaseApiStore implements ApiStore {
  private sb() {
    const sb = getSupabaseAdmin();
    if (!sb) throw new Error("Supabase is not configured");
    return sb.schema("wonderjobs");
  }
  private fail(what: string, error: { message: string }): never {
    throw new Error(`JobsLake API could not ${what}: ${error.message}`);
  }
  async createKey(k: ApiKeyRecord) {
    await touchTenant(k.ownerId);
    const { error } = await this.sb().from("jobslake_api_keys").insert({ id: k.id, owner_id: k.ownerId, name: k.name, prefix: k.prefix, key_hash: k.keyHash, created_at: k.createdAt });
    if (error) this.fail("save the key", error);
  }
  async listKeys(ownerId: string) {
    const { data, error } = await this.sb().from("jobslake_api_keys").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(100);
    if (error) this.fail("list keys", error);
    return ((data ?? []) as KeyRow[]).map(fromKeyRow);
  }
  async revokeKey(ownerId: string, id: string, at: string) {
    const { data, error } = await this.sb().from("jobslake_api_keys").update({ revoked_at: at }).eq("owner_id", ownerId).eq("id", id).is("revoked_at", null).select("id");
    if (error) this.fail("revoke the key", error);
    return (data ?? []).length > 0;
  }
  async findKeyByHash(hash: string) {
    const { data, error } = await this.sb().from("jobslake_api_keys").select("*").eq("key_hash", hash).maybeSingle();
    if (error) this.fail("check the key", error);
    return data ? fromKeyRow(data as KeyRow) : undefined;
  }
  async touchKey(ownerId: string, id: string, at: string) {
    const { error } = await this.sb().from("jobslake_api_keys").update({ last_used_at: at }).eq("owner_id", ownerId).eq("id", id);
    if (error) this.fail("record key use", error);
  }
  async meter(ownerId: string, day: string, n: number) {
    const { data, error } = await this.sb().rpc("jobslake_api_meter", { owner: ownerId, d: day, n });
    if (error) this.fail("meter usage", error);
    const total = Number(data);
    if (!Number.isFinite(total)) throw new Error("JobsLake API could not meter usage: no total returned");
    return total;
  }
  async usage(ownerId: string, fromDay: string) {
    const { data, error } = await this.sb().from("jobslake_api_usage").select("day, units, reported_units").eq("owner_id", ownerId).gte("day", fromDay).order("day", { ascending: true }).limit(400);
    if (error) this.fail("read usage", error);
    return ((data ?? []) as { day: string; units: number; reported_units: number }[]).map((r) => ({ day: String(r.day).slice(0, 10), units: r.units, reportedUnits: r.reported_units }));
  }
  async markReported(ownerId: string, day: string, units: number) {
    const { error } = await this.sb().from("jobslake_api_usage").update({ reported_units: units }).eq("owner_id", ownerId).eq("day", day);
    if (error) this.fail("mark usage reported", error);
  }
  async getBilling(ownerId: string) {
    const { data, error } = await this.sb().from("jobslake_api_billing").select("*").eq("owner_id", ownerId).maybeSingle();
    if (error) this.fail("read billing", error);
    return data ? fromBillingRow(data as BillingRow) : undefined;
  }
  async putBilling(rec: ApiBillingRecord) {
    await touchTenant(rec.ownerId);
    const { error } = await this.sb()
      .from("jobslake_api_billing")
      .upsert({ owner_id: rec.ownerId, stripe_customer_id: rec.stripeCustomerId ?? null, stripe_subscription_id: rec.stripeSubscriptionId ?? null, status: rec.status, enabled_at: rec.enabledAt ?? null, updated_at: rec.updatedAt }, { onConflict: "owner_id" });
    if (error) this.fail("save billing", error);
  }
  async listSubscribedBilling() {
    const { data, error } = await this.sb().from("jobslake_api_billing").select("*").not("stripe_subscription_id", "is", null).limit(5000);
    if (error) this.fail("list billing", error);
    return ((data ?? []) as BillingRow[]).map(fromBillingRow);
  }
}

const g = globalThis as unknown as { __jobsLakeApiStore?: ApiStore };
export function apiStore(): ApiStore {
  if (!g.__jobsLakeApiStore) g.__jobsLakeApiStore = getSupabaseAdmin() ? new SupabaseApiStore() : new MemoryApiStore();
  return g.__jobsLakeApiStore;
}

/** Tests only. */
export function __setApiStore(s: ApiStore | undefined) {
  g.__jobsLakeApiStore = s;
}
