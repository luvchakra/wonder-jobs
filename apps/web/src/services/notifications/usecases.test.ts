/**
 * Notification use cases raised in the browser (docs: WonderJobs-notifications.xlsx, sheet "Test cases").
 * Each test is named by its use-case id so the sheet can point at it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const startRun = vi.fn((): never => {
  throw new Error("Another run is active");
});
vi.mock("@/services/workflow/service", () => ({ getWorkflowService: () => ({ startRun }) }));

import { useApplicationsStore } from "@/store/applications";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useWorkflowStore } from "@/store/workflow";
import type { CanonicalJob } from "@/domain/jobs/types";
import type { WorkflowRun } from "@/domain/workflow/types";
import { completedRunNotice, failedRunNotice, fallbackNotice, waitingNotice } from "@/services/workflow/runNotices";
import { schedulerTick, setReminderLeads, setScheduleOwner } from "@/services/scheduler";
import { reminderLeads } from "@/domain/notifications/admin";
import { DEFAULT_NOTIFY_PREFS } from "@/domain/notifications/prefs";
import { setBellChoices } from "@/store/bellChoices";

const HOUR = 3_600_000;
const job = { id: "job_1", title: "IAM Director", company: "Acme", postedAt: "2026-10-01T00:00:00Z", description: "" } as unknown as CanonicalJob;
const run = (over: Partial<WorkflowRun> & { strong?: number; found?: number; notify?: string; query?: string } = {}): WorkflowRun =>
  ({
    id: "run_1",
    trigger: "manual",
    status: "COMPLETED",
    silent: false,
    ...over,
    summary: { strongMatches: over.strong ?? 0, jobsRetained: over.found ?? 0 },
    config: { notify: over.notify ?? "strong_matches_only", searchCriteria: { query: over.query ?? "iam director" } },
  }) as unknown as WorkflowRun;
const nothing = (over: Parameters<typeof run>[0] = {}) => run({ status: "FAILED", error: { category: "user_action_required", message: "No jobs matched “barista”." } as never, ...over });

beforeEach(() => {
  useCareerStore.setState({ notifications: [], reminded: [] });
  useApplicationsStore.setState({ applications: {} });
  useJobsStore.setState({ jobs: { job_1: job }, saved: {}, closed: {}, order: ["job_1"] });
  useWorkflowStore.setState({ runs: {}, schedules: {}, workflows: {} });
  setReminderLeads(reminderLeads({ interviewLeadHours: 48, followUpLeadHours: 24 }));
  setScheduleOwner("server");
  setBellChoices(null);
});

describe("Find / searches", () => {
  it("N01 a search you started that finished tells the bell only when you left Find", () => {
    expect(completedRunNotice(run({ strong: 4, found: 30 }), false)).toBeNull();
    expect(completedRunNotice(run({ strong: 4, found: 30 }), true)).toMatchObject({ category: "strong_opportunity", title: "4 strong matches for “iam director”", action: "Review matches" });
    expect(completedRunNotice(run({ found: 12 }), true)).toMatchObject({ title: "12 jobs found for “iam director”", action: "See jobs" });
  });

  it("N02 a search that found nothing says so plainly — not as an error — and only when you left Find", () => {
    expect(failedRunNotice(nothing({ query: "barista" }), "No jobs matched", false)).toBeNull();
    expect(failedRunNotice(nothing({ query: "barista" }), "No jobs matched", true)).toMatchObject({ category: "workflow_completed", title: "Nothing found for “barista”" });
  });

  it("N03 a search that failed says it needs attention, blaming the provider only when it caused it", () => {
    const failed = run({ status: "FAILED", error: { category: "recoverable", message: "All sources failed", source: "anthropic" } as never });
    expect(failedRunNotice(failed, "All sources failed", false)).toMatchObject({ category: "provider_issue", title: "Run needs attention", body: "All sources failed", href: "/app/runs/run_1" });
    const ours = run({ status: "FAILED", error: { category: "recoverable", message: "x", source: "wonderjobs" } as never });
    expect(failedRunNotice(ours, "x", false)?.category).toBe("scheduled_run_failed");
  });

  it("N04 a run waiting on you asks for your input and links the run", () => {
    expect(waitingNotice(run(), "Pick the résumé to use")).toEqual({ category: "workflow_requires_input", title: "Wonder needs your input", body: "Pick the résumé to use", href: "/app/runs/run_1" });
  });

  it("N05 falling back to WonderJobs AI says why and points to AI settings", () => {
    expect(fallbackNotice("Your Anthropic key was refused.")).toMatchObject({ category: "provider_issue", title: "Switched to WonderJobs AI for one request", href: "/app/settings/ai" });
  });
});

describe("Scheduled searches (browser)", () => {
  it("N06 a scheduled search with strong matches notifies, unless it was silent", () => {
    expect(completedRunNotice(run({ trigger: "schedule", strong: 2 }), false)).toMatchObject({ category: "strong_opportunity", title: "2 new strong matches", href: "/app/jobs?fit=strong" });
    expect(completedRunNotice(run({ trigger: "schedule", strong: 2, silent: true }), false)).toBeNull();
  });

  it("N07 a scheduled search with nothing strong stays silent unless its Notify is always", () => {
    expect(completedRunNotice(run({ trigger: "schedule", found: 5 }), true)).toBeNull();
    expect(completedRunNotice(run({ trigger: "schedule", found: 5, notify: "always" }), false)).toMatchObject({ category: "workflow_completed", title: "Search finished" });
  });

  it("N08 a scheduled search that found nothing says so only when Notify is always", () => {
    expect(failedRunNotice(nothing({ trigger: "schedule" }), "", true)).toBeNull();
    expect(failedRunNotice(nothing({ trigger: "schedule", notify: "always" }), "", false)).toMatchObject({ category: "workflow_completed", title: "Nothing found for “iam director”" });
  });

  it("N10 a due schedule the tab can't start says so and points to schedules — and doesn't retry in a loop", () => {
    setScheduleOwner("browser");
    const at = Date.now() + 60_000;
    useWorkflowStore.setState({
      workflows: { wf_1: { id: "wf_1", name: "Daily", config: {}, stageKeys: [] } as never },
      schedules: { s_1: { id: "s_1", workflowId: "wf_1", name: "Daily", enabled: true, trigger: "schedule", frequency: "daily", days: [], time: "08:00", timezone: "Asia/Kolkata", nextRunAt: new Date(at - 1000).toISOString() } as never },
    });
    schedulerTick(at);
    schedulerTick(at);
    expect(useCareerStore.getState().notifications).toEqual([expect.objectContaining({ category: "scheduled_run_failed", title: "“Daily” could not start", body: "Another run is active", href: "/app/automation/scheduled" })]);
  });
});

describe("Reminders (browser)", () => {
  const withFollowUp = (kind: "interview" | "follow_up", dueInMs: number, now: number) => {
    const a = useApplicationsStore.getState().create("job_1", "interview");
    useApplicationsStore.setState({ applications: { [a.id]: { ...useApplicationsStore.getState().applications[a.id], followUps: [{ id: `f_${kind}`, applicationId: a.id, kind, dueAt: new Date(now + dueInMs).toISOString(), note: "Ask about next steps", done: false }] } } });
    useCareerStore.setState({ notifications: [] });
    return a.id;
  };

  it("N11 an interview within the platform's lead time is raised once, naming the employer", () => {
    const now = Date.now();
    withFollowUp("interview", 40 * HOUR, now);
    schedulerTick(now);
    schedulerTick(now);
    expect(useCareerStore.getState().notifications).toEqual([expect.objectContaining({ category: "interview_upcoming", title: "Interview coming up — Acme" })]);
  });

  it("N11 a shorter lead time set by the admin waits until it's inside it", () => {
    const now = Date.now();
    setReminderLeads(reminderLeads({ interviewLeadHours: 24, followUpLeadHours: 24 }));
    withFollowUp("interview", 40 * HOUR, now);
    schedulerTick(now);
    expect(useCareerStore.getState().notifications).toEqual([]);
  });

  it("N12 a follow-up due or overdue says which, with its note", () => {
    const now = Date.now();
    const id = withFollowUp("follow_up", -2 * HOUR, now);
    schedulerTick(now);
    expect(useCareerStore.getState().notifications).toEqual([expect.objectContaining({ category: "follow_up_due", title: "Follow-up overdue — Acme", body: "Ask about next steps", href: `/app/applications/${id}` })]);
  });
});

describe("Applications and saved jobs", () => {
  it("N13 “Applying to …” is marked read once the application is submitted", () => {
    const a = useApplicationsStore.getState().create("job_1", "preparing");
    useCareerStore.getState().notify({ category: "application_status", title: "Applying to Acme", body: "Opened on acme.com.", href: "/app/jobs/job_1/apply", action: "Mark submitted" });
    expect(useCareerStore.getState().notifications[0].read).toBe(false);
    useApplicationsStore.getState().setStatus(a.id, "submitted");
    expect(useCareerStore.getState().notifications.find((n) => n.title === "Applying to Acme")?.read).toBe(true);
  });

  it("N15 an application moving on raises one notification with its next step", () => {
    const a = useApplicationsStore.getState().create("job_1", "preparing");
    useApplicationsStore.getState().setStatus(a.id, "submitted");
    expect(useCareerStore.getState().notifications).toEqual([expect.objectContaining({ title: "Application submitted: Acme" })]);
  });

  it("N16 an AI draft raises one notification; the candidate's own edit doesn't", () => {
    const a = useApplicationsStore.getState().create("job_1", "preparing");
    useApplicationsStore.getState().addVersion(a.id, "cover_letter", { content: "x", provenance: "AI_GENERATED" } as never);
    useApplicationsStore.getState().addVersion(a.id, "cover_letter", { content: "y", provenance: "USER_MODIFIED" } as never);
    expect(useCareerStore.getState().notifications.map((n) => n.category)).toEqual(["materials_ready"]);
  });

  it("N17 a saved job that closes says so, once", () => {
    useJobsStore.setState({ saved: { job_1: "2026-10-09T00:00:00Z" } });
    useJobsStore.getState().markClosed("job_1", "Closed on acme.com");
    useJobsStore.getState().markClosed("job_1", "Closed on acme.com");
    expect(useCareerStore.getState().notifications).toEqual([expect.objectContaining({ title: "A saved job closed: Acme" })]);
  });
});

describe("In the bell, per kind (browser)", () => {
  it("B03 a kind the candidate keeps out of the bell isn't added in the open tab; other kinds are", () => {
    setBellChoices({ ...DEFAULT_NOTIFY_PREFS, applications: { bell: false, push: false, email: false } });
    const a = useApplicationsStore.getState().create("job_1", "preparing");
    useApplicationsStore.getState().setStatus(a.id, "submitted");
    expect(useCareerStore.getState().notifications).toEqual([]);
    useJobsStore.setState({ saved: { job_1: "2026-10-09T00:00:00Z" } });
    useJobsStore.getState().markClosed("job_1", "Closed on acme.com");
    expect(useCareerStore.getState().notifications.map((n) => n.category)).toEqual(["job_closed"]);
  });
});
