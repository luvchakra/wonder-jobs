import { beforeEach, describe, expect, it } from "vitest";
import type { Application } from "@/domain/applications/types";
import type { CanonicalJob } from "@/domain/jobs/types";
import { EMPTY_DNA } from "@/domain/career/types";
import { stateStore } from "@/server/state";
import { readClientState, writeClientState } from "@/server/clientState";
import { PERSIST_VERSION, type CareerDoc } from "./snapshot";
import { isDueForReminder, raiseDueReminders } from "./reminders";

const TENANT = "reminders-tenant";
const NOW = new Date("2026-04-15T09:00:00.000Z");
const DAY = 86_400_000;
const at = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY).toISOString();

function application(over: Partial<Application> = {}): Application {
  return {
    id: "app-1",
    jobId: "job-1",
    status: "submitted",
    createdAt: at(-10),
    artifacts: [],
    events: [],
    followUps: [],
    submissionKey: "key-1",
    ...over,
  };
}

async function seed(app: Application, career: Partial<CareerDoc & { reminded: string[] }> = {}) {
  await writeClientState(TENANT, "wj.applications", 1, { applications: { [app.id]: app } });
  await writeClientState(TENANT, "wj.jobs", PERSIST_VERSION.jobs, { jobs: { "job-1": { id: "job-1", title: "Senior Product Manager", company: "PayCircle" } as CanonicalJob } });
  await writeClientState<CareerDoc & { reminded: string[] }>(TENANT, "wj.career", PERSIST_VERSION.career, { dna: EMPTY_DNA, onboarded: true, activity: [], notifications: [], reminded: [], ...career });
}

describe("isDueForReminder", () => {
  const now = NOW.getTime();
  it("gives an interview two days' notice and a follow-up one", () => {
    expect(isDueForReminder({ dueAt: at(1.5), done: false, kind: "interview" }, now)).toBe(true);
    expect(isDueForReminder({ dueAt: at(1.5), done: false, kind: "follow_up" }, now)).toBe(false);
    expect(isDueForReminder({ dueAt: at(0.5), done: false, kind: "follow_up" }, now)).toBe(true);
  });

  it("still mentions something a day overdue, but not a week", () => {
    expect(isDueForReminder({ dueAt: at(-0.5), done: false, kind: "follow_up" }, now)).toBe(true);
    expect(isDueForReminder({ dueAt: at(-7), done: false, kind: "follow_up" }, now)).toBe(false);
  });

  it("says nothing about work already done", () => {
    expect(isDueForReminder({ dueAt: at(0.5), done: true, kind: "follow_up" }, now)).toBe(false);
  });
});

describe("raiseDueReminders", () => {
  beforeEach(async () => {
    for (const store of ["wj.applications", "wj.jobs", "wj.career"] as const) await stateStore.remove(TENANT, store);
  });

  it("says nothing when there is nothing due", async () => {
    await seed(application({ followUps: [{ id: "f1", applicationId: "app-1", dueAt: at(30), kind: "follow_up", note: "Nudge them", done: false }] }));
    expect(await raiseDueReminders(TENANT, NOW)).toMatchObject({ raised: 0, pushes: [] });
  });

  it("raises an interview reminder naming the employer", async () => {
    await seed(application({ followUps: [{ id: "f1", applicationId: "app-1", dueAt: at(1), kind: "interview", note: "Panel round", done: false }] }));
    const report = await raiseDueReminders(TENANT, NOW);
    expect(report.raised).toBe(1);
    expect(report.pushes[0]).toMatchObject({ title: "Interview coming up — PayCircle", url: "/app/interview-prep" });

    const career = await readClientState<CareerDoc & { reminded: string[] }>(TENANT, "wj.career");
    expect(career!.notifications[0].category).toBe("interview_upcoming");
    expect(career!.reminded).toContain("f1");
  });

  it("says a follow-up is overdue when it is", async () => {
    await seed(application({ followUps: [{ id: "f1", applicationId: "app-1", dueAt: at(-0.5), kind: "follow_up", note: "No response yet", done: false }] }));
    const report = await raiseDueReminders(TENANT, NOW);
    expect(report.pushes[0].title).toMatch(/overdue/);
    expect(report.pushes[0].url).toBe("/app/applications/app-1");
  });

  it("never raises the same reminder twice, however often the cron runs", async () => {
    await seed(application({ followUps: [{ id: "f1", applicationId: "app-1", dueAt: at(0.5), kind: "follow_up", note: "Nudge them", done: false }] }));
    expect((await raiseDueReminders(TENANT, NOW)).raised).toBe(1);
    expect((await raiseDueReminders(TENANT, NOW)).raised).toBe(0);
    expect((await readClientState<CareerDoc>(TENANT, "wj.career"))!.notifications).toHaveLength(1);
  });

  it("respects what the browser already reminded about", async () => {
    await seed(application({ followUps: [{ id: "f1", applicationId: "app-1", dueAt: at(0.5), kind: "follow_up", note: "Nudge them", done: false }] }), { reminded: ["f1"] });
    expect((await raiseDueReminders(TENANT, NOW)).raised).toBe(0);
  });

  it("leaves the rest of the career document alone", async () => {
    await seed(application({ followUps: [{ id: "f1", applicationId: "app-1", dueAt: at(0.5), kind: "follow_up", note: "Nudge them", done: false }] }), { dna: { ...EMPTY_DNA, name: "Priya Raman" } });
    await raiseDueReminders(TENANT, NOW);
    const career = await readClientState<CareerDoc>(TENANT, "wj.career");
    expect(career!.dna.name).toBe("Priya Raman");
    expect(career!.onboarded).toBe(true);
  });

  it("does nothing for a tenant with no applications", async () => {
    expect(await raiseDueReminders("nobody", NOW)).toMatchObject({ raised: 0 });
  });
});
