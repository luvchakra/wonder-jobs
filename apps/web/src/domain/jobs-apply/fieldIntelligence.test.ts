import { describe, expect, it } from "vitest";
import type { CareerDNA } from "@/domain/career/types";
import { EMPTY_DNA } from "@/domain/career/types";
import { classifyField, contextOfSection } from "./classify";
import { formatDate, matchChoice, matchNumberChoice } from "./fieldValue";
import { mapForm } from "./mapper";
import { buildApplicationProfile, degreeLevel, educationFacts, experienceFacts, yearsWorked } from "./profile";
import { stateForCity } from "./places";
import type { ApplicationField, ApplicationPackSnapshot } from "./types";

const NOW = "2026-10-09T10:00:00.000Z";
const T = Date.parse(NOW);

/** Shaped like the owner's own Career Profile: one B.Tech., ten roles, "Mumbai, India", no street address. */
const dna: CareerDNA = {
  ...EMPTY_DNA,
  name: "Kunal Example",
  history: {
    contact: { email: "k@example.com", phone: "+91 90000 00000", location: "Mumbai, India" },
    experience: [
      { id: "x1", employer: "Nomura", title: "Senior Engineering Manager", startDate: "2025-12", current: true, bullets: [], provenance: "RESUME_IMPORTED" },
      { id: "x2", employer: "Deloitte", title: "Manager", startDate: "2023-06", endDate: "2025-12", bullets: [], provenance: "RESUME_IMPORTED" },
      { id: "x3", employer: "YasuTech", title: "Engineer", startDate: "2005-07", endDate: "2007-07", bullets: [], provenance: "RESUME_IMPORTED" },
      { id: "x4", employer: "AurionPro", title: "Engineer", startDate: "2007-07", endDate: "2010-03", bullets: [], provenance: "RESUME_IMPORTED" },
      { id: "x5", employer: "Barclays Capital", title: "AVP", startDate: "2010-03", endDate: "2023-06", bullets: [], provenance: "RESUME_IMPORTED" },
    ],
    education: [{ id: "ed1", institution: "IIT Kanpur", degree: "B.Tech.", startDate: "2001-07", endDate: "2005-05", provenance: "RESUME_IMPORTED" }],
    certifications: [],
    projects: [],
    publications: [],
    researchInterests: [],
  },
  updatedAt: NOW,
};

const pack = (d: CareerDNA = dna): ApplicationPackSnapshot => ({
  applicationId: "app_1",
  jobId: "job_1",
  jobTitle: "Director",
  company: "Example",
  profile: buildApplicationProfile(d, { now: T }),
  memory: [],
  answers: [],
  education: educationFacts(d),
  experience: experienceFacts(d),
  version: "pv_1",
  capturedAt: NOW,
});

let n = 0;
const f = (label: string, over: Partial<ApplicationField> = {}): ApplicationField => ({ id: over.id ?? `f${++n}`, label, type: "text", required: true, step: 1, ...over });
const opts = (...labels: string[]) => labels.map((l, i) => ({ label: l, value: `v${i}` }));
const mapOne = (fields: ApplicationField[], d?: CareerDNA) => {
  const { mappings } = mapForm({ fields }, pack(d), {}, T);
  return Object.fromEntries(mappings.map((m) => [m.fieldId, m]));
};

describe("profile — facts read from the Career Profile", () => {
  it("reads a degree's level from its own words", () => {
    expect(degreeLevel("B.Tech.")).toBe("Bachelor's");
    expect(degreeLevel("B.E. Computer Science")).toBe("Bachelor's");
    expect(degreeLevel("MBA")).toBe("Master's");
    expect(degreeLevel("M.S.")).toBe("Master's");
    expect(degreeLevel("PhD, Physics")).toBe("Doctorate");
    expect(degreeLevel("Diploma in Design")).toBe("Diploma");
    expect(degreeLevel("Certificate course")).toBeUndefined();
  });

  it("derives education, state, experience facts — and nothing it can't know", () => {
    const p = buildApplicationProfile(dna, { now: T });
    expect(p.university?.value).toBe("IIT Kanpur");
    expect(p.degreeName?.value).toBe("B.Tech.");
    expect(p.degreeType).toMatchObject({ value: "Bachelor's", provenance: "AI_DERIVED" });
    expect(p.educationStartDate?.value).toBe("2001-07");
    expect(p.educationEndDate?.value).toBe("2005-05");
    expect(p.state).toMatchObject({ value: "Maharashtra", provenance: "AI_DERIVED", confidence: 0.85 });
    expect(p.hasWorkExperience?.value).toBe("Yes");
    expect(p.yearsOfExperience).toMatchObject({ value: "21", confidence: 0.8 });
    expect(p.jobStartDate?.value).toBe("2025-12");
    expect(p.jobEndDate).toBeUndefined();
    // Not in the profile or the CV: never made up.
    expect(p.addressLine1).toBeUndefined();
    expect(p.postalCode).toBeUndefined();
    expect(p.fieldOfStudy).toBeUndefined();
  });

  it("takes the state from the location's middle part, or the candidate's own entry, before the gazetteer", () => {
    const three = buildApplicationProfile({ ...dna, history: { ...dna.history!, contact: { location: "Pune, Maharashtra, India" } } });
    expect(three.state).toMatchObject({ value: "Maharashtra", provenance: "USER_PROVIDED" });
    const own = buildApplicationProfile({ ...dna, history: { ...dna.history!, contact: { location: "Mumbai, India", state: "MH", postalCode: "400050", addressLine1: "12 Hill Road" } } });
    expect(own.state?.value).toBe("MH");
    expect(own.postalCode?.value).toBe("400050");
    expect(own.addressLine1?.value).toBe("12 Hill Road");
    expect(stateForCity("Mumbai", "USA")).toBeUndefined();
    expect(stateForCity("Unknownville")).toBeUndefined();
  });

  it("counts overlapping roles once and gives up when a start date is missing", () => {
    expect(yearsWorked([{ employer: "A", title: "x", startDate: "2010-01", endDate: "2015-01", provenance: "USER_PROVIDED" }, { employer: "B", title: "y", startDate: "2012-01", endDate: "2016-01", provenance: "USER_PROVIDED" }])).toBe(6);
    expect(yearsWorked([{ employer: "A", title: "x", provenance: "USER_PROVIDED" }])).toBeUndefined();
  });
});

describe("classify — what a field asks", () => {
  const key = (field: ApplicationField) => {
    const c = classifyField(field);
    return c.target.kind === "profile" ? c.target.key : c.target.kind;
  };
  it("recognises the owner's 'Needs you' questions", () => {
    expect(key(f("Address Line 1"))).toBe("addressLine1");
    expect(key(f("State/Province"))).toBe("state");
    expect(key(f("Zip Code/Postal Code"))).toBe("postalCode");
    expect(key(f("Degree name"))).toBe("degreeName");
    expect(key(f("Type of degree", { type: "select" }))).toBe("degreeType");
    expect(key(f("University"))).toBe("university");
    expect(key(f("Do you have past working experience?", { type: "radio" }))).toBe("hasWorkExperience");
  });

  it("keeps lookalikes apart", () => {
    expect(key(f("Email address"))).toBe("email");
    expect(key(f("Billing address"))).toBe("none"); // payment — human-only
    expect(key(f("Are you authorized to work in the United States?"))).toBe("none");
    expect(key(f("Do you have experience with Terraform?"))).not.toBe("hasWorkExperience");
    expect(key(f("Have you worked for us before?"))).not.toBe("hasWorkExperience");
    expect(key(f("Years of experience in Python"))).not.toBe("yearsOfExperience");
    expect(key(f("Highest qualification"))).toBe("degreeType");
    expect(key(f("Field of study"))).toBe("fieldOfStudy");
    expect(key(f("Major"))).toBe("fieldOfStudy");
    expect(key(f("High school name"))).not.toBe("university");
    expect(key(f("Personal statement"))).not.toBe("state");
  });

  it("asks the candidate to confirm a counted total, never fills it", () => {
    const c = classifyField(f("Total years of experience"));
    expect(c).toMatchObject({ target: { kind: "profile", key: "yearsOfExperience" }, confidence: "LOW" });
  });

  it("reads 'Start date' by the section it's in", () => {
    expect(contextOfSection("Education 1")).toBe("education");
    expect(contextOfSection("Work Experience")).toBe("experience");
    expect(key(f("Start date"))).toBe("memory"); // no section: when can you start
    expect(classifyField(f("Start date", { hints: { section: "Education 1" } }))).toMatchObject({ target: { key: "educationStartDate" }, confidence: "HIGH" });
    expect(classifyField(f("To", { hints: { section: "Work Experience 2" } }))).toMatchObject({ target: { key: "jobEndDate" } });
    expect(classifyField(f("Earliest start date", { hints: { section: "Work Experience" } })).target.kind).toBe("memory");
    // A city inside the education block is where the school is — not where the candidate lives.
    expect(classifyField(f("City", { hints: { section: "Education" } })).target.kind).toBe("none");
  });
});

describe("value shaping — the form's own wording", () => {
  it("picks degree options by level, abbreviation or synonym", () => {
    expect(matchChoice(f("Type of degree", { type: "select", options: opts("High School", "Bachelor's Degree", "Master's Degree", "Doctorate") }), "Bachelor's", "degreeType")).toBe("v1");
    expect(matchChoice(f("Qualification", { type: "select", options: opts("12th", "Graduate", "Post Graduate", "Doctorate") }), "Bachelor's", "degreeType")).toBe("v1");
    expect(matchChoice(f("Degree", { type: "select", options: opts("Bachelor of Arts", "Bachelor of Technology", "Master of Science") }), "B.Tech.", "degreeName")).toBe("v1");
    expect(matchChoice(f("Degree", { type: "select", options: opts("B.Tech/B.E.", "MBA/PGDM", "M.Tech") }), "B.Tech.", "degreeName")).toBe("v0");
    // Two equally good answers: none chosen — the candidate picks.
    expect(matchChoice(f("Type", { type: "select", options: opts("Bachelor of Arts", "Bachelor of Science") }), "Bachelor's", "degreeType")).toBeUndefined();
  });

  it("matches yes/no, countries and states", () => {
    expect(matchChoice(f("Q", { type: "radio", options: opts("Yes", "No") }), "Yes", "hasWorkExperience")).toBe("v0");
    expect(matchChoice(f("Country", { type: "select", options: opts("United States of America", "India", "Indonesia") }), "India", "country")).toBe("v1");
    expect(matchChoice(f("Country", { type: "select", options: opts("USA", "UK") }), "United States", "country")).toBe("v0");
    expect(matchChoice(f("State", { type: "select", options: opts("Karnataka", "Maharashtra") }), "maharashtra", "state")).toBe("v1");
  });

  it("puts a number into the range that holds it", () => {
    const field = f("Total experience", { type: "select", options: opts("0-2 years", "3-5 years", "6-10 years", "10+ years") });
    expect(matchNumberChoice(field, 21)).toBe("v3");
    expect(matchNumberChoice(field, 4)).toBe("v1");
    expect(matchNumberChoice(f("x", { type: "select", options: opts("5+ years", "10+ years", "15+ years") }), 21)).toBe("v2");
  });

  it("formats dates to the field — and never invents a month", () => {
    expect(formatDate(f("Start date"), "2001-07")).toEqual({ value: "07/2001", exact: true });
    expect(formatDate(f("From", { hints: { placeholder: "YYYY-MM" } }), "2001-07")).toEqual({ value: "2001-07", exact: true });
    expect(formatDate(f("Year"), "2005-05")).toEqual({ value: "2005", exact: true });
    expect(formatDate(f("Month", { type: "select", options: opts("January", "February", "March", "April", "May", "June", "July") }), "2001-07")).toEqual({ value: "v6", exact: true });
    expect(formatDate(f("Start", { type: "date" }), "2001-07")).toEqual({ value: "2001-07-01", exact: false });
    expect(formatDate(f("Start", { type: "date" }), "2001")).toEqual({ exact: false });
  });
});

describe("mapForm — the owner's form, end to end", () => {
  it("fills what the Career Profile knows and asks only for what it doesn't", () => {
    const fields = [
      f("Address Line 1", { id: "addr" }),
      f("City", { id: "city" }),
      f("State/Province", { id: "state", type: "select", options: opts("Karnataka", "Maharashtra", "Tamil Nadu") }),
      f("Zip Code/Postal Code", { id: "zip" }),
      f("University", { id: "uni", hints: { section: "Education 1" } }),
      f("Degree name", { id: "deg", hints: { section: "Education 1" } }),
      f("Type of degree", { id: "type", type: "select", options: opts("Associate", "Bachelor's Degree", "Master's Degree"), hints: { section: "Education 1" } }),
      f("Start date", { id: "start", hints: { section: "Education 1", placeholder: "MM/YYYY" } }),
      f("Do you have past working experience?", { id: "exp", type: "radio", options: opts("Yes", "No") }),
    ];
    const m = mapOne(fields);
    expect(m.uni).toMatchObject({ status: "pending", value: "IIT Kanpur", sourcePath: "profile.university" });
    expect(m.deg).toMatchObject({ status: "pending", value: "B.Tech." });
    expect(m.type).toMatchObject({ status: "pending", value: "v1" });
    expect(m.start).toMatchObject({ status: "pending", value: "07/2001" });
    expect(m.exp).toMatchObject({ status: "pending", value: "v0" });
    expect(m.state).toMatchObject({ status: "pending", value: "v1" });
    expect(m.city).toMatchObject({ status: "pending", value: "Mumbai" });
    // Real gaps stay real: the street address and postal code aren't in the profile or the CV.
    expect(m.addr).toMatchObject({ status: "needs_you", reason: "Address line 1 isn't in your Career Profile." });
    expect(m.zip).toMatchObject({ status: "needs_you" });
  });

  it("reads a section-less 'Start date' from its neighbours, and asks to confirm", () => {
    const m = mapOne([f("School", { id: "s" }), f("Degree", { id: "d" }), f("Start date", { id: "sd" }), f("End date", { id: "ed" })]);
    expect(m.sd).toMatchObject({ status: "needs_you", sourcePath: "profile.educationStartDate" });
    expect(m.ed).toMatchObject({ status: "needs_you", sourcePath: "profile.educationEndDate" });
  });

  it("gives the 2nd education block the 2nd entry — and says so when there isn't one", () => {
    const two: CareerDNA = { ...dna, history: { ...dna.history!, education: [...dna.history!.education, { id: "ed2", institution: "IIM Bangalore", degree: "MBA", startDate: "2008-06", endDate: "2010-04", provenance: "USER_PROVIDED" }] } };
    const fields = [f("Type of degree", { id: "t1", hints: { section: "Education 1" } }), f("Type of degree", { id: "t2", hints: { section: "Education 2" } })];
    const both = mapOne(fields, two);
    expect(both.t1).toMatchObject({ value: "Master's" }); // highest first
    expect(both.t2).toMatchObject({ value: "Bachelor's", sourcePath: "education[1].degreeType" });
    const one = mapOne(fields);
    expect(one.t2).toMatchObject({ status: "needs_you", reason: "Your Career Profile has 1 education entry." });
  });

  it("walks the work-history blocks role by role", () => {
    const fields = [
      f("Job Title", { id: "t1", hints: { section: "Work Experience 1" } }),
      f("Company", { id: "c1", hints: { section: "Work Experience 1" } }),
      f("From", { id: "f1", hints: { section: "Work Experience 1" } }),
      f("Job Title", { id: "t2", hints: { section: "Work Experience 2" } }),
      f("Company", { id: "c2", hints: { section: "Work Experience 2" } }),
      f("To", { id: "to2", hints: { section: "Work Experience 2" } }),
    ];
    const m = mapOne(fields);
    expect(m.c1).toMatchObject({ value: "Nomura" });
    expect(m.f1).toMatchObject({ value: "12/2025" });
    expect(m.c2).toMatchObject({ value: "Deloitte", sourcePath: "experience[1].currentEmployer" });
    expect(m.t2).toMatchObject({ value: "Manager" });
    expect(m.to2).toMatchObject({ value: "12/2025" });
  });

  it("offers the counted years to confirm, matched to the form's range", () => {
    const m = mapOne([f("Total experience", { id: "y", type: "select", options: opts("0-5 years", "5-10 years", "10+ years") })]);
    expect(m.y.status).toBe("needs_you");
    const { interventions } = mapForm({ fields: [f("Total experience", { id: "y2", type: "select", options: opts("0-5 years", "5-10 years", "10+ years") })] }, pack(), {}, T);
    expect(interventions[0].suggestion).toMatchObject({ value: "v2", provenance: "AI_DERIVED" });
  });
});

describe("phone — a form that asks for the country code apart", () => {
  const withPhone: CareerDNA = { ...dna, history: { ...dna.history!, contact: { ...dna.history!.contact, phone: "+91 63073 18656" } } };
  it("puts the national number in the phone box and picks the code from the list", () => {
    const m = mapOne(
      [
        f("Country Phone Code", { id: "cc", type: "select", options: opts("United States of America (+1)", "India (+91)", "Indonesia (+62)") }),
        f("Phone Number", { id: "ph" }),
      ],
      withPhone,
    );
    expect(m.cc).toMatchObject({ status: "pending", value: "v1" });
    expect(m.ph).toMatchObject({ status: "pending", value: "6307318656" });
  });
  it("keeps the full number when the form has one phone box", () => {
    expect(mapOne([f("Phone Number", { id: "ph" })], withPhone).ph).toMatchObject({ value: "+91 63073 18656" });
  });
  it("never reads +91 as +910", () => {
    expect(matchChoice(f("Code", { type: "select", options: opts("+910 Test", "India (+91)") }), "+91", "phoneCountryCode")).toBe("v1");
  });
});

describe("phone extension", () => {
  it("is never given the phone number", () => {
    expect(classifyField(f("Phone Extension")).target).toEqual({ kind: "none" });
  });
});
