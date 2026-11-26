import { describe, expect, it } from "vitest";
import { answersSearch, relevance } from "./relevance";

const post = (over: Partial<Parameters<typeof relevance>[0]>) => ({ title: "", company: "Co", location: "Mumbai, India", skills: [], tags: [], requirements: [], description: "", ...over });

describe("relevance to what the candidate typed", () => {
  it("finds another form of the word — the reported case: 'psychology' showed nothing", () => {
    expect(answersSearch(post({ title: "Clinical Psychologist" }), "psychology")).toBe(true);
    expect(answersSearch(post({ title: "Counselling Psychology Associate" }), "psychologist")).toBe(true);
    expect(answersSearch(post({ title: "Staff Software Engineer" }), "psychology")).toBe(false);
  });

  it("ranks a title match above a skill match above a description mention", () => {
    const title = relevance(post({ title: "Data Analyst" }), "data analyst").score;
    const skills = relevance(post({ title: "Business Associate", skills: ["Data", "Analyst"] }), "data analyst").score;
    const body = relevance(post({ title: "Associate", description: "You will work with a data analyst." }), "data analyst").score;
    expect(title).toBeGreaterThan(skills);
    expect(skills).toBeGreaterThan(body);
    expect(body).toBeGreaterThan(0);
  });

  it("forgives a typo in a longer word, and counts level words lightly", () => {
    expect(answersSearch(post({ title: "Clinical Psychologist" }), "pyschologist")).toBe(true);
    expect(answersSearch(post({ title: "Product Manager" }), "senior product manager")).toBe(true);
    expect(relevance(post({ title: "Senior Product Manager" }), "senior product manager").score).toBeGreaterThan(relevance(post({ title: "Product Manager" }), "senior product manager").score);
  });

  it("needs every field word, and keeps different words apart (production ≠ product)", () => {
    expect(answersSearch(post({ title: "Production Supervisor" }), "product")).toBe(false);
    expect(answersSearch(post({ title: "Identity Engineer" }), "identity psychology")).toBe(false);
    expect(answersSearch(post({ title: "Engineer", company: "Canonical", location: "Remote" }), "canonical")).toBe(true);
  });
});

describe("perks don't place a job in a field", () => {
  const j = { title: "Operations Lead", company: "Co", location: "Remote", skills: [], tags: [], requirements: [] };
  it("health, dental & vision or group insurance coverage aren't the insurance field", async () => {
    const { relevance } = await import("./relevance");
    for (const d of ["We offer health insurance.", "Medical, dental & vision insurance.", "Group insurance coverage included.", "Insurance benefits from day one."]) expect(relevance({ ...j, description: d }, "insurance operations").complete).toBe(false);
    expect(relevance({ ...j, description: "We are a life insurance company." }, "insurance operations")).toMatchObject({ complete: true, onlyInBody: ["insurance"] });
  });
});
