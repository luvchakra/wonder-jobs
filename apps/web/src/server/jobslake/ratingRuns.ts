/**
 * The ratings job's run history, kept under the platform tenant in the state store (like the scheduler's own run
 * log). One entry per run: a manual run's slices and a scheduled run's slices across days are merged into the entry
 * they belong to. Counts and masked key names only — never a key, never a tenant's data.
 */
import { randomBytes } from "node:crypto";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import type { RatingsRunReport, RetiredKey } from "./ratingsJob";

const KEY = "wj.ratingruns";
export const MAX_RATING_RUNS = 100;

export interface RatingRun {
  id: string;
  trigger: "manual" | "scheduled";
  /** The admin who clicked Run; absent for a scheduled run. */
  actor?: string;
  startedAt: string;
  updatedAt: string;
  /** How it ended; "more" while it still has companies and keys left (a scheduled run carries on at the next tick). */
  status: RatingsRunReport["status"];
  checked: number;
  rated: number;
  notFound: number;
  retired: RetiredKey[];
  notes: string[];
  /** Companies still waiting and keys on the list when it last stopped. */
  left: number;
  keysLeft: number;
  message: string;
  /** What was done about telling the owner (scheduled runs that ran out of keys). */
  email?: { to: string; sent: boolean; reason?: string };
}

export async function listRatingRuns(): Promise<RatingRun[]> {
  const doc = await stateStore.get(PLATFORM_TENANT, KEY).catch(() => undefined);
  const runs = (doc?.state as { runs?: RatingRun[] } | undefined)?.runs;
  return Array.isArray(runs) ? runs : [];
}

/** Adds a slice's report to the run it belongs to (a new entry when `id` is unknown). Never throws: a log write must not fail the job. */
export async function recordRatingSlice(
  p: { id?: string; trigger: RatingRun["trigger"]; actor?: string; report: RatingsRunReport; email?: RatingRun["email"]; now?: Date },
): Promise<RatingRun> {
  const at = (p.now ?? new Date()).toISOString();
  const { report } = p;
  try {
    const runs = await listRatingRuns();
    const prev = p.id ? runs.find((r) => r.id === p.id) : undefined;
    const run: RatingRun = {
      id: prev?.id ?? `rr_${randomBytes(6).toString("hex")}`,
      trigger: prev?.trigger ?? p.trigger,
      ...((prev?.actor ?? p.actor) ? { actor: prev?.actor ?? p.actor } : {}),
      startedAt: prev?.startedAt ?? at,
      updatedAt: at,
      status: report.status,
      checked: (prev?.checked ?? 0) + report.checked,
      rated: (prev?.rated ?? 0) + report.rated,
      notFound: (prev?.notFound ?? 0) + report.notFound,
      retired: [...(prev?.retired ?? []), ...report.retired],
      notes: [...new Set([...(prev?.notes ?? []), ...report.notes])],
      left: report.left,
      keysLeft: report.keysLeft,
      message: report.message,
      ...((p.email ?? prev?.email) ? { email: p.email ?? prev?.email } : {}),
    };
    await stateStore.put(PLATFORM_TENANT, KEY, { runs: [run, ...runs.filter((r) => r.id !== run.id)].slice(0, MAX_RATING_RUNS) });
    return run;
  } catch (e) {
    console.warn(`[ratings] could not record the run: ${e instanceof Error ? e.message : "unknown"}`);
    return { id: p.id ?? "unrecorded", trigger: p.trigger, startedAt: at, updatedAt: at, status: report.status, checked: report.checked, rated: report.rated, notFound: report.notFound, retired: report.retired, notes: report.notes, left: report.left, keysLeft: report.keysLeft, message: report.message };
  }
}
