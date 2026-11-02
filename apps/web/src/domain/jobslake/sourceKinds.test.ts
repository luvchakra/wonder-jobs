import { describe, expect, it } from "vitest";
import { kindFitsModule } from "./sourceKinds";

describe("Add a source: kinds per module", () => {
  it("offers ATS boards and JobPosting pages only to job-posting modules", () => {
    expect(kindFitsModule("ats_board", "jobs")).toBe(true);
    expect(kindFitsModule("structured", "internships")).toBe(true);
    expect(kindFitsModule("ats_board", "events")).toBe(false);
    expect(kindFitsModule("structured", "marketplace")).toBe(false);
  });
  it("offers APIs, MCP and feeds to every module", () => {
    for (const k of ["json_api", "mcp", "feed"] as const) expect(kindFitsModule(k, "therapists")).toBe(true);
  });
});
