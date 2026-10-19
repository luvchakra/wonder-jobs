import { describe, expect, it } from "vitest";
import { dueWhileOpen } from "./scheduler";

describe("the open tab's scheduler", () => {
  const opened = Date.parse("2026-10-19T06:09:00Z");
  it("leaves a schedule missed while the app was closed to the server's daily run", () => {
    expect(dueWhileOpen("2026-10-19T02:00:00Z", opened)).toBe(false);
    expect(dueWhileOpen(undefined, opened)).toBe(false);
  });
  it("fires a schedule whose time comes while the app is open", () => {
    expect(dueWhileOpen("2026-10-19T09:00:00Z", opened)).toBe(true);
  });
});
