import { describe, expect, it } from "vitest";
import { cleanReminder, describeReminder, reminderLeadMs } from "./reminder";

describe("event reminders", () => {
  it("keeps only a known lead and known ways, in order", () => {
    expect(cleanReminder({ before: 1440, channels: ["email", "sms", "app", "email"] })).toEqual({ before: 1440, channels: ["app", "email"] });
    expect(cleanReminder({ before: 7, channels: ["app"] })).toBeUndefined();
    expect(cleanReminder("x")).toBeUndefined();
  });
  it("uses the candidate's lead, none when no way is picked, the default when unset", () => {
    expect(reminderLeadMs({ before: 60, channels: ["push"] }, 999)).toBe(3_600_000);
    expect(reminderLeadMs({ before: 60, channels: [] }, 999)).toBeNull();
    expect(reminderLeadMs(undefined, 999)).toBe(999);
    expect(reminderLeadMs({ before: 5, channels: ["push"] }, 999)).toBeNull();
  });
  it("describes it in the UI's words", () => {
    expect(describeReminder({ before: 2880, channels: ["app", "push", "email"] })).toBe("2 days before · In app, Push, Email");
    expect(describeReminder({ before: 60, channels: [] })).toBe("No reminder");
  });
});
