import { describe, expect, it } from "vitest";
import { teachingManifest } from "./manifest";
import { applyFacets, asTeachingQuery, boardsFromText, canWithdraw, cleanSlots, demoKey, SCHOOL_MAY, TEACHER_MAY, cleanPosting, cleanProfile, COMPANY_NEXT, stageOf, gradesFromText, isTeachingTitle, matchTeaching, missingProfile, payLabel, readTerms, requiresFromText, subjectFromText, termsFromPosting, type TeacherProfile, type TeachingListing } from "./domain";

const teacher: TeacherProfile = { subjects: ["Physics", "Mathematics"], grades: ["secondary", "senior"], boards: ["CBSE"], qualifications: ["B.Ed"], languages: ["English"] };
const listing = (over: Partial<TeachingListing> = {}): TeachingListing => ({ id: "x", origin: "outside", title: "PGT Physics Teacher", company: "DPS", location: "Pune", workMode: "onsite", terms: { currency: "INR", subject: "Physics", grades: ["senior"], boards: ["CBSE"], requires: ["B.Ed"] }, termsFrom: "posting", description: "", sourceId: "s", sourceName: "S", ...over });

describe("Teaching: reading an outside posting states only what it says", () => {
  it("subject, grades, board and qualifications come from its own words", () => {
    expect(subjectFromText("PGT Physics Teacher")).toBe("Physics");
    expect(subjectFromText("Teacher", "We need a Maths teacher")).toBe("Mathematics");
    expect(subjectFromText("Class Teacher")).toBeUndefined();
    expect(gradesFromText("PGT Physics, classes 11 and 12")).toEqual(["senior"]);
    expect(gradesFromText("PRT for nursery and KG")).toEqual(["pre_primary", "primary"]);
    expect(gradesFromText("High School Math Teacher")).toEqual(["secondary"]);
    expect(gradesFromText("Assistant Professor of English")).toEqual(["college"]);
    expect(gradesFromText("Teacher")).toEqual([]);
    expect(boardsFromText("A CBSE and IGCSE school")).toEqual(["CBSE", "Cambridge"]);
    expect(requiresFromText("B.Ed and CTET qualified; UGC NET preferred")).toEqual(["B.Ed", "CTET", "UGC NET"]);
    expect(requiresFromText("Bachelor's in education")).toEqual([]);
  });

  it("a teaching post says so in its title; sales roles at schools aren't one", () => {
    expect(isTeachingTitle("TGT English")).toBe(true);
    expect(isTeachingTitle("Online Math Tutor")).toBe(true);
    expect(isTeachingTitle("Admissions Counsellor")).toBe(false);
    expect(isTeachingTitle("Software Engineer")).toBe(false);
  });

  it("pay is the posting's own, a month; none stated stays unstated", () => {
    expect(termsFromPosting({ title: "Physics Teacher", description: "", payMin: 360000, payMax: 480000 })).toMatchObject({ subject: "Physics", payMin: 30000, payMax: 40000, payPer: "month" });
    const none = termsFromPosting({ title: "Physics Teacher", description: "" });
    expect(none.payMin).toBeUndefined();
    expect(payLabel(none)).toBe("Pay not stated");
    expect(payLabel({ currency: "INR", payMin: 500, payPer: "hour" })).toBe("₹500 an hour");
    expect(termsFromPosting({ title: "Home Tutor for Maths", description: "", jobType: "full_time" }).hours).toBe("tuition");
  });

  it("stored terms drop anything malformed", () => {
    expect(readTerms({ subject: " Physics ", grades: ["senior", "nope"], boards: ["CBSE", "X"], payMin: -1, payMax: 30000, hours: "weekly" })).toEqual({ currency: "INR", subject: "Physics", grades: ["senior"], boards: ["CBSE"], payMax: 30000 });
  });

  it("the teacher's words are asked as a teaching search", () => {
    expect(asTeachingQuery("physics")).toBe("physics teacher");
    expect(asTeachingQuery("maths tutor")).toBe("maths tutor");
  });
});

describe("Teaching: the teacher's profile and what fits", () => {
  it("asks for subjects and grade levels; nothing else is required", () => {
    expect(missingProfile(null)).toEqual(["subjects", "grade levels"]);
    expect(cleanProfile({ subjects: [], grades: ["senior"] })).toEqual({ problem: "Add the subjects you teach." });
    expect(cleanProfile({ subjects: ["Physics"], grades: ["x"] })).toEqual({ problem: "Choose the grade levels you teach." });
    expect(cleanProfile({ subjects: [" Physics ", "Physics"], grades: ["senior"], boards: ["CBSE", "Nope"] })).toEqual({ value: { subjects: ["Physics"], grades: ["senior"], boards: ["CBSE"], qualifications: [], languages: [] } });
  });

  it("every signal is from the posting and the profile, and says why", () => {
    const m = matchTeaching(listing(), teacher);
    expect(m.fit).toBe("strong");
    expect(m.signals.map((s) => s.text)).toEqual(["Physics — a subject you teach", "Senior secondary — levels you teach", "CBSE — a board you know", "Asks for B.Ed — you hold it"]);
    const off = matchTeaching(listing({ title: "PRT English", terms: { currency: "INR", subject: "English", grades: ["primary"], requires: ["CTET"] } }), teacher);
    expect(off.fit).toBe("some");
    expect(off.signals.every((s) => s.tone === "bad")).toBe(true);
    expect(matchTeaching(listing({ terms: { currency: "INR" } }), teacher)).toEqual({ fit: "unknown", signals: [] });
    expect(matchTeaching(listing(), null).fit).toBe("unknown");
  });

  it("Refine leaves out what doesn't state the term filtered on", () => {
    const a = listing({ id: "a" });
    const b = listing({ id: "b", workMode: "remote", terms: { currency: "INR", hours: "tuition" } });
    expect(applyFacets([a, b], { grade: "senior" })).toEqual({ kept: [a], hidden: 1 });
    expect(applyFacets([a, b], { board: "CBSE" }).kept).toEqual([a]);
    expect(applyFacets([a, b], { hours: "tuition", remoteOnly: true }).kept).toEqual([b]);
  });
});

describe("Teaching: a school's opening and an application's moves", () => {
  const form = { title: "PGT Physics", description: "Teach physics to classes 11 and 12 with lab sessions twice a week.", location: "Pune", workMode: "onsite", subject: "Physics", grades: ["senior"], hours: "full_time" };
  it("subject, grade levels, hours and where are required; pay is the school's to state", () => {
    expect(cleanPosting({ ...form, subject: "" })).toEqual({ problem: "Give the subject." });
    expect(cleanPosting({ ...form, grades: ["nope"] })).toEqual({ problem: "Choose the grade levels." });
    expect(cleanPosting({ ...form, location: "" })).toEqual({ problem: "Say where the teacher will work." });
    expect(cleanPosting({ ...form, payMin: 50000, payMax: 40000 })).toEqual({ problem: "The pay's upper end is below its lower end." });
    expect(cleanPosting(form)).toEqual({ value: { title: "PGT Physics", description: form.description, location: "Pune", workMode: "onsite", terms: { currency: "INR", subject: "Physics", grades: ["senior"], hours: "full_time" } } });
    // Demo class is the school's own explicit choice, off unless it says so.
    expect(cleanPosting({ ...form, demo: true })).toMatchObject({ value: { terms: { demo: true } } });
    expect(cleanPosting({ ...form, demo: "yes" })).toMatchObject({ value: { terms: { currency: "INR" } } });
    expect("value" in cleanPosting({ ...form, demo: "yes" }) && (cleanPosting({ ...form, demo: "yes" }) as { value: { terms: { demo?: boolean } } }).value.terms.demo).toBeUndefined();
    expect(readTerms({ demo: true }).demo).toBe(true);
    expect(readTerms({ demo: "true" }).demo).toBeUndefined();
    expect(cleanPosting({ ...form, workMode: "remote", location: "", payMin: 500, currency: "INR", payPer: "hour" })).toMatchObject({ value: { location: "Online", terms: { payMin: 500, payPer: "hour" } } });
  });

  it("a school appoints or closes; a demo class comes only from booking one; the teacher withdraws while it's open", () => {
    expect(COMPANY_NEXT.applied).toEqual(["appointed", "closed"]);
    expect(Object.values(COMPANY_NEXT).flat()).not.toContain("demo_class");
    expect(COMPANY_NEXT.appointed).toEqual([]);
    expect(canWithdraw("demo_class")).toBe(true);
    expect(canWithdraw("appointed")).toBe(false);
    // Pipeline is generic: a demo class (WonderWorks-only) stays under Applied, as a status.
    expect(["applied", "demo_class", "appointed", "closed", "withdrawn"].map((s) => stageOf(s as never))).toEqual(["applied", "applied", "appointed_closed", "appointed_closed", "appointed_closed"]);
    expect(teachingManifest.pipeline.stages.map((s) => s.label)).toEqual(["Preparing", "Applied", "Appointed / Closed"]);
  });
});

describe("Teaching: demo-class times", () => {
  const now = Date.parse("2026-11-01T00:00:00Z");
  const at = (h: number) => new Date(now + h * 3_600_000).toISOString();
  it("1–5 future times, 15–180 minutes, online or in person with a place; sorted; no duplicates", () => {
    expect(cleanSlots([], now)).toEqual({ problem: "Offer at least one time." });
    expect(cleanSlots(Array.from({ length: 6 }, (_, i) => ({ startsAt: at(i + 1), durationMin: 45, mode: "online" })), now)).toEqual({ problem: "Offer at most 5 times." });
    expect(cleanSlots([{ startsAt: at(-1), durationMin: 45, mode: "online" }], now)).toEqual({ problem: "Each time should be in the future." });
    expect(cleanSlots([{ startsAt: at(1), durationMin: 5, mode: "online" }], now)).toEqual({ problem: "A demo class runs 15 to 180 minutes." });
    expect(cleanSlots([{ startsAt: at(1), durationMin: 45, mode: "in_person" }], now)).toEqual({ problem: "Say where the demo class is." });
    expect(cleanSlots([{ startsAt: at(2), durationMin: 45, mode: "online" }, { startsAt: at(2), durationMin: 45, mode: "online" }], now)).toEqual({ problem: "Two of the times are the same." });
    const ok = cleanSlots([{ startsAt: at(5), durationMin: 45, mode: "online" }, { startsAt: at(2), durationMin: 60, mode: "in_person", location: "Room 4" }], now);
    expect("value" in ok && ok.value.map((x) => x.startsAt)).toEqual([at(2), at(5)]);
  });

  it("only the teacher requests; only the school confirms, declines or marks held; one key per application and teacher", () => {
    expect(TEACHER_MAY.proposed).toEqual(["request"]);
    expect(Object.values(SCHOOL_MAY).flat()).not.toContain("requested");
    expect(SCHOOL_MAY.requested).toEqual(["confirmed", "declined"]);
    expect(SCHOOL_MAY.proposed).toEqual(["cancelled"]);
    expect(demoKey("rsp_1", "u-1")).toBe("demo:rsp_1:u-1");
  });
});
