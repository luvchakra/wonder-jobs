/**
 * The budget of a paid source (one charged per result, like TheirStack): how many credits this calendar
 * month (UTC) has already spent, counted from the source's own recorded runs — one credit per job it
 * returned — and how many are left. A paid source runs only to top up a search the free sources left thin.
 */
import { monthlyCredits } from "@/server/jobs/theirstack";
import { jobsLakeStore } from "./store";

const BUDGETS: Record<string, () => number> = { theirstack: () => monthlyCredits() };

/** A search with fewer unique jobs than this after the free sources asks the paid ones. */
export function topUpBelow(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.PAID_SOURCES_TOPUP_BELOW ?? 15);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 15;
}

export const monthStart = (now: number) => {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};

export async function creditsLeft(sourceId: string, now = Date.now()): Promise<{ used: number; budget: number; left: number }> {
  const budget = BUDGETS[sourceId]?.() ?? 0;
  const runs = await jobsLakeStore().listRuns({ sourceId, sinceIso: monthStart(now), limit: 10_000 });
  const used = runs.reduce((n, r) => n + (r.retrieved || 0), 0);
  return { used, budget, left: Math.max(0, budget - used) };
}
