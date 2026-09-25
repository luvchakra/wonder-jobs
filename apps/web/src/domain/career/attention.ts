import type { CanonicalJob, JobMatch, JobQuality } from "@/domain/jobs/types";
import type { Application } from "@/domain/applications/types";
import type { WorkflowRun, WorkflowSchedule } from "@/domain/workflow/types";
import { isActive, isTerminal } from "@/domain/workflow/status";
import type { CareerDNA } from "./types";
import type { LearnedSignal } from "./learning";

const DAY_MS = 86_400_000;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/**
 * One real line describing a finished run's actual counts — never a template with invented
 * numbers. `jobsDiscovered`/`jobsRetained`/`strongMatches` are the same fields the run detail
 * page and `describeOutcome` read, so this can never disagree with them.
 */
export function describeRunActivity(run: WorkflowRun): string {
  const s = run.summary;
  const verb = run.status === "STOPPED" ? "stopped" : run.status === "CANCELLED" ? "cancelled" : "completed";
  if (run.silent) return `${run.workflowName} ${verb} — quiet, nothing worth reporting this time.`;
  const duplicatesRemoved = Math.max(0, s.jobsDiscovered - s.jobsRetained);
  return `${run.workflowName} ${verb} — ${plural(s.jobsDiscovered, "job")} discovered, ${plural(duplicatesRemoved, "duplicate")} removed, ${plural(s.jobsRetained, "job")} matched, ${plural(s.strongMatches, "role")} worth reviewing.`;
}

export type ApplicationAttentionReason = "follow_up_overdue" | "follow_up_due" | "interview_soon" | "ready_for_review" | "employer_response";

export interface ApplicationAttentionItem {
  applicationId: string;
  jobId: string;
  reason: ApplicationAttentionReason;
  label: string;
  dueAt?: string;
}

/**
 * What a candidate needs to act on across their applications — real due follow-ups, upcoming
 * interviews, materials ready for review, and recent employer responses. Shared by Home and the
 * Applications page so "needs attention" can never mean two different things in two places.
 */
export function computeApplicationAttention(applications: Record<string, Application>, now: number): ApplicationAttentionItem[] {
  const items: ApplicationAttentionItem[] = [];
  for (const app of Object.values(applications)) {
    for (const f of app.followUps) {
      if (f.done) continue;
      const due = new Date(f.dueAt).getTime();
      if (f.kind === "follow_up" && due - now < 2 * DAY_MS) {
        items.push({ applicationId: app.id, jobId: app.jobId, reason: due < now ? "follow_up_overdue" : "follow_up_due", label: due < now ? "Follow-up overdue" : "Follow-up due soon", dueAt: f.dueAt });
      }
      if (f.kind === "interview" && due - now < 2 * DAY_MS) {
        items.push({ applicationId: app.id, jobId: app.jobId, reason: "interview_soon", label: "Interview coming up", dueAt: f.dueAt });
      }
    }
    if (app.status === "ready_for_review") {
      items.push({ applicationId: app.id, jobId: app.jobId, reason: "ready_for_review", label: "Materials ready for your review" });
    }
    const lastEvent = app.events[app.events.length - 1];
    if (lastEvent && (lastEvent.type === "recruiter_response" || lastEvent.type === "outcome") && now - new Date(lastEvent.at).getTime() < 5 * DAY_MS) {
      items.push({ applicationId: app.id, jobId: app.jobId, reason: "employer_response", label: lastEvent.title });
    }
  }
  items.sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
  return items;
}

export interface CareerActionItem {
  id: string;
  label: string;
  href: string;
}

export interface HomeAttention {
  /** Job ids Wonder believes deserve review — real fit, not yet acted on. Ranked, capped. */
  opportunities: string[];
  applicationAttention: ApplicationAttentionItem[];
  careerActions: CareerActionItem[];
  /** The most recent finished run's real summary, in plain words. Null if Wonder has never run. */
  recentRunLine: string | null;
  hasActiveRun: boolean;
  /** True only when a real enabled schedule exists — never claim Wonder is "watching" when nothing is scheduled. */
  isMonitoring: boolean;
  hasAnythingToShow: boolean;
}

export function computeHomeAttention(params: {
  now: number;
  jobs: Record<string, CanonicalJob>;
  order: string[];
  matches: Record<string, JobMatch>;
  quality: Record<string, JobQuality>;
  saved: Record<string, string>;
  rejected: Record<string, string>;
  applications: Record<string, Application>;
  dna: CareerDNA;
  learnedSignals: LearnedSignal[];
  runs: Record<string, WorkflowRun>;
  schedules: Record<string, WorkflowSchedule>;
}): HomeAttention {
  const { now, matches, rejected, applications, dna, learnedSignals, runs } = params;
  const appByJob = new Map(Object.values(applications).map((a) => [a.jobId, a]));

  const opportunities = params.order
    .filter((id) => {
      const m = matches[id];
      if (!m || rejected[id]) return false;
      if (m.fit !== "strong" && m.fit !== "worth_considering") return false;
      const app = appByJob.get(id);
      return !app || app.status === "saved";
    })
    .sort((a, b) => matches[b].score - matches[a].score)
    .slice(0, 6);

  const applicationAttention = computeApplicationAttention(applications, now);

  const careerActions: CareerActionItem[] = [];
  if (!dna.careerGoal.trim()) careerActions.push({ id: "goal", label: "Add your career goal so Wonder knows what to search for", href: "/app/career-dna" });
  if (dna.skills.length === 0) careerActions.push({ id: "skills", label: "Add your skills to improve match accuracy", href: "/app/career-dna" });
  if (learnedSignals.some((s) => s.status === "suggested")) {
    careerActions.push({ id: "learned", label: "Wonder noticed a pattern in what you're rejecting — review it", href: "/app/career-dna" });
  }

  const finishedRuns = Object.values(runs)
    .filter((r) => isTerminal(r.status) && r.status !== "CANCELLED")
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
  const recentRunLine = finishedRuns[0] ? describeRunActivity(finishedRuns[0]) : null;
  const hasActiveRun = Object.values(runs).some((r) => isActive(r.status));
  const isMonitoring = Object.values(params.schedules).some((s) => s.enabled);

  const hasAnythingToShow = opportunities.length > 0 || applicationAttention.length > 0 || careerActions.length > 0 || hasActiveRun;

  return { opportunities, applicationAttention, careerActions, recentRunLine, hasActiveRun, isMonitoring, hasAnythingToShow };
}

export interface ProgressSummary {
  /** Applications with an employer and not concluded (submitted, under review, interviewing, unknown). */
  active: number;
  interviewsThisWeek: number;
  followUpsDue: number;
  /** Applications whose latest event is an employer reply or outcome from the last 7 days. */
  employerReplies: number;
}

/** "What is moving forward?" (outcome spec §17) — counted from real application state only. */
export function computeProgressSummary(applications: Record<string, Application>, now: number): ProgressSummary {
  let active = 0;
  let interviewsThisWeek = 0;
  let followUpsDue = 0;
  let employerReplies = 0;
  for (const app of Object.values(applications)) {
    if (["submitted", "under_review", "interview", "unknown"].includes(app.status)) active++;
    for (const f of app.followUps) {
      if (f.done) continue;
      const due = new Date(f.dueAt).getTime();
      if (f.kind === "interview" && due >= now - DAY_MS && due - now < 7 * DAY_MS) interviewsThisWeek++;
      if (f.kind === "follow_up" && due - now < 2 * DAY_MS) followUpsDue++;
    }
    const last = app.events[app.events.length - 1];
    if (last && (last.type === "recruiter_response" || last.type === "outcome") && now - new Date(last.at).getTime() < 7 * DAY_MS) employerReplies++;
  }
  return { active, interviewsThisWeek, followUpsDue, employerReplies };
}

/** The soonest enabled, time-triggered scheduled search — the only basis for saying "Wonder is working". */
export function nextScheduledSearch(schedules: Record<string, WorkflowSchedule>): WorkflowSchedule | undefined {
  return Object.values(schedules)
    .filter((s) => s.enabled && s.trigger === "schedule" && s.nextRunAt)
    .sort((a, b) => a.nextRunAt!.localeCompare(b.nextRunAt!))[0];
}
