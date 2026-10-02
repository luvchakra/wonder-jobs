import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safeRedirect";

describe("safeNextPath", () => {
  it("keeps same-origin paths with their query and hash", () => {
    expect(safeNextPath("/app/jobs?tab=saved#top")).toBe("/app/jobs?tab=saved#top");
    expect(safeNextPath("/onboarding", "/x")).toBe("/onboarding");
  });

  it.each(["//evil.com", "/\\evil.com", "/\\/evil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "", null, undefined, "/" + "a".repeat(3000)])("rejects %j", (raw) => {
    expect(safeNextPath(raw as string)).toBe("/app");
  });

  it("enforces a required prefix on the path itself", () => {
    expect(safeNextPath("/app/jobs", "/app", "/app")).toBe("/app/jobs");
    expect(safeNextPath("/application-hijack", "/app", "/app")).toBe("/app");
    expect(safeNextPath("/settings", "/app", "/app")).toBe("/app");
  });
});
