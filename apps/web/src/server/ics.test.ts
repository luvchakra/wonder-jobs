import { describe, expect, it } from "vitest";
import { buildIcsCalendar } from "./ics";

describe("buildIcsCalendar", () => {
  it("wraps events in a valid VCALENDAR with the right structure", () => {
    const ics = buildIcsCalendar("WonderJobs", [{ uid: "a1", start: new Date("2026-10-01T09:00:00.000Z"), durationMinutes: 60, summary: "Interview — Acme", description: "Senior Engineer at Acme", url: "https://example.com/app/applications/a1" }]);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("END:VEVENT\r\n");
    expect(ics).toContain("UID:a1@wonderjobs\r\n");
    expect(ics).toContain("DTSTART:20261001T090000Z\r\n");
    expect(ics).toContain("DTEND:20261001T100000Z\r\n");
    expect(ics).toContain("SUMMARY:Interview — Acme\r\n");
    expect(ics).toContain("URL:https://example.com/app/applications/a1\r\n");
  });

  it("escapes commas, semicolons and newlines in text fields", () => {
    const ics = buildIcsCalendar("Cal", [{ uid: "b1", start: new Date("2026-10-01T00:00:00.000Z"), durationMinutes: 15, summary: "Follow up; re: role, next steps\nsecond line" }]);
    expect(ics).toContain("SUMMARY:Follow up\\; re: role\\, next steps\\nsecond line\r\n");
  });

  it("folds lines longer than 75 octets with a CRLF + leading space", () => {
    const longSummary = "S".repeat(120);
    const ics = buildIcsCalendar("Cal", [{ uid: "c1", start: new Date("2026-10-01T00:00:00.000Z"), durationMinutes: 15, summary: longSummary }]);
    const summaryLine = ics.split("\r\n").find((l) => l.startsWith("SUMMARY:"));
    expect(summaryLine?.length).toBe(75);
    // "SUMMARY:" is 8 octets, so the first folded chunk carries 75 - 8 = 67 of the value's characters.
    expect(ics).toContain(`SUMMARY:${longSummary.slice(0, 67)}\r\n ${longSummary.slice(67)}`);
  });

  it("produces an empty-but-valid calendar with no events", () => {
    const ics = buildIcsCalendar("Cal", []);
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
  });
});
