/**
 * How the server tells a person something (owner, 2026-10-22): the bell first — it's the record — then a push
 * to every browser they turned notifications on in, and an email when no push reached them — each only as far
 * as their choices (domain/notifications/prefs.ts) and the platform's settings (admin.ts) allow. Email is held to
 * one per key per `emailEveryMs` (a conversation's messages, say), so a busy thread doesn't fill an inbox.
 * Nothing here throws: a message or a reminder is never lost because a channel had a bad minute.
 */
import { addNotification, NOTIFICATION_CAP } from "@/domain/career/notifications";
import type { Notification } from "@/domain/career/types";
import { accountEmail } from "@/server/accountEmail";
import { EMAIL_COLORS, escapeHtml, renderEmailLayout } from "@/server/email/layout";
import { sendMail } from "@/server/notify";
import { notifyTenant, type PushPayload } from "@/server/push/subscriptions";
import { stateStore } from "@/server/state";
import { readClientStateVersioned, writeClientState } from "@/server/clientState";
import { newId } from "@/lib/ids";
import { topicOf } from "@/domain/notifications/prefs";
import { bellFilter, loadNotifyContext } from "./prefs";
import { siteUrl } from "@/lib/siteUrl";

const MAILED = "wj.mailed" as const;
const MAILED_CAP = 300;

export type Notice = Omit<Notification, "id" | "at" | "read">;

export interface NudgeOptions {
  /** Email when no push reached them: one per key per `everyMs` (default: only ever once). */
  email?: { key: string; everyMs?: number };
}

export interface DeliveryOutcome {
  pushed: number;
  emailed: boolean;
}

/** Adds a notification to the person's bell (their career document), keeping everything else in it — unless they keep that kind out of it. */
export async function addToBell(tenantId: string, notice: Notice, now = new Date()): Promise<void> {
  if (!(await bellFilter(tenantId))(notice.category)) return;
  const doc = await readClientStateVersioned<{ notifications?: Notification[] }>(tenantId, "wj.career");
  // No career document yet (an account that never opened the app): nothing to add to; push and email still go.
  if (!doc) return;
  await writeClientState(tenantId, "wj.career", doc.version, { notifications: addNotification(doc.state.notifications ?? [], notice, newId("ntf"), now.toISOString(), NOTIFICATION_CAP) }, { merge: true });
}

/** The nudge for something already in the bell: push, then email if no push reached anyone. */
export async function nudge(tenantId: string, notice: Notice, opts: NudgeOptions = {}, now = new Date()): Promise<DeliveryOutcome> {
  // Their choices for this kind of notification, inside the platform's settings (Admin → Settings → Notifications).
  const topic = topicOf(notice.category);
  const ctx = await loadNotifyContext(tenantId);
  const want = ctx.effective[topic];
  const push: PushPayload = { title: notice.title, body: notice.body.slice(0, 140), url: notice.href, tag: opts.email?.key };
  const report = want.push ? await notifyTenant(tenantId, push).catch(() => ({ sent: 0 })) : { sent: 0 };
  if (report.sent > 0 || !opts.email || !want.email) return { pushed: report.sent, emailed: false };
  // A conversation's emails are spaced as the platform sets.
  const everyMs = topic === "messages" ? ctx.admin.messageEmailEveryMin * 60_000 : opts.email.everyMs;
  return { pushed: 0, emailed: await emailOnce(tenantId, notice, opts.email.key, everyMs, now) };
}

/** Bell, then push, then email. */
export async function deliver(tenantId: string, notice: Notice, opts: NudgeOptions = {}, now = new Date()): Promise<DeliveryOutcome> {
  await addToBell(tenantId, notice, now).catch((e) => console.warn(`[notify] bell write failed: ${e instanceof Error ? e.message : "unknown"}`));
  return nudge(tenantId, notice, opts, now);
}

async function emailOnce(tenantId: string, notice: Notice, key: string, everyMs: number | undefined, now: Date): Promise<boolean> {
  try {
    const log = ((await stateStore.get(tenantId, MAILED))?.state as { sent?: Record<string, string> } | undefined)?.sent ?? {};
    const last = log[key];
    if (last && (everyMs === undefined || now.getTime() - Date.parse(last) < everyMs)) return false;
    const to = await accountEmail(tenantId);
    if (!to) return false;
    const mail = noticeEmail(notice, to.name);
    const r = await sendMail({ to: to.email, subject: notice.title, ...mail });
    if (!r.sent) return false;
    const sent = Object.fromEntries(Object.entries({ ...log, [key]: now.toISOString() }).sort((a, b) => b[1].localeCompare(a[1])).slice(0, MAILED_CAP));
    await stateStore.put(tenantId, MAILED, { sent });
    return true;
  } catch (e) {
    console.warn(`[notify] email failed: ${e instanceof Error ? e.message : "unknown"}`);
    return false;
  }
}

/** The email for one notification: its title, its words and one button to the same place the bell links. */
export function noticeEmail(notice: Notice, firstName?: string): { html: string; text: string } {
  const origin = siteUrl().origin;
  const link = new URL(notice.href, origin).toString();
  const action = notice.action ?? "Open WonderJobs";
  const hi = firstName ? `Hi ${firstName},` : "Hi,";
  return renderEmailLayout({
    origin,
    preheader: notice.body.slice(0, 120),
    bodyHtml: `<p style="margin:0 0 10px">${escapeHtml(hi)}</p><div style="font-size:18px;font-weight:700;margin:0 0 8px">${escapeHtml(notice.title)}</div><p style="margin:0 0 16px;white-space:pre-wrap">${escapeHtml(notice.body)}</p><p style="margin:0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:${EMAIL_COLORS.brand600};color:#ffffff;text-decoration:none;font-weight:600">${escapeHtml(action)}</a></p>`,
    bodyText: [hi, notice.title, notice.body, `${action}: ${link}`].join("\n\n"),
    reason: "You're getting this because notifications aren't turned on in any of your browsers. Turn them on, or change what WonderJobs emails you, in Notification settings.",
  });
}
