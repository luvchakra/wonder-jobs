/**
 * The "import finished" email (owner, 2026-11-03: "every time the import job finishes, send an email to admin with
 * additional counts of entries available in Find of each module"). Sent once per finished import job (Import now,
 * Import this module, the scheduled import, and each hourly collection that collected or refreshed anything) to the platform admins (`JOBSLAKE_ADMIN_EMAILS`; the scheduler's notify
 * address when none is set). Each module's line is what's in Find now and the change since the last run that counted
 * it, both from the runs' own records; nothing is estimated. Never throws: an email must not fail an import.
 */
import { siteUrl } from "@/lib/siteUrl";
import { EMAIL_COLORS, escapeHtml, renderEmailLayout } from "@/server/email/layout";
import { parseEmailList, sendMail } from "@/server/notify";
import { SCHEDULER_DEFAULTS, type SchedulerSettings } from "@/domain/scheduler/settings";
import { loadScheduler } from "@/server/scheduler/store";
import { MODULE_LABELS } from "@/server/schedules/labels";
import type { ImportRun } from "./importRuns";

type Mailer = (m: { to: string; subject: string; html: string; text: string }) => Promise<{ sent: boolean; reason?: string }>;

export interface ModuleCount {
  module: string;
  label: string;
  inFind: number;
  /** Change since the previous run that counted this module; null when no earlier run did. */
  added: number | null;
}

/** Each counted module, most added first: what's in Find after `run` and the change since the run before that counted it. */
export function moduleCounts(run: ImportRun, earlier: ImportRun[]): ModuleCount[] {
  const out: ModuleCount[] = [];
  for (const [module, inFind] of Object.entries(run.stored ?? {})) {
    const prev = earlier.find((r) => r.id !== run.id && r.finishedAt <= run.finishedAt && typeof r.stored?.[module] === "number");
    out.push({ module, label: MODULE_LABELS[module] ?? module, inFind, added: prev ? inFind - prev.stored![module] : null });
  }
  return out.sort((a, b) => (b.added ?? 0) - (a.added ?? 0) || a.label.localeCompare(b.label));
}

const signed = (n: number | null) => (n == null ? "first count" : n > 0 ? `+${n.toLocaleString("en")}` : n < 0 ? `−${Math.abs(n).toLocaleString("en")}` : "no change");

export function renderImportEmail(run: ImportRun, counts: ModuleCount[], origin: string) {
  const C = EMAIL_COLORS;
  const link = `${origin}/platform/jobs-lake/import`;
  const added = counts.reduce((n, c) => n + Math.max(0, c.added ?? 0), 0);
  const what = run.kind === "hourly" ? (run.trigger === "cron" ? "The hourly collection" : "The collection (Run now)") : run.kind === "module" ? `Import of ${MODULE_LABELS[run.module ?? ""] ?? run.module ?? "a module"}` : run.trigger === "scheduler" ? "The scheduled import" : "Import now";
  const head = counts.length ? `${added.toLocaleString("en")} new ${added === 1 ? "entry" : "entries"} in Find` : "Find wasn't refreshed";
  const rows = counts
    .map((c) => `<tr><td style="padding:4px 12px 4px 0">${escapeHtml(c.label)}</td><td style="padding:4px 12px 4px 0;text-align:right;font-weight:600">${escapeHtml(signed(c.added))}</td><td style="padding:4px 0;text-align:right;color:${C.ink}">${c.inFind.toLocaleString("en")} in Find</td></tr>`)
    .join("");
  const bodyHtml = `<div style="font-size:18px;font-weight:700;margin:0 0 6px">${escapeHtml(what)} finished: ${escapeHtml(head)}</div>
<div style="font-size:14px;line-height:1.55;color:${C.ink};margin:0 0 12px">${escapeHtml(run.summary)}</div>
${rows ? `<table style="font-size:14px;border-collapse:collapse;margin:0 0 12px"><tr><th style="text-align:left;padding:4px 12px 4px 0">Module</th><th style="text-align:right;padding:4px 12px 4px 0">Since last run</th><th style="text-align:right;padding:4px 0">Now</th></tr>${rows}</table>` : ""}
<div><a href="${escapeHtml(link)}" style="color:${C.brand600};font-weight:600">Open Import</a></div>`;
  const bodyText = `${what} finished: ${head}.\n${run.summary}\n\n${counts.map((c) => `${c.label}: ${signed(c.added)} (${c.inFind.toLocaleString("en")} in Find)`).join("\n")}\n\n${link}`;
  const mail = renderEmailLayout({ origin, preheader: head, bodyHtml, bodyText, reason: "You're getting this because you're a WonderWorks admin and an import job finished.", settingsLink: false });
  return { subject: `WonderWorks: ${what} finished · ${head}`, ...mail };
}

/** Who gets it: the addresses set on Data → Import, else the platform admins, else the scheduler's notify address. */
export async function importEmailRecipients(env: NodeJS.ProcessEnv = process.env, set: string[] = []): Promise<string[]> {
  if (set.length) return set;
  const admins = parseEmailList(env.JOBSLAKE_ADMIN_EMAILS);
  if (admins.length) return admins;
  const fallback = (await loadScheduler().catch(() => null))?.ratings.notifyEmail;
  return fallback ? [fallback] : [];
}

/** An hourly collection that had nothing due and refreshed nothing isn't worth an email (the run log folds those too). */
export const worthEmailing = (run: ImportRun) => run.kind !== "hourly" || run.items.length > 0 || Object.keys(run.stored ?? {}).length > 0;

export async function sendImportEmail(run: ImportRun, earlier: ImportRun[], deps: { send?: Mailer; recipients?: string[]; settings?: SchedulerSettings["importEmail"] } = {}): Promise<{ sent: number; reason?: string }> {
  try {
    if (!worthEmailing(run)) return { sent: 0, reason: "nothing collected" };
    // Admin → Data → Import → Emails: each kind of run can be switched off; a failed lookup keeps the default (on).
    const settings = deps.settings ?? (await loadScheduler().catch(() => SCHEDULER_DEFAULTS)).importEmail;
    if (!(run.kind === "hourly" ? settings.hourly : settings.imports)) return { sent: 0, reason: "turned off" };
    const to = deps.recipients ?? (await importEmailRecipients(process.env, settings.to));
    if (!to.length) return { sent: 0, reason: "no admin email set" };
    const mail = renderImportEmail(run, moduleCounts(run, earlier), siteUrl().origin);
    const send = deps.send ?? sendMail;
    let sent = 0;
    let reason: string | undefined;
    for (const addr of to) {
      const r = await send({ to: addr, ...mail });
      if (r.sent) sent++;
      else reason = r.reason;
    }
    return { sent, ...(reason ? { reason } : {}) };
  } catch (e) {
    console.warn(`[import] finish email failed: ${e instanceof Error ? e.message.slice(0, 200) : "unknown"}`);
    return { sent: 0, reason: "send failed" };
  }
}
