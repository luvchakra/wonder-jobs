import type { BillingProviderId, Subscription } from "@/domain/billing/types";
import { getSupabaseAdmin, touchTenant } from "../supabase";
import { GENESIS_HASH, ledgerHash, type LedgerEntry, type LedgerRow } from "./ledger";

/**
 * Subscriptions and the billing ledger. Supabase-backed when configured; in memory
 * otherwise (tests, local development). Every tenant-scoped read filters by
 * tenant explicitly — RLS has no policies and would not catch a missing filter.
 */
export interface BillingStore {
  subscriptionsForTenant(tenantId: string): Promise<Subscription[]>;
  subscription(provider: BillingProviderId, subscriptionId: string): Promise<Subscription | undefined>;
  saveSubscription(sub: Subscription): Promise<void>;
  /** Append to the ledger. A redelivered event (same provider + id) is reported as a duplicate, not written. */
  append(entry: LedgerEntry): Promise<{ seq: number; duplicate: boolean }>;
  ledgerForTenant(tenantId: string, limit?: number): Promise<LedgerRow[]>;
  /** The whole ledger in order, for chain verification by an auditor. */
  ledgerPage(afterSeq: number, limit: number): Promise<LedgerRow[]>;
  /** Subscriptions that may still take money, for the daily reconciliation. */
  openSubscriptions(limit: number): Promise<Subscription[]>;
}

/** Prefer the subscription that grants access, then the most recently changed one. */
export function currentSubscription(subs: Subscription[]): Subscription | undefined {
  const rank = (s: Subscription) => (s.status === "active" || s.status === "past_due" ? 2 : s.status === "incomplete" ? 1 : 0);
  return [...subs].sort((a, b) => rank(b) - rank(a) || (b.updatedAt > a.updatedAt ? 1 : b.updatedAt < a.updatedAt ? -1 : 0))[0];
}

export class MemoryBillingStore implements BillingStore {
  private subs = new Map<string, Subscription>();
  private ledger: LedgerRow[] = [];
  private key = (p: string, id: string) => `${p}:${id}`;
  async subscriptionsForTenant(tenantId: string) {
    return [...this.subs.values()].filter((s) => s.tenantId === tenantId);
  }
  async subscription(provider: BillingProviderId, id: string) {
    return this.subs.get(this.key(provider, id));
  }
  async saveSubscription(sub: Subscription) {
    this.subs.set(this.key(sub.provider, sub.subscriptionId), { ...sub });
  }
  async append(entry: LedgerEntry) {
    const existing = this.ledger.find((r) => r.provider === entry.provider && r.eventId === entry.eventId);
    if (existing) return { seq: existing.seq, duplicate: true };
    const prevHash = this.ledger.at(-1)?.hash ?? GENESIS_HASH;
    const row: LedgerRow = { ...entry, seq: this.ledger.length + 1, prevHash, hash: ledgerHash(prevHash, entry), recordedAt: new Date().toISOString() };
    this.ledger.push(row);
    return { seq: row.seq, duplicate: false };
  }
  async ledgerForTenant(tenantId: string, limit = 200) {
    return this.ledger.filter((r) => r.tenantId === tenantId).slice(-limit);
  }
  async ledgerPage(afterSeq: number, limit: number) {
    return this.ledger.filter((r) => r.seq > afterSeq).slice(0, limit);
  }
  async openSubscriptions(limit: number) {
    return [...this.subs.values()].filter((s) => s.status !== "canceled").slice(0, limit);
  }
  /** Test hook: simulate tampering by an attacker with raw table access. */
  _rows() {
    return this.ledger;
  }
  /** Erasure: subscriptions are account state and go with the account; the ledger stays. */
  async removeTenant(tenantId: string) {
    for (const [k, s] of this.subs) if (s.tenantId === tenantId) this.subs.delete(k);
  }
}

type SubRow = {
  provider: BillingProviderId;
  subscription_id: string;
  tenant_id: string;
  customer_id: string | null;
  plan_ref: string | null;
  status: Subscription["status"];
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  provider_updated_at: string;
  last_event_id: string | null;
};

const fromSubRow = (r: SubRow): Subscription => ({
  tenantId: r.tenant_id,
  provider: r.provider,
  subscriptionId: r.subscription_id,
  customerId: r.customer_id ?? undefined,
  planRef: r.plan_ref ?? undefined,
  status: r.status,
  currentPeriodEnd: r.current_period_end ? new Date(r.current_period_end).toISOString() : undefined,
  cancelAtPeriodEnd: r.cancel_at_period_end,
  updatedAt: r.provider_updated_at,
  lastEventId: r.last_event_id ?? undefined,
});

type LedgerDbRow = {
  seq: number;
  provider: BillingProviderId;
  event_id: string;
  provider_type: string;
  kind: LedgerRow["kind"];
  tenant_id: string | null;
  subscription_id: string | null;
  amount: number | null;
  currency: string | null;
  occurred_at: string;
  payload_sha256: string;
  outcome: string;
  prev_hash: string;
  hash: string;
  recorded_at: string;
};

const fromLedgerRow = (r: LedgerDbRow): LedgerRow => ({
  seq: Number(r.seq),
  provider: r.provider,
  eventId: r.event_id,
  providerType: r.provider_type,
  kind: r.kind,
  tenantId: r.tenant_id,
  subscriptionId: r.subscription_id,
  amount: r.amount == null ? null : Number(r.amount),
  currency: r.currency,
  occurredAt: r.occurred_at,
  payloadSha256: r.payload_sha256,
  outcome: r.outcome,
  prevHash: r.prev_hash,
  hash: r.hash,
  recordedAt: r.recorded_at,
});

const SUB_COLS = "provider, subscription_id, tenant_id, customer_id, plan_ref, status, current_period_end, cancel_at_period_end, provider_updated_at, last_event_id";
const LEDGER_COLS = "seq, provider, event_id, provider_type, kind, tenant_id, subscription_id, amount, currency, occurred_at, payload_sha256, outcome, prev_hash, hash, recorded_at";

class SupabaseBillingStore implements BillingStore {
  private db() {
    const sb = getSupabaseAdmin();
    if (!sb) throw new Error("Supabase is not configured");
    return sb;
  }
  async subscriptionsForTenant(tenantId: string) {
    const { data, error } = await this.db().from("billing_subscriptions").select(SUB_COLS).eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return (data as SubRow[]).map(fromSubRow);
  }
  async subscription(provider: BillingProviderId, id: string) {
    const { data, error } = await this.db().from("billing_subscriptions").select(SUB_COLS).eq("provider", provider).eq("subscription_id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? fromSubRow(data as SubRow) : undefined;
  }
  async saveSubscription(s: Subscription) {
    await touchTenant(s.tenantId);
    const { error } = await this.db()
      .from("billing_subscriptions")
      .upsert(
        {
          provider: s.provider,
          subscription_id: s.subscriptionId,
          tenant_id: s.tenantId,
          customer_id: s.customerId ?? null,
          plan_ref: s.planRef ?? null,
          status: s.status,
          current_period_end: s.currentPeriodEnd ?? null,
          cancel_at_period_end: s.cancelAtPeriodEnd,
          provider_updated_at: s.updatedAt,
          last_event_id: s.lastEventId ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider,subscription_id" },
      );
    if (error) throw new Error(error.message);
  }
  async append(e: LedgerEntry) {
    const { data, error } = await this.db().rpc("append_billing_event", {
      p_provider: e.provider,
      p_event_id: e.eventId,
      p_provider_type: e.providerType,
      p_kind: e.kind,
      p_tenant_id: e.tenantId ?? null,
      p_subscription_id: e.subscriptionId ?? null,
      p_amount: e.amount ?? null,
      p_currency: e.currency ?? null,
      p_occurred_at: e.occurredAt,
      p_payload_sha256: e.payloadSha256,
      p_outcome: e.outcome,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as { out_seq: number; out_duplicate: boolean };
    return { seq: Number(row.out_seq), duplicate: !!row.out_duplicate };
  }
  async ledgerForTenant(tenantId: string, limit = 200) {
    const { data, error } = await this.db().from("billing_ledger").select(LEDGER_COLS).eq("tenant_id", tenantId).order("seq", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data as LedgerDbRow[]).map(fromLedgerRow).reverse();
  }
  async ledgerPage(afterSeq: number, limit: number) {
    const { data, error } = await this.db().from("billing_ledger").select(LEDGER_COLS).gt("seq", afterSeq).order("seq", { ascending: true }).limit(limit);
    if (error) throw new Error(error.message);
    return (data as LedgerDbRow[]).map(fromLedgerRow);
  }
  async openSubscriptions(limit: number) {
    const { data, error } = await this.db().from("billing_subscriptions").select(SUB_COLS).neq("status", "canceled").order("updated_at", { ascending: true }).limit(limit);
    if (error) throw new Error(error.message);
    return (data as SubRow[]).map(fromSubRow);
  }
}

const g = globalThis as { __wjBillingStore?: BillingStore };
export function billingStore(): BillingStore {
  if (getSupabaseAdmin()) return new SupabaseBillingStore();
  return (g.__wjBillingStore ??= new MemoryBillingStore());
}
/** Tests swap in a fresh in-memory store. */
export function setBillingStoreForTests(store: BillingStore | undefined) {
  g.__wjBillingStore = store;
}
