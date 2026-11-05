import { describe, expect, it } from "vitest";
import { explainFailure, failureSummary } from "./failure";

describe("why a source didn't go live, in plain words", () => {
  it("names each gateway failure the import job records", () => {
    expect(explainFailure("Test", "The test found no valid listings, so it stays paused.").label).toBe("Found nothing");
    expect(explainFailure("Test", "Source timed out").label).toBe("Took too long");
    expect(explainFailure("Test", "Source responded 403").label).toBe("Site refused us");
    expect(explainFailure("Test", "Source responded 404").label).toBe("Address not found");
    expect(explainFailure("Test", "Cannot verify robots policy").label).toBe("Robots.txt didn't load");
    expect(explainFailure("Test", "Cannot verify robots policy (robots.txt responded 403)").label).toBe("Site refused us");
    expect(explainFailure("Test", "Cannot verify robots policy (robots.txt responded 403)").detail).toContain("403 to its robots.txt");
    expect(explainFailure("Test", "Cross-host redirects are not allowed").label).toBe("Redirects to another site");
    expect(explainFailure("Test", "Source response exceeds size limit").label).toBe("Feed too large");
    expect(explainFailure("Collect", "SOURCE_UNAVAILABLE").label).toBe("Couldn't reach the site");
    expect(explainFailure("Test", "The data gateway didn't answer (aborted)").label).toBe("Took too long");
  });

  it("says where it stopped and keeps an unknown message as it came", () => {
    expect(explainFailure("Test", "Source responded 403").detail).toContain("during its test");
    expect(explainFailure("Add", "Something new")).toEqual({ label: "Didn't go live", detail: "Add: Something new" });
  });

  it("groups the failures for the banner, most common first", () => {
    const items = [
      { status: "failed", step: "Test", message: "Source timed out" },
      { status: "failed", step: "Test", message: "Source timed out" },
      { status: "failed", step: "Test", message: "Source responded 403" },
      { status: "live" },
    ];
    expect(failureSummary(items)).toBe("2 took too long, 1 site refused us");
  });
});
