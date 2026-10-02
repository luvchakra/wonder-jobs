import { getSupabaseAdmin, touchTenant } from "../supabase";
import { sha256Hex } from "../crypto";

/**
 * Consent / notice records and data-subject request records (migration 0008). Both append-only.
 * Supabase-backed when configured, in memory otherwise. Tenant filters are explicit on every query.
 */
export interface ConsentRecord {
  purpose: string;
  noticeVersion: string;
  granted: boolean;
  at: string;
}

export type PrivacyRequestKind = "export" | "erasure";
export type PrivacyRequestEvent = "requested" | "completed" | "refused";

/** The identifier kept for a data-subject request: a one-way hash, so it survives erasure without the id. */
export const subjectRef = (tenantId: string) => sha256Hex(`wonderjobs-subject:${tenantId}`);

const g = globalThis as { __wjConsents?: Map<string, ConsentRecord[]>; __wjPrivacyRequests?: { subjectRef: string; kind: string; event: string; detail?: string; at: string }[] };
const memConsents = () => (g.__wjConsents ??= new Map());
const memRequests = () => (g.__wjPrivacyRequests ??= []);

export async function recordConsent(tenantId: string, rec: Omit<ConsentRecord, "at">): Promise<ConsentRecord> {
  const at = new Date().toISOString();
  const sb = getSupabaseAdmin();
  if (!sb) {
    const list = memConsents().get(tenantId) ?? [];
    list.push({ ...rec, at });
    memConsents().set(tenantId, list);
    return { ...rec, at };
  }
  await touchTenant(tenantId);
  const { error } = await sb.from("consent_records").insert({ tenant_id: tenantId, purpose: rec.purpose, notice_version: rec.noticeVersion, granted: rec.granted });
  if (error) throw new Error(error.message);
  return { ...rec, at };
}

export async function consentHistory(tenantId: string): Promise<ConsentRecord[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [...(memConsents().get(tenantId) ?? [])].reverse();
  const { data, error } = await sb.from("consent_records").select("purpose, notice_version, granted, at").eq("tenant_id", tenantId).order("at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data as { purpose: string; notice_version: string; granted: boolean; at: string }[]).map((r) => ({ purpose: r.purpose, noticeVersion: r.notice_version, granted: r.granted, at: r.at }));
}

/** The latest decision for a purpose, or undefined. */
export async function latestConsent(tenantId: string, purpose: string): Promise<ConsentRecord | undefined> {
  return (await consentHistory(tenantId)).find((c) => c.purpose === purpose);
}

export async function recordPrivacyRequest(tenantId: string, kind: PrivacyRequestKind, event: PrivacyRequestEvent, detail?: string): Promise<void> {
  const ref = subjectRef(tenantId);
  const sb = getSupabaseAdmin();
  if (!sb) {
    memRequests().push({ subjectRef: ref, kind, event, detail, at: new Date().toISOString() });
    return;
  }
  const { error } = await sb.from("privacy_requests").insert({ subject_ref: ref, kind, event, detail: detail ?? null });
  if (error) throw new Error(error.message);
}

export async function privacyRequests(tenantId: string): Promise<{ kind: string; event: string; detail?: string | null; at: string }[]> {
  const ref = subjectRef(tenantId);
  const sb = getSupabaseAdmin();
  if (!sb) return memRequests().filter((r) => r.subjectRef === ref);
  const { data, error } = await sb.from("privacy_requests").select("kind, event, detail, at").eq("subject_ref", ref).order("at", { ascending: true }).limit(500);
  if (error) throw new Error(error.message);
  return data as { kind: string; event: string; detail: string | null; at: string }[];
}

/** Memory mode only: erasure removes consent rows (Supabase does it by cascade). */
export function forgetConsentsInMemory(tenantId: string) {
  memConsents().delete(tenantId);
}

/** Tests. */
export function resetPrivacyMemory() {
  g.__wjConsents = new Map();
  g.__wjPrivacyRequests = [];
}
