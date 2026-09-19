import { describe, expect, it } from "vitest";
import { parseResume } from "./parseResume";

const RESUME = `Priya Raman
Senior Product Manager
Bengaluru, India · priya.raman@example.com · +91 98765 43210 · linkedin.com/in/priyaraman

SUMMARY
Product manager with 8 years of experience building payments and lending products for consumers and
small businesses in India. Owns roadmap, discovery and go-to-market end to end.

EXPERIENCE
Senior Product Manager, PayCircle (Fintech) — 2021 - Present
- Owned the roadmap for a wallet used by 4 million people; ran product discovery and user research.
- Built the analytics that the team trusted: SQL, Mixpanel, and a weekly metrics review.
- Ran A/B testing on onboarding and checkout; lifted activation 18%.
Product Manager, ShopStack (E-commerce) — 2018 - 2021
- Led marketplace payments and fraud workstreams with engineering and risk.
- Wrote PRDs, ran prioritization, and drove go-to-market with marketing.

SKILLS
Product Strategy, Roadmapping, Product Discovery, User Research, A/B Testing, Analytics, SQL,
Mixpanel, Figma, Stakeholder Management, Payments, Lending, Fraud, Prioritization

EDUCATION
B.Tech, Computer Science, 2014`;

describe("parseResume", () => {
  const draft = parseResume(RESUME);

  it("takes the name from the first line that isn't contact details or a heading", () => {
    expect(draft.name).toBe("Priya Raman");
  });

  it("takes the headline from the first line that reads like a job title", () => {
    expect(draft.headline).toBe("Senior Product Manager");
  });

  it("believes a stated number of years over guessing from dates", () => {
    expect(draft.yearsExperience).toBe(8);
    expect(draft.evidence.yearsExperience).toMatch(/8 years of experience/);
  });

  it("falls back to the earliest dated role when no number is stated", () => {
    const noStatement = RESUME.replace("8 years of experience", "experience");
    const years = parseResume(noStatement).yearsExperience!;
    expect(years).toBe(new Date().getFullYear() - 2018);
  });

  it("reads seniority from titles held, not from the whole document", () => {
    expect(draft.seniority).toBe("senior");
    // "reported to the director" is not a directorship.
    const mention = parseResume("Anita Rao\nProduct Analyst\nReported to the director of product for three years.\n" + RESUME.slice(RESUME.indexOf("SUMMARY")));
    expect(mention.seniority).not.toBe("director");
  });

  it("finds skills from the same lexicon used to read job postings, strongest first", () => {
    const names = draft.skills!.map((s) => s.name);
    expect(names).toContain("Payments");
    expect(names).toContain("SQL");
    expect(names).toContain("Analytics");
    expect(draft.skills!.length).toBeLessThanOrEqual(14);
    // Strength follows how often a skill actually runs through the resume.
    expect(draft.skills![0].level).toBeGreaterThanOrEqual(draft.skills!.at(-1)!.level);
    for (const s of draft.skills!) expect(s.level).toBeGreaterThanOrEqual(3);
  });

  it("suggests industries that exist in the product's own list", () => {
    expect(draft.industries).toContain("Fintech");
    expect(draft.industries!.length).toBeLessThanOrEqual(3);
  });

  it("suggests locations it can actually match against postings", () => {
    expect(draft.preferredLocations).toContain("Bengaluru");
  });

  it("records where every value came from", () => {
    for (const field of ["name", "headline", "yearsExperience", "seniority", "skills", "industries", "preferredLocations"] as const) {
      expect(draft.evidence[field], field).toBeTruthy();
    }
  });

  it("returns an empty draft rather than inventing one", () => {
    const empty = parseResume("");
    expect(empty.name).toBeUndefined();
    expect(empty.skills).toBeUndefined();
    expect(empty.evidence).toEqual({});
  });

  it("doesn't mistake an email or phone line for a name", () => {
    const draft2 = parseResume("priya.raman@example.com\n+91 98765 43210\nPriya Raman\nStaff Engineer\n");
    expect(draft2.name).toBe("Priya Raman");
    expect(draft2.seniority).toBe("lead");
  });
});
