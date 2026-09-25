/**
 * Source health, coverage and alerts — computed only from recorded runs (spec §43, §52). A source
 * with no runs has no health yet, and says so; nothing here fabricates a percentage.
 */
import type { SourceOutcome } from "./protocol";

export interface SourceRun {
  id: string;
  sourceId: string;
  /** What started it: a candidate search, an admin test/playground search, or a scheduled refresh. */
  trigger: "search" | "test" | "playground" | "refresh";
  requestId?: string;
  startedAt: string;
  durationMs: number;
  outcome: SourceOutcome;
  retrieved: number;
  /** Records that passed the protocol validator. */
  valid: number;
  duplicates: number;
  errorCode?: string;
  message?: string;
}

export type HealthState = "healthy" | "degraded" | "down" | "no_data";

export const HEALTH_LABEL: Record<HealthState, string> = { healthy: "Healthy", degraded: "Degraded", down: "Down", no_data: "No data yet" };

export interface SourceHealth {
  sourceId: string;
  state: HealthState;
  runs: number;
  /** Share of runs that reached the source and got a valid answer (empty counts as success). */
  successRate: number | null;
  p50LatencyMs: number | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  retrieved: number;
  valid: number;
  duplicates: number;
  failures: { timeout: number; unavailable: number; needs_setup: number };
}

const COUNTED: SourceOutcome[] = ["ok", "empty", "timeout", "unavailable"];
const SUCCESS: SourceOutcome[] = ["ok", "empty"];

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function summarizeHealth(sourceId: string, runs: SourceRun[]): SourceHealth {
  const mine = runs.filter((r) => r.sourceId === sourceId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const counted = mine.filter((r) => COUNTED.includes(r.outcome));
  const ok = counted.filter((r) => SUCCESS.includes(r.outcome));
  const successRate = counted.length ? ok.length / counted.length : null;
  const p50 = median(ok.map((r) => r.durationMs));
  // Down = the last two attempts both failed; one failure is noise, two in a row is an outage.
  const recent = counted.slice(0, 2);
  let state: HealthState = "no_data";
  if (counted.length) {
    if (recent.length >= 2 && recent.every((r) => !SUCCESS.includes(r.outcome))) state = "down";
    else if ((successRate ?? 1) < 0.9 || (p50 ?? 0) > 4000) state = "degraded";
    else state = "healthy";
  }
  return {
    sourceId,
    state,
    runs: mine.length,
    successRate,
    p50LatencyMs: p50,
    lastRunAt: mine[0]?.startedAt ?? null,
    lastSuccessAt: ok[0]?.startedAt ?? null,
    retrieved: mine.reduce((n, r) => n + r.retrieved, 0),
    valid: mine.reduce((n, r) => n + r.valid, 0),
    duplicates: mine.reduce((n, r) => n + r.duplicates, 0),
    failures: {
      timeout: mine.filter((r) => r.outcome === "timeout").length,
      unavailable: mine.filter((r) => r.outcome === "unavailable").length,
      needs_setup: mine.filter((r) => r.outcome === "needs_setup").length,
    },
  };
}

/* ---------------------------------------------------------------- alerts */

export type AlertKind = "source_unavailable" | "authentication" | "repeated_failures" | "yield_dropped" | "latency" | "duplicate_rate";

export interface Alert {
  id: string;
  sourceId: string;
  kind: AlertKind;
  severity: "warning" | "critical";
  title: string;
  detail: string;
  since: string;
}

/** Alerts are derived, not stored: they appear while the condition holds and clear when it doesn't. */
export function deriveAlerts(sourceId: string, sourceName: string, runs: SourceRun[]): Alert[] {
  const mine = runs.filter((r) => r.sourceId === sourceId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const out: Alert[] = [];
  const add = (kind: AlertKind, severity: Alert["severity"], title: string, detail: string, since: string) => out.push({ id: `${sourceId}:${kind}`, sourceId, kind, severity, title, detail, since });
  const counted = mine.filter((r) => COUNTED.includes(r.outcome));
  const streak: SourceRun[] = [];
  for (const r of counted) {
    if (SUCCESS.includes(r.outcome)) break;
    streak.push(r);
  }
  if (streak.length >= 3) add("repeated_failures", "critical", `${sourceName} is repeatedly failing`, `The last ${streak.length} runs failed (${streak[0].message ?? streak[0].outcome}).`, streak[streak.length - 1].startedAt);
  else if (counted[0] && !SUCCESS.includes(counted[0].outcome)) add("source_unavailable", "warning", `${sourceName} didn't respond on its last run`, counted[0].message ?? counted[0].outcome, counted[0].startedAt);
  if (mine[0]?.outcome === "needs_setup") add("authentication", "warning", `${sourceName} needs credentials`, "The source can't be searched until its credentials are set.", mine[0].startedAt);
  const oks = counted.filter((r) => r.outcome === "ok" || r.outcome === "empty");
  if (oks.length >= 4 && oks[0].retrieved === 0) {
    const before = median(oks.slice(1, 6).map((r) => r.retrieved)) ?? 0;
    if (before >= 10) add("yield_dropped", "warning", `${sourceName} returned nothing`, `Its last run found 0 jobs; recent runs found about ${before}. The source may have changed its response.`, oks[0].startedAt);
  }
  const p50 = median(oks.slice(0, 10).map((r) => r.durationMs));
  if (p50 != null && p50 > 8000) add("latency", "warning", `${sourceName} is slow`, `Median response ${Math.round(p50 / 100) / 10}s over recent runs.`, oks[0].startedAt);
  const recentRetrieved = oks.slice(0, 5).reduce((n, r) => n + r.valid, 0);
  const recentDupes = oks.slice(0, 5).reduce((n, r) => n + r.duplicates, 0);
  if (recentRetrieved >= 50 && recentDupes / recentRetrieved > 0.6) add("duplicate_rate", "warning", `${sourceName} is mostly duplicates`, `${Math.round((recentDupes / recentRetrieved) * 100)}% of its recent results were already found on stronger sources.`, oks[0].startedAt);
  return out;
}
