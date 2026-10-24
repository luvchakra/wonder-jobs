/**
 * The scheduled ratings run (`/api/cron/jobslake-ratings`, a daily tick). On the tick it checks the frequency set in
 * Company ratings, and when it's due works through the companies still waiting — the same job as the Run button,
 * spending the keys on the list one after another. A run that ran out of time carries on at the next tick. When the
 * last key is gone with companies still waiting, the owner is emailed once for that run.
 */
import { RATINGS_FREQUENCIES, ratingsDue } from "@/domain/scheduler/settings";
import { siteUrl } from "@/lib/siteUrl";
import { EMAIL_COLORS, escapeHtml, renderEmailLayout } from "@/server/email/layout";
import { sendMail } from "@/server/notify";
import { loadScheduler, recordCronRun } from "@/server/scheduler/store";
import { listRatingRuns, recordRatingSlice, type RatingRun } from "./ratingRuns";
import { runRatings, type RatingsRunReport } from "./ratingsJob";

type Mailer = (m: { to: string; subject: string; html: string; text: string }) => Promise<{ sent: boolean; reason?: string }>;

/** The "add a key" email: what's waiting, and where to add one. */
export function renderNeedsKeyEmail(p: { left: number; origin: string }) {
  const C = EMAIL_COLORS;
  const link = `${p.origin}/platform/jobs-lake/ratings`;
  const what = `${p.left} ${p.left === 1 ? "company is" : "companies are"} still waiting for a rating`;
  const bodyHtml = `<div style="font-size:18px;font-weight:700;margin:0 0 12px">The ratings job needs a new Explorium API key</div>
<div style="font-size:14px;line-height:1.55;color:${C.ink}">Every API key on the list has run out of credits, and ${escapeHtml(what)}. Add a new key and the next scheduled run (or the Run button) carries on.</div>
<div style="margin:14px 0 0"><a href="${escapeHtml(link)}" style="color:${C.brand600};font-weight:600">Open Company ratings</a></div>`;
  const bodyText = `Every API key on the list has run out of credits, and ${what}. Add a new key and the next scheduled run (or the Run button) carries on.\n\n${link}`;
  const mail = renderEmailLayout({ origin: p.origin, preheader: what, bodyHtml, bodyText, reason: "You're getting this because this address is set to be told when the company-ratings job has no API key left.", settingsLink: false });
  return { subject: "WonderJobs: company ratings need a new Explorium API key", ...mail };
}

/** A test message, so the owner can see the platform mailbox reaches the address the "no key left" email goes to. */
export function renderTestEmail(origin: string) {
  const C = EMAIL_COLORS;
  const bodyHtml = `<div style="font-size:18px;font-weight:700;margin:0 0 12px">Test email from Company ratings</div>
<div style="font-size:14px;line-height:1.55;color:${C.ink}">If you can read this, the platform mailbox reaches this address. When the ratings job runs out of API keys with companies still waiting, you'll get an email like this one asking for a new key.</div>`;
  const bodyText = "If you can read this, the platform mailbox reaches this address. When the ratings job runs out of API keys with companies still waiting, you'll get an email like this one asking for a new key.";
  const mail = renderEmailLayout({ origin, preheader: "The platform mailbox reaches this address", bodyHtml, bodyText, reason: "You're getting this because someone pressed Send test email in Company ratings for this address.", settingsLink: false });
  return { subject: "WonderJobs: test email from Company ratings", ...mail };
}

/** Sends the test message to the address in the schedule settings; says plainly when the mailbox isn't set up. */
export async function sendRatingsTestEmail(to: string, send: Mailer = sendMail): Promise<{ to: string; sent: boolean; reason?: string }> {
  const r = await send({ to, ...renderTestEmail(siteUrl().origin) });
  return { to, sent: r.sent, ...(r.reason ? { reason: r.reason } : {}) };
}

export interface ScheduledRatingsResult {
  outcome: "ok" | "skipped" | "failed";
  reason?: string;
  report?: RatingsRunReport;
  email?: RatingRun["email"];
}

export async function runScheduledRatings(opts: { now?: Date; budgetMs?: number; send?: Mailer; run?: typeof runRatings } = {}): Promise<ScheduledRatingsResult> {
  const now = opts.now ?? new Date();
  const startedAt = now.toISOString();
  const settings = (await loadScheduler()).ratings;
  if (!settings.enabled) return { outcome: "skipped", reason: "Turned off in Company ratings" };

  const runs = await listRatingRuns();
  const last = runs.find((r) => r.trigger === "scheduled");
  if (!ratingsDue(settings.frequency, last, now)) return { outcome: "skipped", reason: `Not due (${RATINGS_FREQUENCIES[settings.frequency].label.toLowerCase()})` };
  // A person is running it right now: two runs would look the same companies up twice.
  const busy = runs.find((r) => r.trigger === "manual" && r.status === "more" && now.getTime() - new Date(r.updatedAt).getTime() < 3 * 60_000);
  if (busy) return { outcome: "skipped", reason: "A manual run is in progress" };

  try {
    const report = await (opts.run ?? runRatings)({ budgetMs: opts.budgetMs ?? 40_000 });
    let email: RatingRun["email"];
    // The last key is gone and companies are waiting: tell the owner. "needs_key" ends a run, so it's once per run — and a
    // daily schedule with no key added doesn't email every day: not again within a week of the last email.
    const lastEmailed = last?.email?.sent && now.getTime() - new Date(last.updatedAt).getTime() < 7 * 86_400_000;
    if (report.status === "needs_key" && !lastEmailed) {
      const mail = renderNeedsKeyEmail({ left: report.left, origin: siteUrl().origin });
      const sent = await (opts.send ?? sendMail)({ to: settings.notifyEmail, ...mail });
      email = { to: settings.notifyEmail, sent: sent.sent, ...(sent.reason ? { reason: sent.reason } : {}) };
    }
    // A run that was carrying on from an earlier tick is the same run.
    const run = await recordRatingSlice({ id: last?.status === "more" ? last.id : undefined, trigger: "scheduled", report, email, now });
    await recordCronRun({
      job: "jobslake-ratings",
      trigger: "cron",
      startedAt,
      finishedAt: new Date().toISOString(),
      outcome: "ok",
      summary: `${report.checked} looked up · ${report.rated} rated · ${report.left} left · ${report.status}${email ? ` · email to owner ${email.sent ? "sent" : `not sent (${email.reason ?? "failed"})`}` : ""}`,
    });
    return { outcome: "ok", report, email: run.email };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await recordCronRun({ job: "jobslake-ratings", trigger: "cron", startedAt, finishedAt: new Date().toISOString(), outcome: "failed", summary: `Failed: ${reason}` });
    return { outcome: "failed", reason };
  }
}
