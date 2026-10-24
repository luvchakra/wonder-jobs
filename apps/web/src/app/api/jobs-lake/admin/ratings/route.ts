import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { json } from "@/server/jobslake/http";
import { companyStore } from "@/server/jobslake/companies";
import { ratingKeyStore } from "@/server/jobslake/ratingKeys";
import { RATINGS_TTL_MS } from "@/server/jobslake/ratingsJob";
import { RATINGS_FREQUENCIES, ratingsDue } from "@/domain/scheduler/settings";
import { listRatingRuns } from "@/server/jobslake/ratingRuns";
import { loadScheduler } from "@/server/scheduler/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The first 01:50 UTC (the daily tick) at or after `from`. */
function nextTick(from: Date): string {
  const t = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 1, 50));
  if (t.getTime() < from.getTime()) t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString();
}

/** The Explorium keys (masked, never the secret) in the order they're spent, and how many companies have ratings. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const [keys, coverage, settings, runs] = await Promise.all([ratingKeyStore().list(), companyStore().ratingsCoverage(new Date(Date.now() - RATINGS_TTL_MS).toISOString()), loadScheduler(), listRatingRuns()]);
  const last = runs.find((r) => r.trigger === "scheduled");
  // The cron ticks daily at 01:50 UTC; the next run is the first tick once the frequency has passed (or tomorrow's, if one is carrying on).
  const days = RATINGS_FREQUENCIES[settings.ratings.frequency].days;
  const nextRunAt = !settings.ratings.enabled ? undefined : nextTick(last && last.status !== "more" ? new Date(new Date(last.startedAt).getTime() + (days - 0.5) * 86_400_000) : new Date());
  return json({ keys, coverage, schedule: { ...settings.ratings, ...(nextRunAt ? { nextRunAt } : {}), ...(last ? { lastScheduledAt: last.startedAt } : {}), due: ratingsDue(settings.ratings.frequency, last, new Date()) }, runs: runs.slice(0, 50) });
}
