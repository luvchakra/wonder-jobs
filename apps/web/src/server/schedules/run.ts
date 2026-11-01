import { afterRun, isScheduleDue, MODULE_SCHEDULES_CAP, nextRunAt, runStateFor, type ModuleSchedule, type ScheduleRunState } from "@/domain/moduleSchedules";
import { readClientState } from "@/server/clientState";
import { deliver } from "@/server/notifications/deliver";
import { stateStore } from "@/server/state";
import { MODULE_LABELS } from "./labels";
import { MODULE_SEARCHES } from "./searches";

const RUNS = "wj.schedruns" as const;
/** At most this many schedules run for one person in one cron pass; the rest are still due next pass. */
const PER_TENANT = 3;

type RunsDoc = { runs: Record<string, ScheduleRunState> };

async function readRuns(tenantId: string): Promise<RunsDoc> {
  const doc = (await stateStore.get(tenantId, RUNS))?.state as Partial<RunsDoc> | undefined;
  return { runs: doc?.runs ?? {} };
}

/** The person's schedules, as their synced store holds them (only well-formed ones, capped). */
async function readSchedules(tenantId: string): Promise<ModuleSchedule[]> {
  const doc = await readClientState<{ schedules?: ModuleSchedule[] }>(tenantId, "wj.m.schedules");
  return (doc?.schedules ?? []).filter((s) => s && typeof s.id === "string" && typeof s.module === "string" && MODULE_SEARCHES[s.module]).slice(0, MODULE_SCHEDULES_CAP);
}

export interface ModuleScheduleReport {
  tenantId: string;
  ran: number;
  notified: number;
  failed: number;
}

/**
 * Runs a person's due module searches: each through its module's own search, then compares with what it saw before.
 * The first run only learns what's there; later runs notify only when there are listings it hadn't seen (bell, then
 * push and email as the person chose for "Search results"). A failed search is recorded and tried again next time.
 */
export async function runDueModuleSchedules(tenantId: string, now = new Date(), earlyMs = 0): Promise<ModuleScheduleReport> {
  const [schedules, stored] = await Promise.all([readSchedules(tenantId), readRuns(tenantId)]);
  const runs: Record<string, ScheduleRunState> = {};
  for (const s of schedules) runs[s.id] = runStateFor(s, stored.runs[s.id], now);
  const report: ModuleScheduleReport = { tenantId, ran: 0, notified: 0, failed: 0 };
  for (const s of schedules) {
    if (report.ran >= PER_TENANT) break;
    const r = runs[s.id];
    if (!isScheduleDue(s, r, now, earlyMs)) continue;
    report.ran++;
    const next = nextRunAt(s, now);
    try {
      const res = await MODULE_SEARCHES[s.module](tenantId, { query: s.query, places: s.places });
      const ids = res.results.map((x) => x.id);
      const { fresh, seen } = afterRun(r.seen, ids);
      const counted = r.primed ? fresh.length : 0;
      runs[s.id] = { ...r, nextRunAt: next, lastRunAt: now.toISOString(), last: { found: ids.length, fresh: counted }, seen, primed: true };
      if (counted > 0) {
        const label = MODULE_LABELS[s.module] ?? s.module;
        const what = s.query ? `“${s.query}”` : "the latest";
        const where = s.places.length ? ` in ${s.places.join(", ")}` : "";
        await deliver(tenantId, { category: "workflow_completed", module: s.module, title: `${counted} new in ${label}`, body: `Your scheduled search for ${what}${where} found ${counted} listing${counted === 1 ? "" : "s"} that weren't there before.`, href: `/app/m/${s.module}`, action: "See them" }, { email: { key: `msched:${s.id}:${now.toISOString().slice(0, 10)}` } }, now);
        report.notified++;
      }
    } catch (e) {
      report.failed++;
      runs[s.id] = { ...r, nextRunAt: next, lastRunAt: now.toISOString(), last: { found: 0, fresh: 0, error: "The search couldn't run; it tries again next time." } };
      console.warn(`[schedules] ${s.module} search failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  // Keep state only for schedules that still exist; write only when something changed.
  const changed = JSON.stringify(runs) !== JSON.stringify(Object.fromEntries(Object.keys(runs).map((k) => [k, stored.runs[k]])));
  if (changed || Object.keys(stored.runs).length !== Object.keys(runs).length) await stateStore.put(tenantId, RUNS, { runs });
  return report;
}

/** Every person with module schedules: their due ones run, until the deadline. */
export async function runModuleSchedulePass(now: Date, limit: number, deadline: number, earlyMs = 0): Promise<{ tenants: number; ran: number; notified: number; failures: { tenantId: string; error: string }[] }> {
  const out = { tenants: 0, ran: 0, notified: 0, failures: [] as { tenantId: string; error: string }[] };
  for (const tenantId of await stateStore.listTenants("wj.m.schedules", limit)) {
    if (Date.now() > deadline) break;
    try {
      const r = await runDueModuleSchedules(tenantId, now, earlyMs);
      if (r.ran) out.tenants++;
      out.ran += r.ran;
      out.notified += r.notified;
    } catch (e) {
      out.failures.push({ tenantId, error: `module schedules: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return out;
}

/** What the Automation page shows for each schedule: when it runs next and what it last found. Never the seen ids. */
export async function moduleScheduleStatus(tenantId: string, now = new Date()): Promise<Record<string, Omit<ScheduleRunState, "seen" | "key">>> {
  const [schedules, stored] = await Promise.all([readSchedules(tenantId), readRuns(tenantId)]);
  return Object.fromEntries(
    schedules.map((s) => {
      const r = runStateFor(s, stored.runs[s.id], now);
      return [s.id, { nextRunAt: r.nextRunAt, lastRunAt: r.lastRunAt, last: r.last, primed: r.primed }];
    }),
  );
}
