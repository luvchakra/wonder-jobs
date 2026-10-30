import { describe, expect, it } from "vitest";
import { cleanSession, cleanSessionRequest, clientMay, practitionerMay, readDeal, sessionLabel, startsAt } from "./sessions";

const TODAY = "2026-11-01";

describe("a session request", () => {
  it("takes only a way of meeting the practitioner offers, a day in the next two months, a time of day and an optional phone", () => {
    expect(cleanSessionRequest({ mode: "online", date: "2026-11-03", slot: "evening", phone: "98765 43210" }, ["online"], TODAY)).toEqual({ value: { mode: "online", date: "2026-11-03", slot: "evening", phone: "98765 43210" } });
    expect(cleanSessionRequest({ mode: "in_person", date: "2026-11-03", slot: "evening" }, ["online"], TODAY)).toMatchObject({ problem: expect.stringContaining("meet") });
    expect(cleanSessionRequest({ mode: "online", date: "2026-10-31", slot: "evening" }, ["online"], TODAY)).toMatchObject({ problem: expect.stringContaining("day") });
    expect(cleanSessionRequest({ mode: "online", date: "2027-02-01", slot: "evening" }, ["online"], TODAY)).toMatchObject({ problem: expect.stringContaining("day") });
    expect(cleanSessionRequest({ mode: "online", date: "2026-11-03" }, ["online"], TODAY)).toMatchObject({ problem: expect.stringContaining("time of day") });
    expect(cleanSessionRequest({ mode: "online", date: "2026-11-03", slot: "evening", phone: "call me" }, ["online"], TODAY)).toMatchObject({ problem: expect.stringContaining("phone") });
  });

  it("keeps nothing else: no notes, no reason", () => {
    const c = cleanSessionRequest({ mode: "online", date: "2026-11-03", slot: "morning", notes: "panic attacks", reason: "anxiety" }, ["online"], TODAY);
    expect(JSON.stringify(c)).not.toMatch(/panic|anxiety/);
  });
});

describe("a confirmed session", () => {
  const req = { mode: "online" as const, date: "2026-11-03", slot: "evening" as const };
  it("has a day, an IST start time, a length and an https link (or none yet)", () => {
    const c = cleanSession({ date: "2026-11-03", time: "18:30", minutes: 50, where: "https://meet.example/abc" }, req, TODAY);
    expect(c).toEqual({ value: { date: "2026-11-03", time: "18:30", minutes: 50, mode: "online", where: "https://meet.example/abc" } });
    expect(sessionLabel((c as { value: Parameters<typeof sessionLabel>[0] }).value)).toBe("Tue 3 Nov, 6:30 pm IST · 50 min · Online");
    expect(startsAt({ date: "2026-11-03", time: "18:30" })).toBe(Date.parse("2026-11-03T13:00:00Z"));
    expect(cleanSession({ date: "2026-11-03", time: "25:00", minutes: 50 }, req, TODAY)).toMatchObject({ problem: expect.any(String) });
    expect(cleanSession({ date: "2026-11-03", time: "18:30", minutes: 50, where: "javascript:alert(1)" }, req, TODAY)).toMatchObject({ problem: expect.stringContaining("https") });
  });

  it("reads malformed stored deals as empty", () => {
    expect(readDeal({ session: { date: "x" }, reason: "rude", cancelledBy: "bot" })).toEqual({});
  });
});

describe("who may do what", () => {
  const s = { date: "2026-11-03", time: "18:00", minutes: 50, mode: "online" as const };
  const before = Date.parse("2026-11-03T10:00:00Z");
  const after = Date.parse("2026-11-03T14:00:00Z");
  it("the client cancels a request, or a confirmed session before it starts", () => {
    expect(clientMay("requested", {})).toEqual(["cancel"]);
    expect(clientMay("confirmed", { session: s }, before)).toEqual(["cancel"]);
    expect(clientMay("confirmed", { session: s }, after)).toEqual([]);
    expect(clientMay("held", { session: s })).toEqual([]);
  });
  it("the practitioner confirms or declines; marks held only once it has started", () => {
    expect(practitionerMay("requested", {})).toEqual(["confirm", "decline"]);
    expect(practitionerMay("confirmed", { session: s }, before)).toEqual(["cancel"]);
    expect(practitionerMay("confirmed", { session: s }, after)).toEqual(["held", "cancel"]);
    expect(practitionerMay("declined", {})).toEqual([]);
  });
});
