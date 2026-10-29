import { describe, expect, it } from "vitest";
import { applyFacets, boardFromText, classLine, cleanBooking, cleanPosting, cleanProfile, gradesFromText, isTeachingTitle, matchTeaching, missingProfile, payLabel, profileFromCareer, stageOf, type TeachingListing } from "./domain";

const listing = (over: Partial<TeachingListing> = {}): TeachingListing => ({ id: "x", origin: "outside", title: "PGT Mathematics Teacher", company: "DPS", location: "Pune", workMode: "onsite", terms: { currency: "INR", grades: ["Senior secondary (11–12)"], requires: [], board: "CBSE", subject: "Mathematics" }, termsFrom: "posting", description: "", sourceId: "teach_adzuna_in", sourceName: "Adzuna India teaching", ...over });
const PROFILE = { subjects: ["Mathematics"], grades: ["Senior secondary (11–12)"], boards: ["CBSE"], qualifications: ["B.Ed"], languages: [], backgroundCheck: { has: true } };

describe("Teaching domain", () => {
  it("only titles that say teaching count", () => {
    expect(["PGT Physics", "Maths Teacher", "Assistant Professor, Chemistry", "Online Tutor", "Faculty – JEE Physics"].every(isTeachingTitle)).toBe(true);
    expect(["Software Engineer", "Sales Manager", "Content Writer"].some(isTeachingTitle)).toBe(false);
  });

  it("reads only what a posting states: board, grades, pay", () => {
    expect(boardFromText("Hiring for our CBSE school in Pune")).toBe("CBSE");
    expect(boardFromText("A great school")).toBeUndefined();
    expect(gradesFromText("TGT English for classes 9 and 10")).toEqual(["Secondary (9–10)"]);
    expect(payLabel({ currency: "INR" })).toBe("Pay not stated");
    expect(payLabel({ currency: "INR", payMin: 30000, payMax: 40000 })).toBe("₹30,000–₹40,000 a month");
    expect(classLine({ grades: [] })).toBe("Subject not stated · Grades not stated · Board not stated");
  });

  it("a school's role needs subject, grades, board, institution, pay, schedule and place", () => {
    const base = { title: "Maths Teacher", description: "Teach classes 11 and 12, prepare students for board exams.", subject: "Mathematics", grades: ["Senior secondary (11–12)"], board: "CBSE", schoolType: "School", workMode: "onsite", location: "Pune", schedule: "full_time", currency: "INR", payMin: 35000, requires: ["B.Ed", "Nonsense"] };
    expect(cleanPosting(base)).toMatchObject({ value: { terms: { subject: "Mathematics", requires: ["B.Ed"], payMin: 35000 } } });
    expect(cleanPosting({ ...base, grades: [] })).toEqual({ problem: "Choose the grades it teaches." });
    expect(cleanPosting({ ...base, board: "Hogwarts" })).toEqual({ problem: "Choose the board." });
  });

  it("the teacher's profile needs a background-check answer; prefill reads qualifications only", () => {
    expect(cleanProfile({ ...PROFILE, backgroundCheck: undefined })).toEqual({ problem: "Say whether you have a police verification or background check." });
    expect(cleanProfile(PROFILE)).toMatchObject({ value: { backgroundCheck: { has: true }, from: "teacher" } });
    expect(missingProfile({ subjects: [], grades: [], boards: [], qualifications: [], languages: [] })).toEqual(["subjects", "grades", "boards", "background check"]);
    const p = profileFromCareer({ history: { contact: {}, experience: [], education: [{ id: "e", institution: "X", degree: "B.Ed", provenance: "USER_PROVIDED" as never }], certifications: [{ id: "c", name: "CTET Paper II", provenance: "USER_PROVIDED" as never }], projects: [], publications: [], researchInterests: [] } } as never);
    expect(p.qualifications).toEqual(["B.Ed", "CTET"]);
    expect(p.backgroundCheck).toBeUndefined();
  });

  it("match signals say why: subject, grades, board, qualifications asked", () => {
    expect(matchTeaching(listing({ terms: { ...listing().terms, requires: ["CTET"] } }), PROFILE).map((s) => s.text)).toEqual(["Teaches Mathematics — one of your subjects", "Senior secondary (11–12) — grades you teach", "CBSE — a board you know", "Asks for CTET, not on your profile"]);
    expect(matchTeaching(listing(), undefined)).toEqual([]);
  });

  it("Refine leaves out a posting that doesn't state the term", () => {
    const a = listing({ id: "a" });
    const b = listing({ id: "b", terms: { currency: "INR", grades: [], requires: [] } });
    expect(applyFacets([a, b], { board: "CBSE" })).toEqual({ kept: [a], hidden: 1 });
    expect(applyFacets([a, b], { onlineOnly: true }).kept).toEqual([]);
  });

  it("a demo-class slot: future, sensible length, link or address", () => {
    const now = Date.parse("2026-11-01T00:00:00Z");
    expect(cleanBooking({ startsAt: "2026-11-03T10:00:00+05:30", durationMin: 45, mode: "online", where: "https://meet.example/abc" }, now)).toMatchObject({ value: { durationMin: 45, mode: "online" } });
    expect(cleanBooking({ startsAt: "2026-10-30T10:00:00Z", durationMin: 45, mode: "online", where: "https://x.example" }, now)).toEqual({ problem: "The demo class should be at least half an hour from now." });
    expect(cleanBooking({ startsAt: "2026-11-03T10:00:00Z", durationMin: 45, mode: "online", where: "zoom" }, now)).toEqual({ problem: "Give the meeting link (starting https://)." });
    expect(stageOf("withdrawn")).toBe("appointed_closed");
  });
});
