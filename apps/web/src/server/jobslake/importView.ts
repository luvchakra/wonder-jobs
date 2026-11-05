/**
 * Sources → Import (owner, 2026-11-02: "design the entire data import from sources to appearing in find in a way
 * so that it can be managed from one page"): the one read model behind that page. Three stages, for every module:
 *   Sources (live, waiting, needs you) → Collected (what the gateway holds) → In Find (what WorksLake stores).
 * Each module lists its sources as rows with one state and at most one action, so an admin sees in one place why a
 * module's listings are where they are. Never a secret.
 */
import { explainFailure } from "@/domain/gateway/failure";
import { MAX_POSTING_AGE_DAYS } from "@/domain/jobs/age";
import { dataTypeOf } from "@/domain/jobslake/moduleData";
import type { CronRun } from "@/domain/scheduler/settings";
import { MODULES, type ModuleId } from "@/modules/registry";
import { gatewayOverview, type GatewayRunRow, type GatewaySourceRow } from "@/server/gateway/admin";
import { readSetupJob, type SetupJob } from "@/server/gateway/setupJob";
import { listImportRuns, type ImportRun } from "@/server/gateway/importRuns";
import { failedLately } from "@/server/gateway/collectJob";
import { listCronRuns, loadScheduler } from "@/server/scheduler/store";
import { parseEmailList, smtpConfig } from "@/server/notify";
import { isGatewayBridge } from "./gatewaySources";
import { setupTodo, type SetupItem } from "./setup";
import { jobsLakeStore } from "./store";
import { listAllSourceViews, type SourceView } from "./views";
import { lastGatewayRefresh } from "./warm";

export interface ImportJobView {
  id: string;
  running: boolean;
  /** Running, but no server has worked on it for over two minutes (its hand-on was lost): Continue picks it up. */
  stalled?: true;
  phase: "setup" | "refreshing" | "done";
  kind: "import" | "module";
  module?: string;
  trigger: string;
  by: string;
  startedAt: string;
  finishedAt?: string;
  done: number;
  total: number;
  live: number;
  failed: number;
  /** The source being worked on now, and its step. */
  current?: { name: string; step?: string; since?: string };
  items: { name: string; status: string; step?: string; message?: string; valid?: number }[];
  stored?: Record<string, number>;
}

export type ImportState = "live" | "waiting" | "needs_you" | "down" | "off";

export type ImportAction =
  | { kind: "run"; label: string; run: NonNullable<SetupItem["run"]> }
  | { kind: "link"; label: string; href: string }
  | { kind: "decide"; label: string; decision: string }
  | { kind: "pause" | "activate" | "collect" | "test"; label: string; sourceId: string }
  | { kind: "upload"; label: string; sourceId: string }
  | { kind: "source_status"; label: string; id: string; status: "paused" | "active" }
  | { kind: "dismiss"; label: string; id: string; dismissed: boolean };

/** One source (or one thing the owner must decide) on a module's list: one state, at most one action. */
export interface ImportRow {
  id: string;
  name: string;
  /** Where it comes from, in a word the admin recognises. */
  kind: "WorksLake" | "Gateway" | "Catalogue" | "Partner" | "Decision";
  state: ImportState;
  /** What's up with it, in a line. */
  detail: string;
  /** Listings it holds (gateway sources) or fetched in the last day (WorksLake sources). */
  listings?: number;
  /** The one thing to do next. */
  action?: ImportAction;
  /** For investigating and fixing: pause or resume, collect or test now, open the source. */
  more: ImportAction[];
  /** What it did lately, for the row's Details: never a secret. */
  history: { label: string; value: string }[];
  termsPending?: boolean;
}

export interface ImportModule {
  id: ModuleId;
  label: string;
  dataType: string;
  live: number;
  waiting: number;
  needsYou: number;
  /** Listings the gateway holds for the module. */
  collected: number;
  /** Listings in Find (stored in the last two weeks); null when uncountable. */
  inFind: number | null;
  /** Import paused for this module: not collected, set up or refreshed until resumed. */
  paused: boolean;
  /** Rows that are down or need you, in a line, so a problem is seen without opening the card. */
  problems: string[];
  rows: ImportRow[];
}

export interface ImportView {
  /** When the server built this answer (the page compares times against it, not the device's clock). */
  generatedAt: string;
  gatewayConfigured: boolean;
  pipeline: {
    sources: { live: number; waiting: number; needsYou: number };
    collected: { listings: number; lastAt: string | null; nextAt: string | null };
    find: { listings: number | null; refreshedAt: string | null; stored: Record<string, number> };
  };
  schedule: { activateWaiting: boolean; cronSet: boolean; pausedModules: string[] };
  /** The "import finished" email's settings; `admins`: how many platform admins get it when no address is set. */
  emails: { imports: boolean; hourly: boolean; to: string[]; admins: number; mailbox: boolean };
  /** The server job started by Import now, a module's import or the hourly run: while it runs, or for a day after. */
  job: ImportJobView | null;
  /** Every run, newest first (importRuns.ts). */
  runs: ImportRun[];
  lastRun: CronRun | null;
  modules: ImportModule[];
  recentRuns: GatewayRunRow[];
}

const DAY = 86_400_000;
const liveStatus = (s: { status: string }) => s.status === "active" || s.status === "degraded";
const ago = (iso: string | null | undefined) => (iso ? `${Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3_600_000))} h ago` : "never");
const n = (v: number) => v.toLocaleString("en-IN");

/** Why a source didn't go live lately, in a line. */
const blockedLine = (f: { at: string; step?: string; message?: string }) => {
  const why = explainFailure(f.step, f.message);
  return `Didn't go live ${ago(f.at)}: ${why.label}. ${why.detail} Import now leaves it out for a day.`;
};

/** A WorksLake source's recent runs, in lines. */
function sourceHistory(v: SourceView): ImportRow["history"] {
  const h = v.health;
  if (!h || !h.runs) return [{ label: "Runs, 7 days", value: "none" }];
  const failed = h.failures.timeout + h.failures.unavailable + h.failures.needs_setup;
  return [
    { label: "Runs, 7 days", value: `${n(h.runs)} · ${h.successRate == null ? "—" : `${Math.round(h.successRate * 100)}% ok`}${failed ? ` · ${n(failed)} failed (${[h.failures.timeout && `${h.failures.timeout} timed out`, h.failures.unavailable && `${h.failures.unavailable} unavailable`, h.failures.needs_setup && `${h.failures.needs_setup} needed setup`].filter(Boolean).join(", ")})` : ""}` },
    { label: "Last run", value: `${ago(h.lastRunAt)} · last success ${ago(h.lastSuccessAt)}` },
    { label: "Fetched, 7 days", value: `${n(h.retrieved)} · ${n(h.valid)} passed checks${h.p50LatencyMs ? ` · ${Math.round(h.p50LatencyMs)} ms typical` : ""}` },
  ];
}

/** A gateway source's recent runs, in lines. */
function gatewayHistory(g: GatewaySourceRow): ImportRow["history"] {
  const out: ImportRow["history"] = [{ label: "Listings held", value: n(g.listings) }];
  out.push({ label: "Last collection", value: g.lastError ? `failed: ${g.lastError} · last success ${ago(g.lastSuccessAt)}` : ago(g.lastSuccessAt) });
  if (g.lastTest) out.push({ label: "Last test", value: `${ago(g.lastTest.at)} · ${g.lastTest.ok ? "passed" : "failed"} · ${n(g.lastTest.valid)} of ${n(g.lastTest.discovered)} read well` });
  if (g.enabled) out.push({ label: "Next collection", value: `${g.nextRunAt ? ago(g.nextRunAt).replace(" ago", "") : "soon"} · every ${g.intervalMinutes >= 1440 ? `${Math.round(g.intervalMinutes / 1440)} d` : `${Math.round(g.intervalMinutes / 60)} h`}` });
  if (g.crawl?.progress) out.push({ label: "Crawl", value: g.crawl.progress });
  if (g.termsPending) out.push({ label: "Terms", value: "pending: confirm its reuse terms (Setup decision)" });
  return out;
}

/** Pure: a module's rows from its WorksLake sources, its gateway sources and its Setup items (exported for tests). */
export function moduleRows(mod: ModuleId, views: SourceView[], gateway: GatewaySourceRow[], items: SetupItem[], failed: Map<string, { at: string; step?: string; message?: string }> = new Map(), dismissed: Set<string> = new Set()): ImportRow[] {
  const rows: ImportRow[] = [];
  const byItem = new Map(items.map((i) => [i.id, i]));
  // Owner decisions and catalogue sources not yet added: only the Setup list knows them.
  for (const i of items) {
    if (i.module !== mod && !(i.module === "all" && mod === "jobs")) continue;
    if (i.decision) rows.push({ id: i.id, name: i.name, kind: "Decision", state: "needs_you", detail: i.detail, action: { kind: "decide", label: "Mark decided", decision: i.id.replace(/^decision:/, "") }, more: i.action.href !== "/platform/jobs-lake/import" ? [{ kind: "link", label: i.action.label, href: i.action.href }] : [], history: [] });
    else if (i.run?.kind === "add") {
      const f = failed.get(i.id);
      if (dismissed.has(i.id)) rows.push({ id: i.id, name: i.name, kind: "Catalogue", state: "off", detail: "Dismissed: Import never tries it.", action: { kind: "dismiss", label: "Restore", id: i.id, dismissed: false }, more: [], history: [] });
      else rows.push({ id: i.id, name: i.name, kind: "Catalogue", state: f ? "needs_you" : "waiting", detail: f ? blockedLine(f) : i.detail, action: { kind: "run", label: f ? "Try again" : "Add & activate", run: i.run }, more: f ? [{ kind: "dismiss", label: "Dismiss", id: i.id, dismissed: true }] : [], history: [] });
    }
  }
  // WorksLake's own sources (the gateway bridges are automatic now, so they aren't listed).
  for (const v of views) {
    if ((v.module ?? "jobs") !== mod || isGatewayBridge(v.id)) continue;
    if (v.status === "do_not_use" || v.status === "disabled") continue;
    const item = byItem.get(v.id);
    const href = `/platform/jobs-lake/sources/${encodeURIComponent(v.id)}`;
    const open: ImportAction = { kind: "link", label: "Open source", href };
    if (item) {
      const state: ImportState = item.need === "activate" ? "waiting" : "needs_you";
      // Terms pending on a live source: confirm them here, or pause it (owner, 2026-11-05: "give direct action buttons").
      const terms = item.need === "terms";
      const termsActions: ImportAction[] = terms ? [{ kind: "decide", label: "Terms confirmed", decision: `terms:${v.id}` }, ...(v.status === "paused" ? [] : [{ kind: "source_status" as const, label: "Pause", id: v.id, status: "paused" as const }])] : [];
      rows.push({ id: v.id, name: v.name, kind: "WorksLake", state, detail: item.detail, termsPending: terms, action: terms ? termsActions[0] : { kind: "link", label: item.action.label, href: item.action.href }, more: [...termsActions.slice(1), ...(item.action.href === href ? [] : [open]), ...(terms ? [open] : [])].filter((a, n, all) => all.findIndex((b) => b.label === a.label) === n), history: sourceHistory(v) });
      continue;
    }
    if (liveStatus(v)) rows.push({ id: v.id, name: v.name, kind: "WorksLake", state: v.health?.state === "down" ? "down" : "live", detail: v.health?.state === "down" ? "Down: its last runs failed" : v.statusLabel, action: v.health?.state === "down" ? open : undefined, more: [{ kind: "source_status", label: "Pause", id: v.id, status: "paused" }, ...(v.health?.state === "down" ? [] : [open])], history: sourceHistory(v) });
    else rows.push({ id: v.id, name: v.name, kind: "WorksLake", state: "off", detail: v.statusLabel, action: v.status === "paused" ? { kind: "source_status", label: "Resume", id: v.id, status: "active" } : open, more: v.status === "paused" ? [open] : [], history: sourceHistory(v) });
  }
  // The gateway's sources for this module.
  for (const g of gateway) {
    if (!g.modules.includes(mod)) continue;
    const partner = g.kind === "upload";
    const kind = partner ? "Partner" : "Gateway";
    if (g.enabled) {
      const detail = g.lastError ? `Last run failed: ${g.lastError}` : `${g.listings ? `${g.listings.toLocaleString("en-IN")} listings` : "No listings yet"}${g.termsPending ? " · terms pending" : ""}`;
      const collect: ImportAction = { kind: "collect", label: "Collect now", sourceId: g.id };
      const pause: ImportAction = { kind: "pause", label: "Pause", sourceId: g.id };
      rows.push({ id: `gateway:${g.id}`, name: g.name, kind, state: g.lastError ? "down" : "live", detail, listings: g.listings, termsPending: g.termsPending, action: partner ? { kind: "upload", label: "Upload list", sourceId: g.id } : g.lastError ? collect : undefined, more: partner ? [pause] : g.lastError ? [{ kind: "test", label: "Test", sourceId: g.id }, pause] : [collect, { kind: "test", label: "Test", sourceId: g.id }, pause], history: gatewayHistory(g) });
      continue;
    }
    const item = byItem.get(`gateway:${g.id}`);
    if (partner) rows.push({ id: `gateway:${g.id}`, name: g.name, kind, state: g.listings ? "waiting" : "needs_you", detail: g.listings ? `${g.listings.toLocaleString("en-IN")} listings uploaded, not live` : "Upload its list to go live", listings: g.listings, action: g.listings ? { kind: "activate", label: "Activate", sourceId: g.id } : { kind: "upload", label: "Upload list", sourceId: g.id }, more: g.listings ? [{ kind: "upload", label: "Upload again", sourceId: g.id }] : [], history: gatewayHistory(g) });
    else {
      // Didn't go live in the last day (a site that refuses us, or a test that found nothing): Import now leaves it out;
      // Try again here tries it on purpose.
      const f = failed.get(`gateway:${g.id}`);
      if (dismissed.has(`gateway:${g.id}`)) {
        rows.push({ id: `gateway:${g.id}`, name: g.name, kind, state: "off", detail: "Dismissed: Import never tries it.", listings: g.listings, action: { kind: "dismiss", label: "Restore", id: `gateway:${g.id}`, dismissed: false }, more: [{ kind: "test", label: "Test only", sourceId: g.id }], history: gatewayHistory(g) });
        continue;
      }
      rows.push({ id: `gateway:${g.id}`, name: g.name, kind, state: f ? "needs_you" : "waiting", detail: f ? blockedLine(f) : (item?.detail ?? "Added, not live"), listings: g.listings, termsPending: g.termsPending, action: { kind: "run", label: f ? "Try again" : "Test & activate", run: { kind: "activate", sourceId: g.id } }, more: [{ kind: "test", label: "Test only", sourceId: g.id }, ...(f ? [{ kind: "dismiss" as const, label: "Dismiss", id: `gateway:${g.id}`, dismissed: true }] : [])], history: gatewayHistory(g) });
    }
  }
  const order: ImportState[] = ["needs_you", "waiting", "down", "live", "off"];
  return rows.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.name.localeCompare(b.name));
}

function jobSummary(job: SetupJob | null): ImportJobView | null {
  if (!job) return null;
  if (job.finishedAt && Date.now() - Date.parse(job.finishedAt) > DAY) return null;
  const current = job.items.find((i) => i.status === "running");
  return {
    id: job.id,
    running: !job.finishedAt,
    ...(!job.finishedAt && (!job.leaseUntil || Date.now() - Date.parse(job.leaseUntil) > 120_000) ? { stalled: true as const } : {}),
    phase: job.finishedAt ? "done" : job.phase === "refreshing" ? "refreshing" : "setup",
    kind: job.kind ?? "import",
    ...(job.module ? { module: job.module } : {}),
    trigger: job.trigger ?? "admin",
    by: job.by,
    startedAt: job.createdAt,
    ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}),
    done: job.items.filter((i) => i.status === "live" || i.status === "failed").length,
    total: job.items.length,
    live: job.items.filter((i) => i.status === "live").length,
    failed: job.items.filter((i) => i.status === "failed").length,
    ...(current ? { current: { name: current.name, step: current.step, since: current.startedAt } } : {}),
    items: job.items.map((i) => ({ name: i.name, status: i.status, ...(i.step ? { step: i.step } : {}), ...(i.message ? { message: i.message } : {}), ...(i.valid != null ? { valid: i.valid } : {}) })),
    ...(job.stored ? { stored: job.stored } : {}),
  };
}

export async function importView(): Promise<ImportView> {
  const store = jobsLakeStore();
  const fortnight = new Date(Date.now() - MAX_POSTING_AGE_DAYS * DAY).toISOString();
  const [views, gw, todo, job, refresh, settings, cronRuns, inFind, runs, failed] = await Promise.all([
    listAllSourceViews(),
    gatewayOverview().catch(() => null),
    setupTodo(),
    readSetupJob().catch(() => null),
    lastGatewayRefresh().catch(() => null),
    loadScheduler(),
    listCronRuns(),
    Promise.all(MODULES.map(async (m) => [m.id, await store.countOpportunities({ sinceIso: fortnight, module: m.id }).catch(() => null)] as const)),
    listImportRuns().catch(() => [] as ImportRun[]),
    failedLately().catch(() => new Map<string, { at: string; step?: string; message?: string }>()),
  ]);
  const held = new Map((gw?.byModule ?? []).map((b) => [b.module, b.listings]));
  const found = new Map(inFind);
  const paused = new Set(settings.gateway.pausedModules);
  const modules: ImportModule[] = MODULES.map((m) => {
    const rows = moduleRows(m.id, views, gw?.sources ?? [], todo.items, failed, new Set(settings.gateway.dismissed));
    return {
      id: m.id,
      label: m.label,
      dataType: dataTypeOf(m.id).type,
      live: rows.filter((r) => r.state === "live" || r.state === "down").length,
      waiting: rows.filter((r) => r.state === "waiting").length,
      needsYou: rows.filter((r) => r.state === "needs_you").length,
      collected: held.get(m.id) ?? 0,
      inFind: found.get(m.id) ?? null,
      paused: paused.has(m.id),
      problems: rows.filter((r) => r.state === "down" || r.state === "needs_you").map((r) => `${r.name}: ${r.detail}`),
      rows,
    };
  });
  const enabled = (gw?.sources ?? []).filter((s) => s.enabled);
  const last = enabled.map((s) => s.lastSuccessAt).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const next = enabled.map((s) => s.nextRunAt).filter((x): x is string => !!x).sort()[0] ?? null;
  const counted = modules.filter((m) => m.inFind != null);
  return {
    generatedAt: new Date().toISOString(),
    gatewayConfigured: !!gw?.configured,
    pipeline: {
      sources: { live: modules.reduce((n, m) => n + m.live, 0), waiting: modules.reduce((n, m) => n + m.waiting, 0), needsYou: modules.reduce((n, m) => n + m.needsYou, 0) },
      collected: { listings: modules.reduce((n, m) => n + m.collected, 0), lastAt: last, nextAt: next },
      find: { listings: counted.length ? counted.reduce((n, m) => n + (m.inFind ?? 0), 0) : null, refreshedAt: refresh?.at ?? null, stored: refresh?.stored ?? {} },
    },
    schedule: { activateWaiting: settings.gateway.activateWaiting, cronSet: !!process.env.CRON_SECRET, pausedModules: settings.gateway.pausedModules },
    emails: { ...settings.importEmail, admins: parseEmailList(process.env.JOBSLAKE_ADMIN_EMAILS).length, mailbox: !!smtpConfig() },
    job: jobSummary(job),
    runs,
    lastRun: cronRuns.find((r) => r.job === "gateway-collect") ?? null,
    modules,
    recentRuns: (gw?.runs ?? []).slice(0, 30),
  };
}
