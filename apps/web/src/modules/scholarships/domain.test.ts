import { describe, expect, it } from "vitest";
import { scholarshipsManifest } from "./manifest";
import {
  applyFacets,
  asksForFee,
  cleanAnswers,
  cleanPosting,
  cleanProfile,
  deadlineLabel,
  deadlines,
  levelsFromText,
  matchScholarship,
  missingProfile,
  officialLink,
  profileForProvider,
  readTerms,
  stageOf,
  stillOpen,
  valueLabel,
  type ScholarshipListing,
} from "./domain";

const TODAY = "2026-11-01";

const scholarship = {
  kind: "scholarship",
  title: "Merit scholarship for engineering students",
  description: "A yearly award for first-year engineering students from families with modest incomes.",
  levels: ["ug"],
  deadline: "2026-12-15",
  officialUrl: "https://foundation.example.org/merit",
  currency: "INR",
  providerType: "foundation",
  awardAmount: 50000,
  awardPeriod: "per_year",
  renewable: true,
  minMarks: 75,
  incomeLimit: 600000,
  noFee: true,
};

const project = {
  kind: "project",
  title: "Build a water-quality dashboard",
  description: "Work with our lab on a dashboard for village water-quality readings, with a mentor every week.",
  levels: ["ug", "pg"],
  deadline: "2026-11-20",
  officialUrl: "https://lab.example.edu/projects/water",
  currency: "INR",
  workMode: "remote",
  durationWeeks: 8,
  stipend: 0,
  certificate: true,
  noFee: true,
};

const listing = (terms: ScholarshipListing["terms"], extra: Partial<ScholarshipListing> = {}): ScholarshipListing => ({ id: "x", origin: "outside", title: "Engineering scholarship", company: "Foundation", location: "India", terms, termsFrom: "posting", skills: [], description: "", sourceId: "s", sourceName: "S", ...extra });

describe("Scholarships & Projects manifest", () => {
  it("is its own module with Applications and the doc's stages, coming soon until it has data", () => {
    expect(scholarshipsManifest).toMatchObject({ id: "scholarships", label: "Scholarships & Projects", status: "soon", menuId: "scholarships", routes: { find: "/app/m/scholarships" }, compliance: ["minors"] });
    expect(scholarshipsManifest.pipeline.label).toBe("Applications");
    expect(scholarshipsManifest.pipeline.stages.map((s) => s.label)).toEqual(["Saved", "Preparing", "Applied", "Shortlisted", "Awarded / Selected", "Completed"]);
    expect(scholarshipsManifest.pipeline.stages.map((s) => s.id)).toEqual(["saved", "preparing", "applied", "shortlisted", "awarded_selected", "completed"]);
    expect(scholarshipsManifest.response.capability).toBe("scholarships.apply");
  });
});

describe("no fee to apply, ever", () => {
  it("spots a fee to apply and ignores 'no fee'", () => {
    for (const s of ["Application fee: ₹500", "A registration fee of Rs 200 applies.", "Pay ₹300 to apply", "Processing charges apply", "fee to register is $10"]) expect(asksForFee(s), s).toBe(true);
    for (const s of ["There is no application fee.", "Applying is free — the application fee is waived.", "We never charge an application fee", "Tuition fee support up to ₹50,000", "Covers exam fees"]) expect(asksForFee(s), s).toBe(false);
  });

  it("refuses a posting that asks for a fee, or that doesn't confirm applying is free", () => {
    expect(cleanPosting({ ...scholarship, description: `${scholarship.description} Application fee: ₹500.` }, TODAY)).toMatchObject({ problem: expect.stringMatching(/fee/) });
    expect(cleanPosting({ ...scholarship, noFee: false }, TODAY)).toMatchObject({ problem: expect.stringMatching(/free/) });
    expect(cleanPosting({ ...scholarship, questions: [{ text: "Upload proof of the registration fee payment", required: true }] }, TODAY)).toMatchObject({ problem: expect.stringMatching(/fee/) });
  });
});

describe("an organisation's posting", () => {
  it("keeps a scholarship's award and eligibility", () => {
    const r = cleanPosting(scholarship, TODAY);
    expect("value" in r && r.value.terms).toMatchObject({ kind: "scholarship", awardAmount: 50000, awardPeriod: "per_year", renewable: true, minMarks: 75, levels: ["ug"], officialUrl: "https://foundation.example.org/merit" });
  });

  it("keeps a project's host terms; 0 is unpaid", () => {
    const r = cleanPosting(project, TODAY);
    expect("value" in r && r.value).toMatchObject({ workMode: "remote", location: "Remote", terms: { kind: "project", durationWeeks: 8, stipend: 0, certificate: true } });
    expect("value" in r && valueLabel(r.value.terms)).toBe("Unpaid");
  });

  it("requires an https official link, a future deadline and a level", () => {
    expect(cleanPosting({ ...scholarship, officialUrl: "http://foundation.example.org" }, TODAY)).toMatchObject({ problem: expect.stringMatching(/official link/) });
    expect(cleanPosting({ ...scholarship, officialUrl: undefined }, TODAY)).toMatchObject({ problem: expect.stringMatching(/official link/) });
    expect(cleanPosting({ ...scholarship, deadline: "2026-10-31" }, TODAY)).toMatchObject({ problem: expect.stringMatching(/passed/) });
    expect(cleanPosting({ ...scholarship, levels: [] }, TODAY)).toMatchObject({ problem: expect.stringMatching(/who can apply/) });
    expect(officialLink("https://user:pw@x.org")).toBeUndefined();
  });

  it("keeps at most five questions and checks the required answers", () => {
    const r = cleanPosting({ ...scholarship, questions: Array.from({ length: 7 }, (_, i) => ({ id: `q${i}`, text: `Question ${i}`, required: i === 0 })) }, TODAY);
    const qs = "value" in r ? r.value.questions : [];
    expect(qs).toHaveLength(5);
    expect(cleanAnswers(qs, {})).toMatchObject({ problem: "Answer: Question 0" });
    expect(cleanAnswers(qs, { q0: "Yes", q1: "", nope: "x" })).toEqual({ value: [{ question: "Question 0", answer: "Yes" }] });
  });

  it("reads stored terms back, dropping anything malformed", () => {
    expect(readTerms({ kind: "project", deadline: "soon", officialUrl: "javascript:alert(1)", stipend: -1, levels: ["ug", "kid"] })).toEqual({ kind: "project", currency: "INR", levels: ["ug"] });
  });
});

describe("deadlines", () => {
  it("a listing past its deadline is closed; one without a deadline stays", () => {
    expect(stillOpen({ deadline: "2026-10-31" }, TODAY)).toBe(false);
    expect(stillOpen({ deadline: TODAY }, TODAY)).toBe(true);
    expect(stillOpen({}, TODAY)).toBe(true);
  });

  it("says when it closes", () => {
    expect(deadlineLabel({ deadline: TODAY }, TODAY)).toBe("Closes today");
    expect(deadlineLabel({ deadline: "2026-11-13" }, TODAY)).toBe("Closes in 12 days");
    expect(deadlineLabel({}, TODAY)).toBe("Deadline not stated");
  });

  it("lists saved ones not yet applied to, soonest first", () => {
    const a = listing({ kind: "scholarship", currency: "INR", deadline: "2026-12-01" }, { id: "a" });
    const b = listing({ kind: "project", currency: "INR", deadline: "2026-11-05" }, { id: "b" });
    const c = listing({ kind: "project", currency: "INR", deadline: "2026-10-05" }, { id: "c" });
    const d = listing({ kind: "project", currency: "INR", deadline: "2026-11-02" }, { id: "d" });
    expect(deadlines([a, b, c, d], new Set(["d"]), TODAY).map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("the student's profile", () => {
  it("drops income, gender and category unless they opted in", () => {
    const base = { level: "ug", field: "Mechanical engineering", institution: "COEP", region: "Maharashtra, India", marks: 82, incomeBand: 300000, gender: "female", category: "OBC" };
    expect(cleanProfile(base)).toEqual({ value: { level: "ug", field: "Mechanical engineering", institution: "COEP", region: "Maharashtra, India", marks: 82 } });
    expect(cleanProfile({ ...base, sensitiveConsent: true })).toMatchObject({ value: { sensitiveConsent: true, incomeBand: 300000, gender: "female", category: "OBC" } });
  });

  it("needs a parent's or guardian's consent for Class 9–12", () => {
    const school = { level: "school", field: "Science", institution: "KV Pune", region: "Maharashtra" };
    expect(cleanProfile(school)).toMatchObject({ problem: expect.stringMatching(/guardian/) });
    expect(missingProfile(school as never)).toContain("a parent's or guardian's consent");
    expect(cleanProfile({ ...school, guardianConsent: true })).toMatchObject({ value: { guardianConsent: true } });
  });

  it("never sends sensitive fields to a provider unless shared for that one", () => {
    const p = { level: "ug" as const, field: "Physics", institution: "X", region: "Y", sensitiveConsent: true, incomeBand: 1, gender: "male" as const, category: "SC" };
    expect(profileForProvider(p, false)).toEqual({ level: "ug", field: "Physics", institution: "X", region: "Y" });
    expect(profileForProvider(p, true)).toMatchObject({ incomeBand: 1, gender: "male", category: "SC" });
    expect(profileForProvider({ ...p, sensitiveConsent: false }, true)).not.toHaveProperty("gender");
  });
});

describe("you may be eligible — never a guarantee", () => {
  const terms = readTerms({ ...scholarship, fields: ["Engineering"] });

  it("says 'may' when stated rules fit, and why", () => {
    const m = matchScholarship(listing(terms), { level: "ug", field: "Mechanical engineering", institution: "COEP", region: "Pune", marks: 82 });
    expect(m.fit).toBe("may");
    expect(m.signals.map((s) => s.text)).toEqual(["Open to Undergraduate students", "In your field (Mechanical engineering)", "Asks for 75% — you have 82%"]);
  });

  it("flags a rule that rules them out; ignores income unless opted in", () => {
    expect(matchScholarship(listing(terms), { level: "pg", field: "", institution: "", region: "" }).fit).toBe("unlikely");
    const rich = { level: "ug" as const, field: "", institution: "", region: "", incomeBand: 9_000_000 };
    expect(matchScholarship(listing(terms), rich).fit).toBe("may");
    expect(matchScholarship(listing(terms), { ...rich, sensitiveConsent: true }).fit).toBe("unlikely");
    expect(matchScholarship(listing(terms), null).fit).toBe("unknown");
  });
});

describe("Refine and stages", () => {
  const s = listing({ kind: "scholarship", currency: "INR", awardAmount: 50000, levels: ["ug"], deadline: "2026-11-05", region: "Karnataka" });
  const p = listing({ kind: "project", currency: "INR", stipend: 5000, deadline: "2027-01-30" }, { workMode: "remote", title: "Data project", location: "Remote" });

  it("filters by kind, level, deadline window, award, region, remote and paid", () => {
    expect(applyFacets([s, p], { kind: "project" }, TODAY).kept).toEqual([p]);
    expect(applyFacets([s, p], { level: "ug" }, TODAY).kept).toEqual([s]);
    expect(applyFacets([s, p], { closesWithin: "7" }, TODAY).kept).toEqual([s]);
    expect(applyFacets([s, p], { minAward: 60000 }, TODAY)).toEqual({ kept: [], hidden: 2 });
    expect(applyFacets([s, p], { region: "karnataka" }, TODAY).kept).toEqual([s]);
    expect(applyFacets([s, p], { remoteOnly: true, paidOnly: true }, TODAY).kept).toEqual([p]);
  });

  it("maps statuses to the Pipeline's stages", () => {
    expect(["applied", "shortlisted", "accepted", "done", "declined", "withdrawn"].map((x) => stageOf(x as never))).toEqual(["applied", "shortlisted", "awarded_selected", "completed", "applied", "applied"]);
  });

  it("reads the levels a listing's own text names", () => {
    expect(levelsFromText("Post-matric scholarship for Class 11 and 12 students")).toEqual(["school"]);
    expect(levelsFromText("Open to undergraduate and PhD researchers")).toEqual(["ug", "phd"]);
    expect(levelsFromText("Community grant")).toEqual([]);
  });
});
