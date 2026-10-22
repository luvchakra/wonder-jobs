import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFY_PREFS, cleanNotifyPrefs, topicOf } from "./prefs";

describe("what a person is told outside the app", () => {
  it("starts with messages and reminders by push and email, strong matches by push", () => {
    expect(cleanNotifyPrefs(undefined)).toEqual(DEFAULT_NOTIFY_PREFS);
    expect(DEFAULT_NOTIFY_PREFS.matches).toEqual({ push: true, email: false });
  });

  it("keeps a person's choices, fills the rest with defaults, and ignores anything else", () => {
    expect(cleanNotifyPrefs({ messages: { email: false, push: "yes" }, reminders: null, junk: { push: false } })).toEqual({ ...DEFAULT_NOTIFY_PREFS, messages: { push: true, email: false } });
  });

  it("files each notification under its topic; the rest stay in the bell only", () => {
    expect(topicOf("recruiter_message")).toBe("messages");
    expect(topicOf("interview_upcoming")).toBe("reminders");
    expect(topicOf("follow_up_due")).toBe("reminders");
    expect(topicOf("strong_opportunity")).toBe("matches");
    expect(topicOf("workflow_completed")).toBeNull();
  });
});
