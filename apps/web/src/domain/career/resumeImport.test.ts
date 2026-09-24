import { describe, expect, it } from "vitest";
import { buildImportPatch, reviewResumeImport, type ResumeImportDraft } from "./resumeImport";

const draft: ResumeImportDraft = {
  name: "Alex Morgan",
  headline: "Senior Product Manager · Payments",
  yearsExperience: 7,
  seniority: "senior",
  skills: [
    { name: "SQL", level: 3 },
    { name: "Payments", level: 3 },
  ],
  industries: ["Fintech"],
  preferredLocations: ["Mumbai"],
  evidence: { name: "Alex Morgan", headline: "Senior Product Manager", yearsExperience: "7 years", seniority: "Senior PM", skills: "2 skills", industries: "Fintech", preferredLocations: "Mumbai" },
};

describe("reviewResumeImport", () => {
  it("treats everything as new for an empty profile, all pre-ticked", () => {
    const r = reviewResumeImport(draft, {});
    expect(r.map((x) => x.status)).toEqual(["new", "new", "new", "new", "new", "new", "new"]);
    expect(r.every((x) => x.defaultOn)).toBe(true);
  });

  it("surfaces a conflict with both values and leaves it unticked", () => {
    const r = reviewResumeImport(draft, { headline: "Product Manager · Consumer", seniority: "mid", yearsExperience: 5 });
    const headline = r.find((x) => x.field === "headline")!;
    expect(headline).toMatchObject({ status: "conflict", current: "Product Manager · Consumer", incoming: "Senior Product Manager · Payments", defaultOn: false });
    expect(r.find((x) => x.field === "seniority")).toMatchObject({ status: "conflict", current: "Mid", incoming: "Senior", defaultOn: false });
    expect(r.find((x) => x.field === "yearsExperience")).toMatchObject({ status: "conflict", defaultOn: false });
  });

  it("marks matching values as same (case-insensitive) and does not pre-tick them", () => {
    const r = reviewResumeImport(draft, { name: "alex morgan" });
    expect(r.find((x) => x.field === "name")).toMatchObject({ status: "same", defaultOn: false });
  });

  it("list fields only add missing items", () => {
    const r = reviewResumeImport(draft, { skills: [{ name: "sql", level: 5 }], industries: ["Fintech"], preferredLocations: ["Bengaluru"] });
    expect(r.find((x) => x.field === "skills")).toMatchObject({ status: "adds", incoming: "Payments", defaultOn: true });
    expect(r.find((x) => x.field === "industries")).toMatchObject({ status: "same", defaultOn: false });
    expect(r.find((x) => x.field === "preferredLocations")).toMatchObject({ status: "adds", incoming: "Mumbai" });
  });

  it("skips fields the resume has no evidence for", () => {
    expect(reviewResumeImport({ headline: "PM", evidence: {} }, {})).toEqual([]);
  });
});

describe("buildImportPatch", () => {
  it("never removes existing list items or changes a self-rated skill level", () => {
    const current = { skills: [{ name: "SQL", level: 5 as const }], preferredLocations: ["Bengaluru"] };
    const p = buildImportPatch(draft, current, ["skills", "preferredLocations"]);
    expect(p.skills).toEqual([
      { name: "SQL", level: 5 },
      { name: "Payments", level: 3 },
    ]);
    expect(p.preferredLocations).toEqual(["Bengaluru", "Mumbai"]);
  });

  it("only includes ticked fields — an unticked conflict keeps the confirmed value", () => {
    const p = buildImportPatch(draft, { headline: "Mine" }, ["yearsExperience"]);
    expect(p).toEqual({ yearsExperience: 7 });
  });
});
