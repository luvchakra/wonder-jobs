import { describe, expect, it } from "vitest";
import { FIND_MODES, FIND_MODE_PATCH, FIND_MODE_VIEWS, PART_TIME_JOB_TYPES, findModeOf } from "./findMode";

describe("Find's Full Time and Part Time", () => {
  it("is Full Time unless the profile is skipped", () => {
    expect(findModeOf({})).toBe("full_time");
    expect(findModeOf({ skipProfile: false })).toBe("full_time");
    expect(findModeOf({ skipProfile: true })).toBe("part_time");
    expect(FIND_MODES.map((m) => m.label)).toEqual(["Full Time", "Part Time"]);
  });

  it("Part Time searches only the words: anywhere, every job type, from All", () => {
    expect(FIND_MODE_PATCH.part_time).toMatchObject({ skipProfile: true, strictProfile: false, locations: [], jobTypes: [], minFit: null });
    expect(findModeOf(FIND_MODE_PATCH.part_time)).toBe("part_time");
  });

  it("Full Time goes back to the profile: its places, nothing typed, no job-type narrowing", () => {
    expect(FIND_MODE_PATCH.full_time).toMatchObject({ skipProfile: false, locations: undefined, query: "", jobTypes: [], minFit: null });
    expect("locations" in FIND_MODE_PATCH.full_time).toBe(true);
    expect(findModeOf(FIND_MODE_PATCH.full_time)).toBe("full_time");
  });

  it("offers For you in Full Time and Strong in Part Time, All in both", () => {
    expect(FIND_MODE_VIEWS.full_time).toEqual(["all", "for_you"]);
    expect(FIND_MODE_VIEWS.part_time).toEqual(["all", "strong"]);
  });

  it("narrows Part Time by every job type but Full-time", () => {
    expect(PART_TIME_JOB_TYPES).toEqual(["part_time", "contract", "internship", "temporary", "gig"]);
  });
});
