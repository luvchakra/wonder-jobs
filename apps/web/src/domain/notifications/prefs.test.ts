import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFY_PREFS, NOTIFY_TOPICS, cleanNotifyPrefs, hasChannel, topicOf } from "./prefs";
import type { Notification } from "@/domain/career/types";

describe("what a person is told, and how", () => {
  it("lists every kind of notification; everything starts in the bell, messages and reminders also by push and email", () => {
    expect(NOTIFY_TOPICS.map((t) => t.id)).toEqual(["messages", "interviews", "follow_ups", "matches", "searches", "applications", "saved_jobs"]);
    expect(cleanNotifyPrefs(undefined)).toEqual(DEFAULT_NOTIFY_PREFS);
    expect(Object.values(DEFAULT_NOTIFY_PREFS).every((p) => p.bell)).toBe(true);
    expect(DEFAULT_NOTIFY_PREFS.interviews).toEqual({ bell: true, push: true, email: true });
    expect(DEFAULT_NOTIFY_PREFS.matches).toEqual({ bell: true, push: true, email: false });
  });

  it("keeps a person's choices, fills the rest with defaults, and ignores anything else", () => {
    expect(cleanNotifyPrefs({ messages: { email: false, push: "yes", bell: false }, interviews: null, junk: { push: false } })).toEqual({ ...DEFAULT_NOTIFY_PREFS, messages: { bell: false, push: true, email: false } });
  });

  it("never turns on a channel a kind can't use: application updates and saved jobs are in the bell only", () => {
    expect([hasChannel("applications", "push"), hasChannel("saved_jobs", "email"), hasChannel("saved_jobs", "bell")]).toEqual([false, false, true]);
    expect(cleanNotifyPrefs({ applications: { bell: false, push: true, email: true } }).applications).toEqual({ bell: false, push: false, email: false });
  });

  it("carries a choice saved before reminders were split over to both kinds of reminder", () => {
    const c = cleanNotifyPrefs({ reminders: { push: false, email: true } });
    expect(c.interviews).toEqual({ bell: true, push: false, email: true });
    expect(c.follow_ups).toEqual({ bell: true, push: false, email: true });
  });

  it("files every notification under its kind", () => {
    const all: Record<Notification["category"], string> = {
      recruiter_message: "messages",
      interview_upcoming: "interviews",
      follow_up_due: "follow_ups",
      strong_opportunity: "matches",
      workflow_completed: "searches",
      workflow_requires_input: "searches",
      scheduled_run_failed: "searches",
      provider_issue: "searches",
      application_status: "applications",
      materials_ready: "applications",
      job_closed: "saved_jobs",
    };
    for (const [category, topic] of Object.entries(all)) expect(topicOf(category as Notification["category"])).toBe(topic);
  });
});
