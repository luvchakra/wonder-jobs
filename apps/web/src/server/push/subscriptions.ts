/**
 * Who has asked for push notifications, and delivering to them.
 *
 * A subscription belongs to a browser, not a person, so a candidate who turned notifications on at work
 * and at home has two rows and gets both. When a push service says a subscription is gone — the app was
 * uninstalled, permission revoked, the profile cleared — the row is deleted rather than retried: the
 * browser has already decided, and re-asking it forever is how a sender ends up rate-limited.
 */
import { getSupabaseAdmin, touchTenant } from "@/server/supabase";
import { generateVapidKeys, sendPush, type PushSubscription, type VapidKeys } from "./webPush";

export interface StoredSubscription extends PushSubscription {
  tenantId: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface DeliveryReport {
  sent: number;
  removed: number;
  failed: number;
  /** False when this deployment has no VAPID keys — the honest "nothing was sent" answer. */
  configured: boolean;
}

/** Where the operator's keys come from. Generate a pair with `npm run push:keys`. */
export function vapidConfig(): (VapidKeys & { subject: string }) | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  // RFC 8292 wants a contact the push service can reach if this sender misbehaves.
  const subject = process.env.VAPID_SUBJECT || "mailto:support@wonderjobs.app";
  return { publicKey, privateKey, subject };
}

export function pushPublicKey(): string | null {
  return vapidConfig()?.publicKey ?? null;
}

/** Test/setup helper so the keygen script and the tests share one implementation. */
export { generateVapidKeys };

function db() {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error("Supabase is not configured");
  return sb;
}

export async function saveSubscription(tenantId: string, sub: PushSubscription, userAgent?: string | null): Promise<void> {
  await touchTenant(tenantId);
  const { error } = await db()
    .from("push_subscriptions")
    .upsert({ endpoint: sub.endpoint, tenant_id: tenantId, p256dh: sub.p256dh, auth: sub.auth, user_agent: userAgent?.slice(0, 300) ?? null, last_error: null }, { onConflict: "endpoint" });
  if (error) throw new Error(`Could not save the subscription: ${error.message}`);
}

export async function removeSubscription(endpoint: string, tenantId?: string): Promise<void> {
  let q = db().from("push_subscriptions").delete().eq("endpoint", endpoint);
  // Scoped to the tenant when a session is doing it, so one account can't unsubscribe another's browser.
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { error } = await q;
  if (error) throw new Error(`Could not remove the subscription: ${error.message}`);
}

export async function listSubscriptions(tenantId: string): Promise<StoredSubscription[]> {
  const { data, error } = await db().from("push_subscriptions").select("endpoint, p256dh, auth, tenant_id").eq("tenant_id", tenantId);
  if (error) throw new Error(`Could not read subscriptions: ${error.message}`);
  return (data ?? []).map((r) => {
    const row = r as { endpoint: string; p256dh: string; auth: string; tenant_id: string };
    return { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth, tenantId: row.tenant_id };
  });
}

export async function countSubscriptions(tenantId: string): Promise<number> {
  const { count, error } = await db().from("push_subscriptions").select("endpoint", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (error) throw new Error(`Could not count subscriptions: ${error.message}`);
  return count ?? 0;
}

/**
 * Delivers one notification to every browser this candidate has turned them on in.
 *
 * Never throws: a scheduled run that found real matches must not fail because a push service was having
 * a bad minute. The notification is already in the app's own list either way — push is the nudge, not
 * the record.
 */
export async function notifyTenant(tenantId: string, payload: PushPayload): Promise<DeliveryReport> {
  const vapid = vapidConfig();
  if (!vapid || !getSupabaseAdmin()) return { sent: 0, removed: 0, failed: 0, configured: false };
  const report: DeliveryReport = { sent: 0, removed: 0, failed: 0, configured: true };
  let subscriptions: StoredSubscription[];
  try {
    subscriptions = await listSubscriptions(tenantId);
  } catch (e) {
    console.error("[push] could not read subscriptions", e instanceof Error ? e.message : e);
    return report;
  }
  const body = JSON.stringify(payload);
  await Promise.all(
    subscriptions.map(async (sub) => {
      const result = await sendPush(sub, body, vapid);
      if (result.ok) {
        report.sent++;
        await db().from("push_subscriptions").update({ last_sent_at: new Date().toISOString(), last_error: null }).eq("endpoint", sub.endpoint);
        return;
      }
      if (result.gone) {
        report.removed++;
        await removeSubscription(sub.endpoint).catch(() => {});
        return;
      }
      report.failed++;
      console.warn("[push] delivery failed", result.status, result.error);
      await db().from("push_subscriptions").update({ last_error: `${result.status}: ${result.error}`.slice(0, 300) }).eq("endpoint", sub.endpoint).then(() => {}, () => {});
    }),
  );
  return report;
}
