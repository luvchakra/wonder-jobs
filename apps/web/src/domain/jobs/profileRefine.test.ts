import { describe, expect, it } from "vitest";
import { MY_PROFILE, readProfileRefines, seededRefine, switchProfileRefine, targetLevel, type ProfileRefine } from "./profileRefine";
import { EMPTY_DNA, type CareerDNA } from "@/domain/career/types";
import type { CareerRole } from "@/domain/career/roles";
import type { JobFilters } from "./types";

const dna: CareerDNA = { ...EMPTY_DNA, seniority: "director", preferredLocations: ["Mumbai"], workModes: ["remote"], minSalary: 5_000_000 };
const role = (over: Partial<CareerRole>): CareerRole => ({ id: "re", title: "Reinsurance", query: "insurance operations", goal: "", createdAt: "", updatedAt: "", ...over });
// A role made before 2026-11-28 carried a copy of My profile's level, places, work modes and pay.
const copied = role({ id: "copy", seniority: "director", preferredLocations: ["Mumbai"], workModes: ["remote"], minSalary: 5_000_000 });
const own = role({ seniority: "senior", preferredLocations: ["London", " Zurich "], workModes: ["hybrid"], minSalary: 3_000_000 });
const filters = (over: Partial<JobFilters> = {}): JobFilters => ({ query: "", workModes: [], sourceIds: [], minFit: null, freshnessDays: null, onlySaved: false, ...over });
const mine: ProfileRefine = { locations: undefined, workModes: [], levels: [], minSalary: undefined };

describe("a role's stored level, places, pay and work mode move into its Refine choices once", () => {
  it("what it set differently from My profile moves; a copy of My profile's doesn't", () => {
    expect(seededRefine(mine, own, dna)).toEqual({ locations: ["London", "Zurich"], workModes: ["hybrid"], levels: ["senior"], minSalary: 3_000_000 });
    expect(seededRefine(mine, copied, dna)).toEqual(mine);
    expect(seededRefine({ ...mine, workModes: ["onsite"] }, role({}), dna)).toEqual({ ...mine, workModes: ["onsite"] });
  });

  it("the first switch to the role brings its moved choices into Refine; later switches bring back what was left there", () => {
    const s = { filters: filters({ workModes: ["onsite"] }), profileRefine: {}, refineProfile: MY_PROFILE };
    const toRole = switchProfileRefine(s, "re", { roles: [own], dna });
    expect(toRole.refineProfile).toBe("re");
    expect(toRole.patch).toEqual({ locations: ["London", "Zurich"], workModes: ["hybrid"], levels: ["senior"], minSalary: 3_000_000 });
    // My profile's choices on screen are kept for it.
    expect(toRole.profileRefine[MY_PROFILE]).toMatchObject({ workModes: ["onsite"] });
    // Changed in Refine while the role is in use, then back to My profile and to the role again.
    const changed = { filters: filters({ ...toRole.patch, levels: ["lead"] }), profileRefine: toRole.profileRefine, refineProfile: "re" };
    const back = switchProfileRefine(changed, MY_PROFILE, { roles: [own], dna });
    expect(back.patch).toMatchObject({ workModes: ["onsite"], levels: [] });
    const again = switchProfileRefine({ filters: filters(back.patch), profileRefine: back.profileRefine, refineProfile: MY_PROFILE }, "re", { roles: [own], dna });
    expect(again.patch).toMatchObject({ levels: ["lead"], locations: ["London", "Zurich"] });
  });

  it("the same profile again changes nothing; a role not loaded yet is never switched to (its stored fields would be missed)", () => {
    const s = { filters: filters(), profileRefine: {}, refineProfile: MY_PROFILE };
    expect(switchProfileRefine(s, MY_PROFILE, { roles: [], dna }).patch).toBeUndefined();
    expect(switchProfileRefine(s, "re", { roles: [], dna })).toEqual({ profileRefine: {}, refineProfile: MY_PROFILE });
  });

  it("after a reload: only known fields come back, capped", () => {
    const raw = { "": { workModes: ["remote", "moon"], levels: ["senior", "x"], minSalary: -1, locations: ["Pune", 3] }, re: "junk", ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`r${i}`, { workModes: [] }])) };
    const read = readProfileRefines(raw);
    expect(read[""]).toEqual({ workModes: ["remote"], levels: ["senior"], minSalary: undefined, locations: ["Pune"] });
    expect(read.re).toBeUndefined();
    expect(Object.keys(read).length).toBeLessThanOrEqual(8);
    expect(readProfileRefines(null)).toEqual({});
  });
});

describe("the level a job is judged against comes from Refine, never a hidden profile field", () => {
  it("the search's words first, then Refine's Level nearest the job, then your Current role's level", () => {
    expect(targetLevel({ seniority: "lead" }, "director", ["senior"], "mid")).toEqual({ level: "director", from: "words" });
    expect(targetLevel({ seniority: "lead" }, undefined, ["junior", "senior"], "mid")).toEqual({ level: "senior", from: "refine" });
    expect(targetLevel({ seniority: "lead" }, undefined, [], "mid")).toEqual({ level: "mid", from: "current_role" });
    expect(targetLevel({ seniority: "lead" }, undefined, undefined, undefined)).toBeUndefined();
  });
});
