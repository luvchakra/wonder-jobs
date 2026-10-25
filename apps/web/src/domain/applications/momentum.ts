/**
 * Where an application that's been sent actually stands (owner, 2026-10-25): most sit for weeks with nothing
 * happening, some are going well, some have gone cold. Application code reads only what's on the application —
 * when it was sent, the employer's replies, the follow-ups done, the candidate's own notes — and says which, with
 * the reason, so the candidate can reach the ones like it and act. Nothing is guessed: no model, no outside data.
 */
import type { Application } from "./types";

export type Momentum = "promising" | "follow_up" | "waiting" | "quiet";

export const MOMENTUM_META: Record<Momentum, { label: string; tone: "success" | "warning" | "info" | "neutral" }> = {
  promising: { label: "Promising", tone: "success" },
  follow_up: { label: "Follow up", tone: "warning" },
  waiting: { label: "Waiting", tone: "info" },
  quiet: { label: "Gone quiet", tone: "neutral" },
};

export const MOMENTUM_ORDER: Momentum[] = ["promising", "follow_up", "waiting", "quiet"];

/** Days after sending before a follow-up is worth it, and before silence reads as gone quiet. */
export const FOLLOW_UP_AFTER_DAYS = 7;
export const QUIET_AFTER_DAYS = 30;

const DAY = 86_400_000;
/** The candidate's own words that mean the employer is engaging, or that it has ended. */
const GOOD_NEWS = /\b(call(ed|s)?|spoke|talked|repl(y|ied)|respon(ded|se)|reached out|e-?mail(ed)?|shortlist(ed)?|screen(ing|ed)?|interview(s|ed)?|next (round|step)|assessment|test|scheduled|meet(ing)?|offer)\b/i;
const BAD_NEWS = /\b(reject(ed|ion)?|declin(ed|e)|not (moving|selected|proceeding|shortlisted)|no longer|position (is )?filled|filled the|ghost(ed)?|no response)\b/i;

const sentAt = (a: Pick<Application, "appliedAt" | "createdAt" | "events">) =>
  a.appliedAt ?? a.events.find((e) => e.type === "submitted")?.at ?? a.createdAt;

const quote = (t: string) => `“${t.length > 40 ? `${t.slice(0, 39)}…` : t}”`;

export function momentumOf(a: Pick<Application, "appliedAt" | "createdAt" | "events" | "followUps">, now = Date.now()): { momentum: Momentum; reason: string } {
  const sent = sentAt(a);
  const days = Math.max(0, Math.round((now - Date.parse(sent)) / DAY));
  const after = a.events.filter((e) => e.at >= sent);
  const reply = [...after].reverse().find((e) => e.type === "recruiter_response");
  const notes = [...after].reverse().filter((e) => e.type === "note");
  const bad = notes.find((n) => BAD_NEWS.test(`${n.title} ${n.detail ?? ""}`));
  const good = notes.find((n) => GOOD_NEWS.test(`${n.title} ${n.detail ?? ""}`));
  // The newest word wins: a later "rejected" note outweighs an earlier call.
  if (bad && (!good || bad.at >= good.at) && (!reply || bad.at >= reply.at)) return { momentum: "quiet", reason: `Your note: ${quote(bad.detail ?? bad.title)}` };
  if (reply) return { momentum: "promising", reason: "The employer replied" };
  if (good) return { momentum: "promising", reason: `Your note: ${quote(good.detail ?? good.title)}` };
  const followedUp = a.followUps.some((f) => f.kind === "follow_up" && f.done) || after.some((e) => e.type === "follow_up");
  if (days >= QUIET_AFTER_DAYS || (followedUp && days >= FOLLOW_UP_AFTER_DAYS * 3)) return { momentum: "quiet", reason: `No reply in ${days} days${followedUp ? ", after a follow-up" : ""}` };
  if (days >= FOLLOW_UP_AFTER_DAYS && !followedUp) return { momentum: "follow_up", reason: `Sent ${days} days ago, no reply yet` };
  return { momentum: "waiting", reason: days === 0 ? "Sent today" : `Sent ${days} day${days === 1 ? "" : "s"} ago${followedUp ? ", followed up" : ""}` };
}
