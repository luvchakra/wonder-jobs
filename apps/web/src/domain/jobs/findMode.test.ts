import { describe, expect, it } from "vitest";
import { FIND_MODES, FIND_MODE_PATCH, FULL_TIME_JOB_TYPES, MODE_JOB_TYPES, PART_TIME_JOB_TYPES, findModeOf, inMode, internshipWords, isInternshipSearch, isWordsMode, modeJobTypeLabel, readRefine } from "./findMode";

describe("Find's Internships (WJ-413)", () => {
  it("is a words mode of its own, and leaving it for Full Time or Part Time turns it off", () => {
    expect(findModeOf(FIND_MODE_PATCH.internships)).toBe("internships");
    expect(FIND_MODE_PATCH.internships).toMatchObject({ skipProfile: true, internships: true, query: "", jobTypes: [], locations: [] });
    expect(findModeOf({ ...FIND_MODE_PATCH.internships, ...FIND_MODE_PATCH.part_time })).toBe("part_time");
    expect(findModeOf({ ...FIND_MODE_PATCH.internships, ...FIND_MODE_PATCH.full_time })).toBe("full_time");
    expect([isWordsMode("full_time"), isWordsMode("part_time"), isWordsMode("internships")]).toEqual([false, true, true]);
  });

  it("lists only postings that say they're internships; the other modes also keep untyped ones", () => {
    expect(inMode("internship", "internships")).toBe(true);
    expect(inMode(undefined, "internships")).toBe(false);
    expect(inMode("full_time", "internships")).toBe(false);
    expect(inMode(undefined, "part_time")).toBe(true);
    expect(inMode("internship", "full_time")).toBe(false);
  });

  it("asks for the words as internships, once", () => {
    expect(internshipWords("product design")).toBe("product design internship");
    expect(internshipWords("marketing intern in Pune")).toBe("marketing intern in Pune");
    expect(isInternshipSearch("product design internship")).toBe(true);
    expect(isInternshipSearch("weekend barista")).toBe(false);
    expect(isInternshipSearch("internal audit")).toBe(false);
  });
});

describe("Find's Full Time and Part Time", () => {
  it("is Full Time unless the profile is skipped", () => {
    expect(findModeOf({})).toBe("full_time");
    expect(findModeOf({ skipProfile: false })).toBe("full_time");
    expect(findModeOf({ skipProfile: true })).toBe("part_time");
    expect(FIND_MODES.map((m) => m.label)).toEqual(["Full Time", "Part Time", "Internships"]);
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

  it("narrows Part Time by Contract, Consultant, Internship, Short-term and Gig", () => {
    expect(PART_TIME_JOB_TYPES).toEqual(["contract", "consultant", "internship", "temporary", "gig"]);
  });

  it("narrows Full Time by Permanent, Contract, Consultant and Short-term — each mode its own", () => {
    expect(FULL_TIME_JOB_TYPES).toEqual(["full_time", "contract", "consultant", "temporary"]);
    expect(MODE_JOB_TYPES).toEqual({ full_time: FULL_TIME_JOB_TYPES, part_time: PART_TIME_JOB_TYPES, internships: [] });
    expect(modeJobTypeLabel("full_time", "Full-time")).toBe("Permanent");
    expect(modeJobTypeLabel("contract", "Contract")).toBe("Contract");
  });
});

describe("readRefine", () => {
  it("never restores the retired \"strictly within your Career Profile\" on", () => {
    expect(readRefine({ strictProfile: true, hideInPipeline: true })).toMatchObject({ strictProfile: false, hideInPipeline: true });
  });
});
