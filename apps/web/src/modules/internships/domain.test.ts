import { describe, expect, it } from "vitest";
import { applyFacets, cleanPosting, deadlines, durationFromText, matchInternship, missingProfile, monthlyFromYearly, profileFromCareer, stageOf, stipendLabel, type InternshipListing } from "./domain";

const listing = (over: Partial<InternshipListing> = {}): InternshipListing => ({ id: "x", origin: "outside", title: "React Developer Intern", company: "Acme", location: "Pune", workMode: "hybrid", terms: { currency: "INR" }, termsFrom: "posting", skills: ["React", "TypeScript"], description: "Build UI.", sourceId: "intern_remotive", sourceName: "Remotive internships", ...over });

describe("Internships domain", () => {
  it("states only what a posting says: stipend a month, or 'not stated'", () => {
    expect(stipendLabel({ currency: "INR" })).toBe("Stipend not stated");
    expect(stipendLabel({ currency: "INR", stipendMin: 0 })).toBe("Unpaid");
    expect(stipendLabel({ currency: "INR", stipendMin: 15000, stipendMax: 20000 })).toBe("₹15,000–₹20,000 a month");
    expect(monthlyFromYearly(120000, undefined, "INR")).toEqual({ currency: "INR", stipendMin: 10000 });
    expect(monthlyFromYearly(undefined, undefined, "USD")).toEqual({ currency: "USD" });
    expect(durationFromText("Summer Intern (12 weeks)")).toBe(3);
    expect(durationFromText("6-month internship")).toBe(6);
    expect(durationFromText("Intern, Product")).toBeUndefined();
  });

  it("a company's posting needs every term", () => {
    const ok = cleanPosting({ title: "Data Intern", description: "Clean data, build dashboards and learn SQL with our analysts.", workMode: "remote", schedule: "part_time", currency: "INR", stipendMin: 0, durationMonths: 2, startsOn: "2099-02-01", applyBy: "2099-01-15" }, "2099-01-01");
    expect(ok).toMatchObject({ value: { location: "Remote", terms: { stipendMin: 0, durationMonths: 2, schedule: "part_time" } } });
    expect(cleanPosting({ title: "Data Intern", description: "x".repeat(40), workMode: "onsite", schedule: "part_time", currency: "INR", stipendMin: 0, durationMonths: 2, startsOn: "2099-02-01", applyBy: "2099-01-15" }, "2099-01-01")).toEqual({ problem: "Say where the intern will work." });
  });

  it("match signals say why, from skills, field and dates; an unstated term gives none", () => {
    const p = { college: "COEP", course: "B.Tech Computer Science", graduationYear: 2027, availableFrom: "2027-01-01", availableTo: "2027-06-30" };
    const inside = matchInternship(listing({ terms: { currency: "INR", startsOn: "2027-02-01", durationMonths: 3 } }), p, ["React", "Python"]);
    expect(inside.signals.map((s) => s.text)).toEqual(["Asks for React — on your profile", "Starts 1 Feb 2027 and ends 1 May 2027, inside your availability"]);
    expect(inside.fit).toBe("strong");
    const late = matchInternship(listing({ terms: { currency: "INR", startsOn: "2027-05-01", durationMonths: 6 } }), p, []);
    expect(late.signals).toEqual([{ tone: "bad", text: "Runs to 1 Nov 2027, past your availability (30 Jun 2027)" }]);
    expect(matchInternship(listing({ skills: [], title: "Intern" }), undefined, []).fit).toBe("unknown");
  });

  it("Refine: stipend, duration, start month, remote — a posting that doesn't state a term is left out of that facet", () => {
    const a = listing({ id: "a", workMode: "remote", terms: { currency: "INR", stipendMin: 20000, durationMonths: 3, startsOn: "2027-01-10" } });
    const b = listing({ id: "b", terms: { currency: "INR" } });
    expect(applyFacets([a, b], { minStipend: 10000 })).toEqual({ kept: [a], hidden: 1 });
    expect(applyFacets([a, b], { maxMonths: 2 }).kept).toEqual([]);
    expect(applyFacets([a, b], { startMonth: "2027-01", remoteOnly: true }).kept).toEqual([a]);
    expect(applyFacets([a, b], {}).hidden).toBe(0);
  });

  it("prefills college, course and year from the Career Profile's education; availability is asked", () => {
    const p = profileFromCareer({ history: { contact: {}, experience: [], education: [{ id: "e", institution: "IIT Bombay", degree: "B.Tech", field: "Mechanical", endDate: "2027", provenance: "USER_PROVIDED" as never }], certifications: [], projects: [], publications: [], researchInterests: [] } } as never);
    expect(p).toEqual({ college: "IIT Bombay", course: "B.Tech Mechanical", graduationYear: 2027, from: "career_profile" });
    expect(missingProfile(p)).toEqual(["availability"]);
    expect(profileFromCareer(undefined)).toEqual({ college: "", course: "" });
  });

  it("stages and deadlines", () => {
    expect(["applied", "shortlisted", "offer", "accepted", "closed", "withdrawn"].map((s) => stageOf(s as never))).toEqual(["applied", "shortlisted", "offer", "accepted_closed", "accepted_closed", "accepted_closed"]);
    const saved = [listing({ id: "ws_l1", title: "A", terms: { currency: "INR", applyBy: "2099-01-05" } }), listing({ id: "ws_l2", title: "B", terms: { currency: "INR", applyBy: "2099-01-01" } })];
    const mine = [{ id: "r1", postingId: "l1", title: "A", company: "Acme", status: "applied" as const, terms: { currency: "INR" }, appliedAt: "", updatedAt: "2099-01-01T00:00:00Z" }];
    expect(deadlines(saved, mine, "2098-12-01").map((d) => d.title)).toEqual(["B"]);
  });
});
