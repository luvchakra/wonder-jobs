import { isBillable } from "@/domain/billing/subscription";
import { PRIVACY_NOTICE_VERSION, RETENTION } from "@/content/privacy";
import { authConfigured } from "@/lib/auth/config";
import { STATE_STORES, SERVER_STORES, stateStore } from "../state";
import { secretStore } from "../secrets";
import { getSupabaseAdmin } from "../supabase";
import { listSubscriptions } from "../push/subscriptions";
import { billingStore, MemoryBillingStore } from "../billing/store";
import { MemoryResumeFileStore, resumeFileStore } from "../resume/files";
import { cancelUnpaidSubscriptions } from "../billing/service";
import { consentHistory, forgetConsentsInMemory, privacyRequests, recordPrivacyRequest } from "./records";
import type { Session } from "../auth";

/**
 * Data-subject rights: access / portability (GDPR Art. 15, 20; DPDP s.11) and erasure
 * (GDPR Art. 17; DPDP s.12). Everything is scoped to the session's tenant explicitly.
 */

/** Everything WonderJobs holds about this account, as one machine-readable document. */
export async function buildExport(session: Session) {
  const { tenantId } = session;
  const sb = getSupabaseAdmin();
  const [state, serverDocs, secrets, push, billingSubs, ledger, consents, requests, resumeFiles] = await Promise.all([
    stateStore.getAll(tenantId),
    Promise.all(SERVER_STORES.map(async (s) => [s, await stateStore.get(tenantId, s)] as const)),
    secretStore.list(tenantId),
    sb ? listSubscriptions(tenantId).catch(() => []) : Promise.resolve([]),
    billingStore().subscriptionsForTenant(tenantId),
    billingStore().ledgerForTenant(tenantId, 10_000),
    consentHistory(tenantId),
    privacyRequests(tenantId),
    resumeFileStore().list(tenantId),
  ]);
  let actionAudit: unknown[] = [];
  let contactMessages: unknown[] = [];
  let account: unknown = { id: tenantId, email: session.email ?? null, name: session.name ?? null };
  if (sb) {
    const [audit, contact, tenant] = await Promise.all([
      sb.from("action_audit").select("action_id, action_type, event, detail, at").eq("tenant_id", tenantId).order("at", { ascending: true }).limit(10_000),
      sb.from("contact_messages").select("created_at, name, email, topic, message, page").eq("tenant_id", tenantId).order("created_at", { ascending: true }).limit(1000),
      sb.from("tenants").select("created_at, last_seen_at").eq("id", tenantId).maybeSingle(),
    ]);
    actionAudit = audit.data ?? [];
    contactMessages = contact.data ?? [];
    account = { ...(account as object), ...(tenant.data ?? {}) };
  }
  return {
    format: "wonderjobs-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    noticeVersion: PRIVACY_NOTICE_VERSION,
    account,
    appData: Object.fromEntries(STATE_STORES.map((s) => [s, state[s]?.state ?? null])),
    serverData: Object.fromEntries(serverDocs.map(([s, d]) => [s, d?.state ?? null])),
    // Keys themselves are never exported (they're yours already); only what we store about them.
    aiProviderKeys: secrets.map((s) => ({ provider: s.provider, masked: s.masked, model: s.model ?? null, connectedAt: s.connectedAt, lastVerifiedAt: s.lastVerifiedAt ?? null })),
    notificationDevices: push.map((p) => ({ service: safeHost(p.endpoint), createdAt: (p as { createdAt?: string }).createdAt ?? null })),
    actionAudit,
    contactMessages,
    billing: { subscriptions: billingSubs, ledger: ledger.map((r) => ({ at: r.occurredAt, provider: r.provider, providerType: r.providerType, kind: r.kind, subscriptionId: r.subscriptionId, amount: r.amount, currency: r.currency })) },
    consents,
    privacyRequests: requests,
    // The files themselves are too large for one JSON response; each downloads from My resumes.
    resumeFiles: resumeFiles.map((f) => ({ ...f, download: `/api/resume-files/${f.id}` })),
    retention: RETENTION,
  };
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

export type EraseResult = { ok: true } | { ok: false; status: 409 | 500; error: string };

/**
 * Erase the account and everything attached to it. Order matters:
 * 1. refuse while a subscription would keep charging (the candidate cancels first, so no
 *    orphaned mandate keeps taking money from someone who no longer has an account);
 * 2. record the request (hashed subject) so the erasure itself is provable;
 * 3. delete — the tenant row cascades to every table keyed by it; contact messages are
 *    deleted by tenant id; the sign-in identity is deleted from Supabase Auth;
 * 4. keep only the billing ledger (statutory financial record, no profile data) and the hashed request record.
 */
export async function eraseAccount(session: Session): Promise<EraseResult> {
  const { tenantId } = session;
  const store = billingStore();
  const subs = await store.subscriptionsForTenant(tenantId);
  if (subs.some(isBillable)) {
    await recordPrivacyRequest(tenantId, "erasure", "refused", "active subscription");
    return { ok: false, status: 409, error: "Cancel your subscription first (Plan & billing), then delete your account. You keep Pro until the end of the period you've paid for." };
  }
  // The action audit is erased with the account, so the durable proof is this hashed request record.
  await recordPrivacyRequest(tenantId, "erasure", "requested");
  await cancelUnpaidSubscriptions(tenantId);

  const sb = getSupabaseAdmin();
  try {
    if (sb) {
      const contact = await sb.from("contact_messages").delete().eq("tenant_id", tenantId);
      if (contact.error) throw new Error(contact.error.message);
      const tenant = await sb.from("tenants").delete().eq("id", tenantId);
      if (tenant.error) throw new Error(tenant.error.message);
      if (authConfigured()) {
        const user = await sb.auth.admin.deleteUser(session.userId);
        // Already gone is fine (a retried erasure); anything else must surface.
        if (user.error && !/not found/i.test(user.error.message)) throw new Error(user.error.message);
      }
    } else {
      for (const s of [...STATE_STORES, ...SERVER_STORES]) await stateStore.remove(tenantId, s);
      for (const k of await secretStore.list(tenantId)) await secretStore.remove(tenantId, k.provider);
      if (store instanceof MemoryBillingStore) await store.removeTenant(tenantId);
      const files = resumeFileStore();
      if (files instanceof MemoryResumeFileStore) files.removeTenant(tenantId);
      forgetConsentsInMemory(tenantId);
    }
  } catch (e) {
    console.error("[privacy] erasure failed:", e instanceof Error ? e.message : "unknown");
    return { ok: false, status: 500, error: "Your account couldn't be fully deleted just now. Try again in a minute; if it keeps failing, contact us with the topic “Privacy request” and we'll finish it." };
  }
  await recordPrivacyRequest(tenantId, "erasure", "completed");
  return { ok: true };
}
