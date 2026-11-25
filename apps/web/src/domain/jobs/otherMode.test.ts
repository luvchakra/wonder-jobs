import { describe, expect, it } from "vitest";
import { applyJobFilters } from "./filterExplain";
import { FIND_MODE_PATCH, refineDefaults } from "./findMode";
import { alsoInOtherMode, otherModeCopy, otherModeFilters } from "./otherMode";
import { DEFAULT_FILTERS } from "@/store/jobs";
import type { CanonicalJob, JobFilters } from "@/domain/jobs/types";

const NOW = Date.parse("2026-11-23T10:00:00Z");

function job(id: string, title: string, jobType?: CanonicalJob["jobType"]): CanonicalJob {
  return {
    id,
    canonicalKey: id,
    sourceIds: ["remotive"],
    duplicateOf: [],
    title,
    company: "Co",
    location: "Mumbai",
    country: "IN",
    workMode: "onsite",
    currency: "INR",
    postedAt: new Date(NOW - 86_400_000).toISOString(),
    observedAt: new Date(NOW).toISOString(),
    description: "",
    requirements: [],
    niceToHave: [],
    skills: [],
    seniority: "mid",
    industry: "Insurance",
    applyUrl: "https://example.com",
    applyPath: "employer_site",
    onEmployerSite: true,
    repostCount: 0,
    tags: [],
    ...(jobType ? { jobType } : {}),
  };
}

// The owner's search (2026-11-23): "reinsurance" in Part Time, where nearly every answer is a full-time job.
const jobs = Object.fromEntries(
  [
    job("a", "Reinsurance Analyst", "full_time"),
    job("b", "Reinsurance Underwriter", "full_time"),
    job("c", "Senior Reinsurance Broker", "full_time"),
    job("d", "Reinsurance Accounting Associate", "full_time"),
    job("e", "Software Engineer", "full_time"),
    job("f", "Data Analyst", "full_time"),
  ].map((j) => [j.id, j]),
);
const order = Object.keys(jobs);
const run = (f: JobFilters) => applyJobFilters(order, jobs, {}, {}, {}, f, NOW);
const partTime: JobFilters = { ...DEFAULT_FILTERS, ...FIND_MODE_PATCH.part_time, query: "reinsurance" };

describe("the other mode's jobs for the same words", () => {
  it("counts the full-time jobs that answer the words, not every job the mode hides", () => {
    const here = run(partTime);
    expect(here.visibleIds).toEqual([]);
    // The mode is checked before the words, so its count takes in jobs the words never matched.
    expect(here.hiddenByReason.other_mode).toBe(6);
    const there = run({ ...otherModeFilters(partTime, {}), locations: undefined });
    const also = alsoInOtherMode("part_time", there, jobs);
    expect(also).toEqual({ mode: "full_time", ids: ["a", "b", "c", "d"], all: 4 });
  });

  it("leaves out a job that states no type: it already shows in this mode", () => {
    const withUntyped = { ...jobs, g: job("g", "Reinsurance Consultant") };
    const there = applyJobFilters([...order, "g"], withUntyped, {}, {}, {}, { ...otherModeFilters(partTime, {}), locations: undefined }, NOW);
    const also = alsoInOtherMode("part_time", there, withUntyped);
    expect(also.ids).toEqual(["a", "b", "c", "d"]);
    expect(also.all).toBe(5);
  });

  it("switches to the other mode with its own Refine kept and the same words", () => {
    const kept = { ...refineDefaults("full_time"), levels: ["senior" as const] };
    const f = otherModeFilters(partTime, { full_time: kept });
    expect(f.skipProfile).toBe(false);
    expect(f.query).toBe("reinsurance");
    expect(f.levels).toEqual(["senior"]);
    expect(f.jobTypes).toEqual([]);
    expect(otherModeFilters({ ...DEFAULT_FILTERS, query: "barista" }, {}).skipProfile).toBe(true);
  });

  it("says plainly what the other mode has, with real counts", () => {
    const c = otherModeCopy("part_time", { mode: "full_time", ids: ["a", "b", "c"], all: 1250 }, " reinsurance ");
    expect(c.emptyTitle).toBe("No part-time roles for “reinsurance”");
    expect(c.emptyBody).toBe("3 full-time roles found — they're below.");
    expect(c.divider).toBe("Also full-time · 3 for “reinsurance”");
    expect(c.seeAll).toBe("See all 1,250 in Full Time Jobs");
    const one = otherModeCopy("full_time", { mode: "part_time", ids: ["x"], all: 1 }, "barista");
    expect(one.emptyTitle).toBe("No full-time roles for “barista”");
    expect(one.emptyBody).toBe("1 part-time role found — it's below.");
    expect(one.divider).toBe("Also part-time · 1 for “barista”");
    expect(one.seeAll).toBe("See all 1 in Part Time Jobs");
  });
});
