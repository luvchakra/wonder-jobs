import { describe, expect, it } from "vitest";
import { adminTodo } from "./fetchMode";

describe("what the admin needs to do for a source (2026-11-05)", () => {
  it("says nothing is needed for a live source, and names the missing key", () => {
    expect(adminTodo({ mode: "on_search", status: "active", available: true })).toBe("Nothing. Searches ask it live.");
    expect(adminTodo({ mode: "on_search", status: "active", available: false, missingKey: "USAJOBS_API_KEY + USAJOBS_EMAIL" })).toBe("Set USAJOBS_API_KEY + USAJOBS_EMAIL on Admin → Keys. Until then searches skip it.");
    expect(adminTodo({ mode: "on_search", status: "active", available: false, missingKey: "x", keyOnSource: true })).toMatch(/Configuration tab/);
  });
  it("sends a scheduled source that isn't on to Sources → Import", () => {
    expect(adminTodo({ mode: "scheduled", status: "paused", available: true })).toMatch(/^Press Test & activate on Sources → Import/);
    expect(adminTodo({ mode: "scheduled", status: "active", available: true })).toMatch(/^Nothing\. It's collected on its schedule/);
    expect(adminTodo({ mode: "scheduled", status: "active", available: true, gatewayFed: true })).toMatch(/come from the gateway's sources/);
  });
  it("covers paused, draft, uploaded and do-not-use sources", () => {
    expect(adminTodo({ mode: "on_search", status: "paused", available: true })).toBe("Resume it if searches should ask it.");
    expect(adminTodo({ mode: "on_search", status: "draft", available: true })).toBe("Run its test, then activate it.");
    expect(adminTodo({ mode: "uploaded", status: "paused", available: true })).toMatch(/^Upload the partner's list/);
    expect(adminTodo({ mode: "on_search", status: "do_not_use", available: false })).toBe("Nothing: it's never used.");
  });
});
