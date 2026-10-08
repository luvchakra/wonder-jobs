import crypto from "node:crypto";
import { z } from "zod";
import type { Application } from "@/domain/applications/types";
import { buildDigest, checkedDigestSuggestions, type Digest } from "@/domain/digest/build";
import { assist } from "@/server/ai/assist";
import { readClientState } from "@/server/clientState";
import { sendMail } from "@/server/notify";
import { stateStore } from "@/server/state";
import { getSupabaseAdmin } from "@/server/supabase";
import { loadTenantSnapshot } from "@/server/workflow/snapshot";
import { siteUrl } from "@/lib/siteUrl";
import { renderDigestEmail } from "./email";

const STORE = "wj.digest" as const;
const WEEK = 7 * 86_400_000;

export interface DigestLogEntry {
  at: string;
  /** Idempotency key: one digest per tenant per day (manual sends have their own). */
  key: string;
  sent: boolean;
  reason?: string;
  subject?: string;
}

export interface DigestState {
  /** On unless the candidate turned it off (in Account, or from an email's link). */
  enabled: boolean;
  lastSentAt?: string;
  log: DigestLogEntry[];
}

export async function readDigestState(tenantId: string): Promise<DigestState> {
  const doc = await stateStore.get(tenantId, STORE);
  const s = (doc?.state ?? {}) as Partial<DigestState>;
  return { enabled: s.enabled !== false, lastSentAt: s.lastSentAt, log: Array.isArray(s.log) ? s.log : [] };
}

async function writeDigestState(tenantId: string, s: DigestState): Promise<void> {
  await stateStore.put(tenantId, STORE, { ...s, log: s.log.slice(-60) });
}

export async function setDigestEnabled(tenantId: string, enabled: boolean): Promise<DigestState> {
  const s = { ...(await readDigestState(tenantId)), enabled };
  await writeDigestState(tenantId, s);
  return s;
}

/* ------------------------------------------------------- unsubscribe link */

function secret() {
  const s = process.env.SECRET_ENCRYPTION_KEY ?? process.env.WONDER_SECRET_KEY;
  if (!s) throw new Error("SECRET_ENCRYPTION_KEY is required to sign digest unsubscribe links");
  return s;
}
export const signDigestUnsubscribe = (tenantId: string) => crypto.createHmac("sha256", secret()).update(`digest-unsubscribe:${tenantId}`).digest("hex").slice(0, 32);
export function verifyDigestUnsubscribe(tenantId: string, sig: string): boolean {
  const a = Buffer.from(signDigestUnsubscribe(tenantId));
  const b = Buffer.from(sig || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------------------------------------------------------- build */

export async function digestFor(tenantId: string, now: Date, since: string): Promise<Digest> {
  const [snap, apps] = await Promise.all([loadTenantSnapshot(tenantId), readClientState<{ applications?: Record<string, Application> }>(tenantId, "wj.applications")]);
  const digest = buildDigest({
    now,
    since,
    dna: snap.career.dna,
    learnedSignals: snap.career.learnedSignals ?? [],
    answerMemory: Array.isArray(snap.career.answerMemory) ? (snap.career.answerMemory as { confirmedAt: string }[]) : [],
    jobs: snap.jobs.jobs,
    matches: snap.jobs.matches,
    saved: snap.jobs.saved,
    rejected: snap.jobs.rejected,
    runs: Object.values(snap.workflow.runs ?? {}),
    applications: Object.values(apps?.applications ?? {}),
  });
  return { ...digest, suggestions: [...digest.suggestions, ...(await aiSuggestions(digest))] };
}

const Reply = z.object({ suggestions: z.array(z.object({ text: z.string().max(400), facts: z.array(z.string().max(80)).max(6) })).max(5) });

/** Up to three AI suggestions grounded in the digest's facts; none when no model answers. */
async function aiSuggestions(d: Digest): Promise<Digest["suggestions"]> {
  if (!d.hasActivity) return [];
  const reply = await assist({
    task: "activity_digest",
    instructions: [
      "You coach a job seeker using a job-search app. From the facts about their recent activity, give up to 3 specific, practical suggestions to improve their search or applications this week.",
      "Each is one sentence, speaks to them as 'you', uses only numbers that appear in the facts, and cites the fact keys it rests on, copied exactly.",
      "Don't repeat these: " + (d.suggestions.map((s) => s.text).join(" | ") || "none") + ".",
      'Shape: {"suggestions":[{"text":"<one sentence>","facts":["<fact key>"]}]}',
    ].join(" "),
    data: d.facts.map((f) => `${f.key} = ${f.value}  (${f.label})`).join("\n"),
    schema: Reply,
    maxTokens: 500,
    timeoutMs: 12000,
  });
  return checkedDigestSuggestions(reply?.suggestions, d);
}

/* ----------------------------------------------------------------- send */

async function accountEmail(tenantId: string): Promise<{ email: string; name?: string } | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb.auth.admin.getUserById(tenantId);
  if (error || !data?.user?.email) return null;
  const meta = (data.user.user_metadata ?? {}) as { full_name?: string; name?: string };
  return { email: data.user.email, name: (meta.full_name || meta.name || "").split(" ")[0] || undefined };
}

export interface DigestOutcome {
  tenantId: string;
  sent: boolean;
  reason?: string;
}

/**
 * Sends a tenant's digest when there has been activity since the last one — at most once a day (the
 * day's key is checked before sending and logged after), only to the account's own sign-in address, and
 * never when they turned it off. `manual` (the candidate asked for one now) skips the activity and daily
 * checks but is rate-limited by its route. Every attempt is logged, sent or not, with the reason.
 */
export async function sendDigest(tenantId: string, opts: { now?: Date; manual?: boolean } = {}): Promise<DigestOutcome> {
  const now = opts.now ?? new Date();
  const state = await readDigestState(tenantId);
  if (!state.enabled && !opts.manual) return { tenantId, sent: false, reason: "turned off" };
  const key = opts.manual ? `digest:${tenantId}:manual:${now.toISOString().slice(0, 16)}` : `digest:${tenantId}:${now.toISOString().slice(0, 10)}`;
  if (!opts.manual && state.log.some((e) => e.key === key && e.sent)) return { tenantId, sent: false, reason: "already sent today" };

  const floor = new Date(now.getTime() - WEEK).toISOString();
  const since = state.lastSentAt && state.lastSentAt > floor ? state.lastSentAt : floor;
  const digest = await digestFor(tenantId, now, since);
  if (!digest.hasActivity && !opts.manual) return { tenantId, sent: false, reason: "no activity" };

  const to = await accountEmail(tenantId);
  const log = (entry: Omit<DigestLogEntry, "at" | "key">, sentAt?: string) => writeDigestState(tenantId, { ...state, lastSentAt: sentAt ?? state.lastSentAt, log: [...state.log, { at: now.toISOString(), key, ...entry }] });
  if (!to) {
    await log({ sent: false, reason: "no sign-in email for this account" });
    return { tenantId, sent: false, reason: "no sign-in email" };
  }
  const origin = siteUrl().origin;
  const unsubscribeUrl = `${origin}/api/digest/unsubscribe?u=${encodeURIComponent(tenantId)}&s=${signDigestUnsubscribe(tenantId)}`;
  const mail = renderDigestEmail(digest, { origin, name: to.name, unsubscribeUrl });
  const result = await sendMail({ to: to.email, subject: mail.subject, html: mail.html, text: mail.text, headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
  await log({ sent: result.sent, reason: result.reason, subject: mail.subject }, result.sent ? now.toISOString() : undefined);
  return { tenantId, sent: result.sent, reason: result.reason };
}
