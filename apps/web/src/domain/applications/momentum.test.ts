import { describe, expect, it } from "vitest";
import { momentumOf } from "./momentum";
import type { ApplicationEvent } from "./types";

const NOW = Date.parse("2026-10-25T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const ev = (type: ApplicationEvent["type"], at: string, title = "", detail?: string): ApplicationEvent => ({ id: Math.random().toString(), applicationId: "a", type, at, title, detail });
const app = (sentDaysAgo: number, events: ApplicationEvent[] = [], followUps: { kind: "follow_up"; done: boolean }[] = []) => ({ appliedAt: daysAgo(sentDaysAgo), createdAt: daysAgo(sentDaysAgo + 1), events, followUps: followUps.map((f, i) => ({ ...f, id: `f${i}`, applicationId: "a", dueAt: "", note: "" })) });

describe("where a sent application stands", () => {
  it("is waiting while it's recent, follow up after a week of silence, gone quiet after a month", () => {
    expect(momentumOf(app(2), NOW)).toMatchObject({ momentum: "waiting", reason: "Sent 2 days ago" });
    expect(momentumOf(app(9), NOW)).toMatchObject({ momentum: "follow_up", reason: "Sent 9 days ago, no reply yet" });
    expect(momentumOf(app(35), NOW)).toMatchObject({ momentum: "quiet", reason: "No reply in 35 days" });
  });

  it("waits again after a follow-up, and goes quiet sooner when that brings nothing", () => {
    expect(momentumOf(app(10, [], [{ kind: "follow_up", done: true }]), NOW)).toMatchObject({ momentum: "waiting", reason: "Sent 10 days ago, followed up" });
    expect(momentumOf(app(22, [], [{ kind: "follow_up", done: true }]), NOW).momentum).toBe("quiet");
  });

  it("is promising when the employer replied or the candidate's own note says so", () => {
    expect(momentumOf(app(12, [ev("recruiter_response", daysAgo(3), "Recruiter replied")]), NOW)).toMatchObject({ momentum: "promising", reason: "The employer replied" });
    expect(momentumOf(app(12, [ev("note", daysAgo(1), "Note", "they called me")]), NOW)).toMatchObject({ momentum: "promising", reason: "Your note: “they called me”" });
  });

  it("takes the newest word: a later rejection note ends it", () => {
    const events = [ev("note", daysAgo(5), "Note", "they called me"), ev("note", daysAgo(1), "Note", "got rejected today")];
    expect(momentumOf(app(12, events), NOW)).toMatchObject({ momentum: "quiet", reason: "Your note: “got rejected today”" });
  });

  it("ignores notes from before it was sent", () => {
    expect(momentumOf(app(9, [ev("note", daysAgo(20), "Note", "they called me")]), NOW).momentum).toBe("follow_up");
  });
});
