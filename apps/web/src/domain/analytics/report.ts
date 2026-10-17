/**
 * The candidate's own analytics (Analytics): computed only from their applications, the jobs they found
 * and the searches they ran — never a sample or an estimate. A number that can't be computed (no
 * submissions yet, no response yet) is null, and the page says so rather than showing a zero.
 */
import type { Application } from "@/domain/applications/types";
import type { CanonicalJob, JobMatch } from "@/domain/jobs/types";
import type { WorkflowRun } from "@/domain/workflow/types";

const DAY = 86_400_000;
const WEEK = 7 * DAY;

const SUBMITTED = new Set(["submitted", "under_review", "interview", "offer", "rejected", "withdrawn", "unknown"]);
const RESPONSE_EVENTS = new Set(["recruiter_response", "interview", "outcome"]);

export interface WeekBucket {
  /** Monday of the week (UTC), ISO date. */
  week: string;
  started: number;
  submitted: number;
  searches: number;
}

export interface AnalyticsReport {
  totals: { applications: number; submitted: number; interviews: number; offers: number; saved: number; searches: number; jobsFound: number };
  /** Of the applications submitted, the share that heard back (a reply, an interview or an outcome); null with none submitted. */
  responseRate: number | null;
  /** Median days from submitting to the first reply; null until a reply arrives. */
  medianDaysToResponse: number | null;
  funnel: { label: string; n: number; ofPrevious: number | null }[];
  weeks: WeekBucket[];
  /** How well the jobs applied to fit the profile (the match at the time). */
  appliedFit: { strong: number; worth_considering: number; stretch: number; low_fit: number; unknown: number };
  /** Where the applied-to jobs were found (by source name), most first. */
  sources: { name: string; n: number }[];
}

const mondayOf = (t: number) => {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
};

function submittedAt(a: Application): number | undefined {
  const t = a.appliedAt ?? a.events.find((e) => e.type === "submitted")?.at;
  return t ? Date.parse(t) : undefined;
}

export function analyticsReport(input: { applications: Application[]; jobs: Record<string, CanonicalJob>; matches: Record<string, JobMatch>; saved: Record<string, string>; runs: WorkflowRun[]; now?: number; weeks?: number; sourceName?: (id: string) => string }): AnalyticsReport {
  const now = input.now ?? Date.now();
  const apps = input.applications;
  const done = input.runs.filter((r) => r.status === "COMPLETED" || r.status === "COMPLETED_WITH_WARNINGS");
  const submitted = apps.filter((a) => SUBMITTED.has(a.status));

  // Response: any reply, interview or outcome event after it was submitted.
  const responseDays: number[] = [];
  let responded = 0;
  for (const a of submitted) {
    const sent = submittedAt(a);
    const first = a.events.filter((e) => RESPONSE_EVENTS.has(e.type) && (!sent || Date.parse(e.at) >= sent)).sort((x, y) => x.at.localeCompare(y.at))[0];
    if (!first && !["interview", "offer", "rejected"].includes(a.status)) continue;
    responded++;
    if (first && sent) responseDays.push((Date.parse(first.at) - sent) / DAY);
  }
  responseDays.sort((x, y) => x - y);
  const median = responseDays.length ? responseDays[Math.floor((responseDays.length - 1) / 2)] : null;

  const reached = (statuses: string[] | null) => (statuses ? apps.filter((a) => statuses.includes(a.status)).length : apps.length);
  const stages: [string, string[] | null][] = [
    ["Started", null],
    ["Prepared", ["ready_for_review", "submitted", "under_review", "interview", "offer", "rejected", "withdrawn"]],
    ["Submitted", ["submitted", "under_review", "interview", "offer", "rejected", "withdrawn"]],
    ["Interview", ["interview", "offer"]],
    ["Offer", ["offer"]],
  ];
  const counts = stages.map(([, s]) => reached(s));
  const funnel = stages.map(([label], i) => ({ label, n: counts[i], ofPrevious: i && counts[i - 1] ? counts[i] / counts[i - 1] : null }));

  // The last N weeks, oldest first.
  const n = input.weeks ?? 8;
  const thisWeek = mondayOf(now);
  const weeks: WeekBucket[] = Array.from({ length: n }, (_, i) => ({ week: new Date(thisWeek - (n - 1 - i) * WEEK).toISOString().slice(0, 10), started: 0, submitted: 0, searches: 0 }));
  const bucket = (t: number | undefined) => {
    if (t === undefined || !Number.isFinite(t)) return undefined;
    const i = n - 1 - Math.round((thisWeek - mondayOf(t)) / WEEK);
    return i >= 0 && i < n ? weeks[i] : undefined;
  };
  for (const a of apps) {
    const b = bucket(Date.parse(a.createdAt));
    if (b) b.started++;
    if (SUBMITTED.has(a.status)) {
      const s = bucket(submittedAt(a));
      if (s) s.submitted++;
    }
  }
  for (const r of done) {
    const b = bucket(Date.parse(r.createdAt));
    if (b) b.searches++;
  }

  const appliedFit = { strong: 0, worth_considering: 0, stretch: 0, low_fit: 0, unknown: 0 };
  const sourceCount = new Map<string, number>();
  for (const a of submitted) {
    const fit = input.matches[a.jobId]?.fit;
    appliedFit[fit ?? "unknown"]++;
    // Named as the job cards name them: JobsLake's sightings first, else the source list.
    const job = input.jobs[a.jobId];
    const names = job?.lake?.sightings.length ? job.lake.sightings.map((x) => x.sourceName) : (job?.sourceIds ?? []).map((id) => input.sourceName?.(id) ?? id);
    for (const name of new Set(names)) sourceCount.set(name, (sourceCount.get(name) ?? 0) + 1);
  }

  return {
    totals: {
      applications: apps.length,
      submitted: submitted.length,
      interviews: apps.filter((a) => a.status === "interview" || a.status === "offer").length,
      offers: apps.filter((a) => a.status === "offer").length,
      saved: Object.keys(input.saved).length,
      searches: done.length,
      jobsFound: done.reduce((s, r) => s + (r.summary?.jobsDiscovered ?? 0), 0),
    },
    responseRate: submitted.length ? responded / submitted.length : null,
    medianDaysToResponse: median === null ? null : Math.round(median * 10) / 10,
    funnel,
    weeks,
    appliedFit,
    sources: [...sourceCount.entries()].sort((x, y) => y[1] - x[1]).map(([name, n]) => ({ name, n })),
  };
}
