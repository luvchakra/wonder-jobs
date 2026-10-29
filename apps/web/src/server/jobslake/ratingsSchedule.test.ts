import { beforeEach, describe, expect, it } from "vitest";
import { RATINGS_FREQUENCIES, SCHEDULER_DEFAULTS, cleanScheduler, ratingsDue } from "@/domain/scheduler/settings";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { saveScheduler } from "@/server/scheduler/store";
import { stateStore } from "@/server/state";
import { listRatingRuns } from "./ratingRuns";
import type { RatingsRunReport } from "./ratingsJob";
import { renderNeedsKeyEmail, renderTestEmail, runScheduledRatings, sendRatingsTestEmail } from "./ratingsSchedule";

const report = (o: Partial<RatingsRunReport> = {}): RatingsRunReport => ({ status: "complete", checked: 10, rated: 6, notFound: 4, retired: [], keysLeft: 1, left: 0, message: "All companies are covered — no company left.", notes: [], ...o });
const day = (n: number) => new Date(Date.parse("2026-10-26T01:50:00Z") + n * 86_400_000);

describe("when the scheduled ratings job is due", () => {
  it("runs weekly by default: the first time, then a week after it began (a few minutes early still counts), and carries on while a run has more to do", () => {
    expect(SCHEDULER_DEFAULTS.ratings).toEqual({ enabled: true, frequency: "weekly", notifyEmail: "kunalc.iit@gmail.com" });
    const last = { startedAt: day(0).toISOString(), status: "complete" };
    expect(ratingsDue("weekly", undefined, day(0))).toBe(true);
    expect(ratingsDue("weekly", last, day(1))).toBe(false);
    expect(ratingsDue("weekly", last, day(6))).toBe(false);
    expect(ratingsDue("weekly", { ...last, startedAt: new Date(day(0).getTime() + 5 * 60_000).toISOString() }, day(7))).toBe(true);
    expect(ratingsDue("daily", last, day(1))).toBe(true);
    expect(ratingsDue("biweekly", last, day(7))).toBe(false);
    expect(ratingsDue("biweekly", last, day(14))).toBe(true);
    expect(ratingsDue("monthly", last, day(29))).toBe(false);
    expect(ratingsDue("monthly", last, day(30))).toBe(true);
    expect(ratingsDue("weekly", { ...last, status: "more" }, day(1))).toBe(true);
    expect(Object.keys(RATINGS_FREQUENCIES)).toEqual(["daily", "weekly", "biweekly", "monthly"]);
  });

  it("keeps only a real frequency and a real email address", () => {
    expect(cleanScheduler({ ratings: { frequency: "hourly", notifyEmail: "not an email", enabled: "yes" } }).ratings).toEqual(SCHEDULER_DEFAULTS.ratings);
    expect(cleanScheduler({ ratings: { frequency: "daily", notifyEmail: " Boss@Example.com ", enabled: false } }).ratings).toEqual({ enabled: false, frequency: "daily", notifyEmail: "boss@example.com" });
  });
});

describe("the scheduled ratings run", () => {
  beforeEach(async () => {
    await stateStore.put(PLATFORM_TENANT, "wj.ratingruns", { runs: [] });
    await saveScheduler(SCHEDULER_DEFAULTS, "test");
  });
  const sent: { to: string; subject: string; text: string }[] = [];
  const send = async (m: { to: string; subject: string; text: string }) => (sent.push(m), { sent: true });

  it("runs when due, logs it in the history, and leaves the ticks in between alone", async () => {
    const run = async () => report();
    const first = await runScheduledRatings({ now: day(0), run, send });
    expect(first.outcome).toBe("ok");
    expect((await listRatingRuns()).map((r) => [r.trigger, r.status, r.checked, r.rated])).toEqual([["scheduled", "complete", 10, 6]]);
    expect(await runScheduledRatings({ now: day(3), run, send })).toMatchObject({ outcome: "skipped", reason: "Not due (every week)" });
    expect((await runScheduledRatings({ now: day(7), run, send })).outcome).toBe("ok");
    expect((await listRatingRuns()).length).toBe(2);
  });

  it("carries a run that ran out of time over to the next tick as the same history line", async () => {
    await runScheduledRatings({ now: day(0), run: async () => report({ status: "more", checked: 40, rated: 25, left: 90 }), send });
    await runScheduledRatings({ now: day(1), run: async () => report({ status: "complete", checked: 30, rated: 20, left: 0 }), send });
    const runs = await listRatingRuns();
    expect(runs.length).toBe(1);
    expect(runs[0]).toMatchObject({ trigger: "scheduled", status: "complete", checked: 70, rated: 45, left: 0 });
  });

  it("emails the owner when the last key is gone with companies waiting — once, and says so in the history", async () => {
    sent.length = 0;
    const needs = async () => report({ status: "needs_key", keysLeft: 0, left: 37, retired: [{ masked: "••••••••d8ac", label: "", reason: "out of credits", creditsLeft: 0 }], message: "37 companies are still left. Add a new API key to continue." });
    const r = await runScheduledRatings({ now: day(0), run: needs, send });
    expect(r.email).toEqual({ to: "kunalc.iit@gmail.com", sent: true });
    expect(sent.length).toBe(1);
    expect(sent[0].subject).toBe("WonderStar: company ratings need a new Explorium API key");
    expect(sent[0].text).toContain("37 companies are still waiting for a rating");
    // A daily schedule with no key added doesn't email again the next day.
    await saveScheduler({ ...SCHEDULER_DEFAULTS, ratings: { ...SCHEDULER_DEFAULTS.ratings, frequency: "daily" } }, "test");
    await runScheduledRatings({ now: day(1), run: needs, send });
    expect(sent.length).toBe(1);
    // A complete run never emails.
    await runScheduledRatings({ now: day(30), run: async () => report(), send });
    expect(sent.length).toBe(1);
  });

  it("says plainly when the email couldn't go out, and honours Off", async () => {
    const r = await runScheduledRatings({ now: day(0), run: async () => report({ status: "needs_key", keysLeft: 0, left: 5 }), send: async () => ({ sent: false, reason: "no email provider configured" }) });
    expect(r.email).toEqual({ to: "kunalc.iit@gmail.com", sent: false, reason: "no email provider configured" });
    expect((await listRatingRuns())[0].email?.sent).toBe(false);
    await saveScheduler({ ...SCHEDULER_DEFAULTS, ratings: { ...SCHEDULER_DEFAULTS.ratings, enabled: false } }, "test");
    expect(await runScheduledRatings({ now: day(30), run: async () => report(), send })).toMatchObject({ outcome: "skipped", reason: "Turned off in Company ratings" });
  });

  it("sends a test email to the address set, and reports a mailbox that isn't set up", async () => {
    const got: string[] = [];
    expect(await sendRatingsTestEmail("kunalc.iit@gmail.com", async (m) => (got.push(m.to + "|" + m.subject), { sent: true }))).toEqual({ to: "kunalc.iit@gmail.com", sent: true });
    expect(got).toEqual(["kunalc.iit@gmail.com|WonderStar: test email from Company ratings"]);
    expect(await sendRatingsTestEmail("kunalc.iit@gmail.com", async () => ({ sent: false, reason: "no email provider configured" }))).toEqual({ to: "kunalc.iit@gmail.com", sent: false, reason: "no email provider configured" });
    expect(renderTestEmail("https://jobs.example").text).toContain("platform mailbox reaches this address");
  });

  it("the email names the count and links to the page", () => {
    const m = renderNeedsKeyEmail({ left: 1, origin: "https://jobs.example" });
    expect(m.text).toContain("1 company is still waiting for a rating");
    expect(m.text).toContain("https://jobs.example/platform/jobs-lake/ratings");
  });
});
