/**
 * Admin → Data → Import (owner, 2026-11-02: "design the entire data import from sources to appearing in find in a way
 * so that it can be managed from one page"): the one read model behind that page. Three stages, for every module:
 *   Sources (live, waiting, needs you) → Collected (what the gateway holds) → In Find (what WorksLake stores).
 * Each module lists its sources as rows with one state and at most one action, so an admin sees in one place why a
 * module's listings are where they are. Never a secret.
 */
import { MAX_POSTING_AGE_DAYS } from "@/domain/jobs/age";
import { dataTypeOf } from "@/domain/jobslake/moduleData";
import type { CronRun } from "@/domain/scheduler/settings";
import { MODULES, type ModuleId } from "@/modules/registry";
import { gatewayOverview, type GatewayRunRow, type GatewaySourceRow } from "@/server/gateway/admin";
import { readSetupJob, type SetupJob } from "@/server/gateway/setupJob";
import { listCronRuns, loadScheduler } from "@/server/scheduler/store";
import { isGatewayBridge } from "./gatewaySources";
import { setupTodo, type SetupItem } from "./setup";
import { jobsLakeStore } from "./store";
import { listAllSourceViews, type SourceView } from "./views";
import { lastGatewayRefresh } from "./warm";

export type ImportState = "live" | "waiting" | "needs_you" | "down" | "off";

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
  action?:
    | { kind: "run"; label: string; run: NonNullable<SetupItem["run"]> }
    | { kind: "link"; label: string; href: string }
    | { kind: "decide"; label: string; decision: string }
    | { kind: "pause" | "activate"; label: string; sourceId: string }
    | { kind: "upload"; label: string; sourceId: string };
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
  rows: ImportRow[];
}

export interface ImportView {
  gatewayConfigured: boolean;
  pipeline: {
    sources: { live: number; waiting: number; needsYou: number };
    collected: { listings: number; lastAt: string | null; nextAt: string | null };
    find: { listings: number | null; refreshedAt: string | null; stored: Record<string, number> };
  };
  schedule: { activateWaiting: boolean; cronSet: boolean };
  /** The server job started by Import now (or the hourly run), while it runs or for a day after. */
  job: { running: boolean; done: number; total: number; trigger: string; finishedAt?: string; live: number; failed: { name: string; step?: string; message?: string }[] } | null;
  lastRun: CronRun | null;
  modules: ImportModule[];
  recentRuns: GatewayRunRow[];
}

const DAY = 86_400_000;
const liveStatus = (s: { status: string }) => s.status === "active" || s.status === "degraded";

/** Pure: a module's rows from its WorksLake sources, its gateway sources and its Setup items (exported for tests). */
export function moduleRows(mod: ModuleId, views: SourceView[], gateway: GatewaySourceRow[], items: SetupItem[]): ImportRow[] {
  const rows: ImportRow[] = [];
  const byItem = new Map(items.map((i) => [i.id, i]));
  // Owner decisions and catalogue sources not yet added: only the Setup list knows them.
  for (const i of items) {
    if (i.module !== mod && !(i.module === "all" && mod === "jobs")) continue;
    if (i.decision) rows.push({ id: i.id, name: i.name, kind: "Decision", state: "needs_you", detail: i.detail, action: { kind: "decide", label: "Mark decided", decision: i.id.replace(/^decision:/, "") } });
    else if (i.run?.kind === "add") rows.push({ id: i.id, name: i.name, kind: "Catalogue", state: "waiting", detail: i.detail, action: { kind: "run", label: "Add & activate", run: i.run } });
  }
  // WorksLake's own sources (the gateway bridges are automatic now, so they aren't listed).
  for (const v of views) {
    if ((v.module ?? "jobs") !== mod || isGatewayBridge(v.id)) continue;
    if (v.status === "do_not_use" || v.status === "disabled") continue;
    const item = byItem.get(v.id);
    const href = `/platform/jobs-lake/sources/${encodeURIComponent(v.id)}`;
    if (item) {
      const state: ImportState = item.need === "activate" ? "waiting" : "needs_you";
      rows.push({ id: v.id, name: v.name, kind: "WorksLake", state, detail: item.detail, termsPending: item.need === "terms", action: { kind: "link", label: item.action.label, href: item.action.href } });
      continue;
    }
    if (liveStatus(v)) rows.push({ id: v.id, name: v.name, kind: "WorksLake", state: v.health?.state === "down" ? "down" : "live", detail: v.health?.state === "down" ? "Down: its last runs failed" : v.statusLabel, action: { kind: "link", label: "Open", href } });
    else rows.push({ id: v.id, name: v.name, kind: "WorksLake", state: "off", detail: v.statusLabel, action: { kind: "link", label: "Open", href } });
  }
  // The gateway's sources for this module.
  for (const g of gateway) {
    if (!g.modules.includes(mod)) continue;
    const partner = g.kind === "upload";
    const kind = partner ? "Partner" : "Gateway";
    if (g.enabled) {
      const detail = g.lastError ? `Last run failed: ${g.lastError}` : `${g.listings ? `${g.listings.toLocaleString("en-IN")} listings` : "No listings yet"}${g.termsPending ? " · terms pending" : ""}`;
      rows.push({ id: `gateway:${g.id}`, name: g.name, kind, state: g.lastError ? "down" : "live", detail, listings: g.listings, termsPending: g.termsPending, action: partner ? { kind: "upload", label: "Upload list", sourceId: g.id } : { kind: "pause", label: "Pause", sourceId: g.id } });
      continue;
    }
    const item = byItem.get(`gateway:${g.id}`);
    if (partner) rows.push({ id: `gateway:${g.id}`, name: g.name, kind, state: g.listings ? "waiting" : "needs_you", detail: g.listings ? `${g.listings.toLocaleString("en-IN")} listings uploaded, not live` : "Upload its list to go live", listings: g.listings, action: g.listings ? { kind: "activate", label: "Activate", sourceId: g.id } : { kind: "upload", label: "Upload list", sourceId: g.id } });
    else rows.push({ id: `gateway:${g.id}`, name: g.name, kind, state: "waiting", detail: item?.detail ?? "Added, not live", listings: g.listings, termsPending: g.termsPending, action: { kind: "run", label: "Test & activate", run: { kind: "activate", sourceId: g.id } } });
  }
  const order: ImportState[] = ["needs_you", "waiting", "down", "live", "off"];
  return rows.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.name.localeCompare(b.name));
}

function jobSummary(job: SetupJob | null): ImportView["job"] {
  if (!job) return null;
  if (job.finishedAt && Date.now() - Date.parse(job.finishedAt) > DAY) return null;
  const done = job.items.filter((i) => i.status === "live" || i.status === "failed");
  return {
    running: !job.finishedAt,
    done: done.length,
    total: job.items.length,
    trigger: job.trigger ?? "admin",
    ...(job.finishedAt ? { finishedAt: job.finishedAt } : {}),
    live: job.items.filter((i) => i.status === "live").length,
    failed: job.items.filter((i) => i.status === "failed").map((i) => ({ name: i.name, step: i.step, message: i.message })),
  };
}

export async function importView(): Promise<ImportView> {
  const store = jobsLakeStore();
  const fortnight = new Date(Date.now() - MAX_POSTING_AGE_DAYS * DAY).toISOString();
  const [views, gw, todo, job, refresh, settings, cronRuns, inFind] = await Promise.all([
    listAllSourceViews(),
    gatewayOverview().catch(() => null),
    setupTodo(),
    readSetupJob().catch(() => null),
    lastGatewayRefresh().catch(() => null),
    loadScheduler(),
    listCronRuns(),
    Promise.all(MODULES.map(async (m) => [m.id, await store.countOpportunities({ sinceIso: fortnight, module: m.id }).catch(() => null)] as const)),
  ]);
  const held = new Map((gw?.byModule ?? []).map((b) => [b.module, b.listings]));
  const found = new Map(inFind);
  const modules: ImportModule[] = MODULES.map((m) => {
    const rows = moduleRows(m.id, views, gw?.sources ?? [], todo.items);
    return {
      id: m.id,
      label: m.label,
      dataType: dataTypeOf(m.id).type,
      live: rows.filter((r) => r.state === "live" || r.state === "down").length,
      waiting: rows.filter((r) => r.state === "waiting").length,
      needsYou: rows.filter((r) => r.state === "needs_you").length,
      collected: held.get(m.id) ?? 0,
      inFind: found.get(m.id) ?? null,
      rows,
    };
  });
  const enabled = (gw?.sources ?? []).filter((s) => s.enabled);
  const last = enabled.map((s) => s.lastSuccessAt).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const next = enabled.map((s) => s.nextRunAt).filter((x): x is string => !!x).sort()[0] ?? null;
  const counted = modules.filter((m) => m.inFind != null);
  return {
    gatewayConfigured: !!gw?.configured,
    pipeline: {
      sources: { live: modules.reduce((n, m) => n + m.live, 0), waiting: modules.reduce((n, m) => n + m.waiting, 0), needsYou: modules.reduce((n, m) => n + m.needsYou, 0) },
      collected: { listings: modules.reduce((n, m) => n + m.collected, 0), lastAt: last, nextAt: next },
      find: { listings: counted.length ? counted.reduce((n, m) => n + (m.inFind ?? 0), 0) : null, refreshedAt: refresh?.at ?? null, stored: refresh?.stored ?? {} },
    },
    schedule: { activateWaiting: settings.gateway.activateWaiting, cronSet: !!process.env.CRON_SECRET },
    job: jobSummary(job),
    lastRun: cronRuns.find((r) => r.job === "gateway-collect") ?? null,
    modules,
    recentRuns: (gw?.runs ?? []).slice(0, 30),
  };
}
