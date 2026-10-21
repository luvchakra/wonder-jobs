import { afterEach, describe, expect, it, vi } from "vitest";
import { clientAddress, resetActivityWatch, watchActivity, WATCH_LIMITS } from "./activityWatch";

afterEach(() => resetActivityWatch());

describe("scraping watch", () => {
  it("logs once when an address passes the hourly API ceiling, and never blocks", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const seen = Array.from({ length: WATCH_LIMITS.apiCalls + 50 }, () => watchActivity("1.2.3.4", "/api/jobs/search", 1_000));
    expect(seen.filter(Boolean)).toEqual(["api"]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("counts distinct pages, not reloads of one", () => {
    for (let i = 0; i < 1_000; i++) expect(watchActivity("5.6.7.8", "/app/jobs", 1_000)).toBeNull();
    const hits = Array.from({ length: WATCH_LIMITS.pages + 1 }, (_, i) => watchActivity("9.9.9.9", `/app/jobs/${i}`, 1_000));
    expect(hits.at(-1)).toBe("pages");
  });

  it("starts a new hour fresh", () => {
    for (let i = 0; i <= WATCH_LIMITS.apiCalls; i++) watchActivity("1.1.1.1", "/api/x", 0);
    expect(watchActivity("1.1.1.1", "/api/x", 3_600_001)).toBeNull();
  });

  it("reads the first forwarded address", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});
