import type { BillingEvent } from "@/domain/billing/types";
import { sha256Hex } from "../crypto";

/**
 * The billing ledger's hash chain, computed exactly as `wonderjobs.append_billing_event`
 * computes it in SQL (migration 0008), so anyone with read access can re-derive every
 * hash and detect an altered, removed or reordered row. The database also refuses
 * UPDATE / DELETE / TRUNCATE on the table, for the service role too.
 */
export const GENESIS_HASH = "0".repeat(64);

export interface LedgerRow {
  seq: number;
  provider: BillingEvent["provider"];
  eventId: string;
  providerType: string;
  kind: BillingEvent["kind"];
  tenantId?: string | null;
  subscriptionId?: string | null;
  amount?: number | null;
  currency?: string | null;
  occurredAt: string;
  payloadSha256: string;
  outcome: string;
  prevHash: string;
  hash: string;
  recordedAt?: string;
}

export type LedgerEntry = Omit<LedgerRow, "seq" | "prevHash" | "hash" | "recordedAt">;

export function ledgerHash(prevHash: string, r: LedgerEntry): string {
  return sha256Hex(
    [prevHash, r.provider, r.eventId, r.providerType, r.kind, r.tenantId ?? "", r.subscriptionId ?? "", r.amount == null ? "" : String(r.amount), r.currency ?? "", r.occurredAt, r.payloadSha256, r.outcome].join("|"),
  );
}

export function entryFor(e: BillingEvent, payloadSha256: string, outcome: string): LedgerEntry {
  return {
    provider: e.provider,
    eventId: e.eventId,
    providerType: e.providerType,
    kind: e.kind,
    tenantId: e.tenantId ?? null,
    subscriptionId: e.subscriptionId ?? null,
    amount: e.amount ?? null,
    currency: e.currency ?? null,
    occurredAt: e.occurredAt,
    payloadSha256,
    outcome,
  };
}

export type ChainVerification = { ok: true; rows: number; head: string } | { ok: false; rows: number; brokenAt: number; reason: string };

/** Walk the chain in `seq` order. Rows must be the full ledger (or a prefix of it starting at seq 1). */
export function verifyLedgerChain(rows: LedgerRow[]): ChainVerification {
  let prev = GENESIS_HASH;
  let lastSeq = 0;
  for (const r of rows) {
    if (r.seq <= lastSeq) return { ok: false, rows: rows.length, brokenAt: r.seq, reason: "Rows out of order or duplicated" };
    if (r.prevHash !== prev) return { ok: false, rows: rows.length, brokenAt: r.seq, reason: "prev_hash does not match the previous row (a row was removed or reordered)" };
    if (ledgerHash(prev, r) !== r.hash) return { ok: false, rows: rows.length, brokenAt: r.seq, reason: "hash does not match the row's contents (the row was altered)" };
    prev = r.hash;
    lastSeq = r.seq;
  }
  return { ok: true, rows: rows.length, head: prev };
}
