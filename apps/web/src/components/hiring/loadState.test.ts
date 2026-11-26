import { describe, expect, it } from "vitest";
import { hiringLoadState } from "./loadState";

describe("Hiring's first load (WJ-874)", () => {
  it("shows loading until the workspaces arrive, and the failure once the read fails", () => {
    expect(hiringLoadState(false, null)).toBe("loading");
    expect(hiringLoadState(false, "Request failed (503)")).toBe("failed");
    // An empty message is still a failure: the page never goes back to an endless loading state.
    expect(hiringLoadState(false, "")).toBe("failed");
  });

  it("keeps a loaded page as it is when a later read fails", () => {
    expect(hiringLoadState(true, null)).toBe("ready");
    expect(hiringLoadState(true, "Request failed (503)")).toBe("ready");
  });
});
