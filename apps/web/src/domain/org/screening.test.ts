import { describe, expect, it } from "vitest";
import { cleanAnswers, cleanQuestions, normalizeYesNo, QUESTION_PRESETS, sameQuestion, savedAnswer, unmetMustHaves, type ScreeningQuestion } from "./screening";
import { applicantFit, cleanApplicantProfile, cleanReview, summarizeReviews } from "./review";

const q = (over: Partial<ScreeningQuestion>): ScreeningQuestion => ({ id: "q_x", kind: "text", prompt: "Anything else?", required: false, ...over });

describe("screening questions", () => {
  it("a must-have is always required; a must-have that doesn't fit the kind is refused", () => {
    const r = cleanQuestions([{ id: "q_years", kind: "number", prompt: "Years of experience?", mustHave: { min: 3 } }]);
    expect(r).toEqual({ questions: [{ id: "q_years", kind: "number", prompt: "Years of experience?", required: true, mustHave: { min: 3 }, profileKey: "yearsExperience" }] });
    expect(cleanQuestions([{ kind: "text", prompt: "Why us, briefly?", mustHave: { equals: "yes" } }])).toMatchObject({ problem: expect.stringMatching(/must-have/) });
    expect(cleanQuestions([{ kind: "yes_no", prompt: "Relocate?" }, { kind: "yes_no", prompt: "Relocate?" }])).toMatchObject({ problem: expect.stringMatching(/twice/) });
  });

  it("answers are normalised: Yes/No, numbers; optional ones may be blank", () => {
    const qs = [q({ id: "q_a", kind: "yes_no", required: true }), q({ id: "q_b", kind: "number" }), q({ id: "q_c" })];
    expect(cleanAnswers(qs, { q_a: "Yes, I am", q_b: "4.5" })).toEqual({ answers: { q_a: "yes", q_b: "4.5" } });
    expect(cleanAnswers(qs, { q_b: "4" })).toMatchObject({ questionId: "q_a" });
    expect(cleanAnswers(qs, { q_a: "no", q_b: "lots" })).toMatchObject({ questionId: "q_b" });
    expect(normalizeYesNo("Not authorised")).toBe("no");
    expect(normalizeYesNo("perhaps")).toBeNull();
  });

  it("names the must-haves an application doesn't meet, an unanswered one included", () => {
    const qs = [q({ id: "q_a", kind: "yes_no", prompt: "Allowed to work?", mustHave: { equals: "yes" } }), q({ id: "q_b", kind: "number", prompt: "Years?", mustHave: { min: 5 } })];
    expect(unmetMustHaves(qs, { q_a: "yes", q_b: "5" })).toEqual([]);
    expect(unmetMustHaves(qs, { q_a: "no" })).toEqual(["Allowed to work?", "Years?"]);
  });

  it("fills an answer from what the candidate saved: their Application answers, a reworded question, or their profile", () => {
    const work = QUESTION_PRESETS.find((p) => p.id === "q_work_auth")!;
    const years = QUESTION_PRESETS.find((p) => p.id === "q_years")!;
    const memory = [{ key: "workAuthorization" as const, value: "Yes" }, { key: "custom" as const, question: "Why do you want to join us?", value: "The product." }];
    expect(savedAnswer(work, { memory })).toBe("yes");
    expect(savedAnswer(years, { memory, yearsExperience: 6 })).toBe("6");
    expect(savedAnswer(years, { memory })).toBeUndefined();
    expect(savedAnswer(q({ prompt: "Why do you want to join us?" }), { memory })).toBe("The product.");
    expect(sameQuestion("Why do you want to join us?", "What is your notice period?")).toBe(false);
  });
});

describe("reviewing applicants", () => {
  it("a review is a recommendation, a note or both", () => {
    expect(cleanReview({ recommendation: "yes" })).toEqual({ recommendation: "yes", note: "" });
    expect(cleanReview({ note: "  ok " })).toEqual({ note: "ok" });
    expect(cleanReview({ recommendation: "maybe" })).toMatchObject({ problem: expect.any(String) });
    expect(cleanReview({})).toMatchObject({ problem: expect.any(String) });
  });

  it("tallies each person's latest recommendation once, and says when the team is split", () => {
    const r = (author: string, recommendation: "yes" | "no" | "strong_no", at: string) => ({ id: at, applicationId: "a", authorTenant: author, authorName: author, recommendation, note: "", createdAt: at });
    expect(summarizeReviews([r("a", "no", "1"), r("a", "yes", "2"), r("b", "strong_no", "3")])).toMatchObject({ total: 2, leaning: "split", counts: { yes: 1, strong_no: 1, no: 0 } });
    expect(summarizeReviews([])).toMatchObject({ total: 0, leaning: null });
  });

  it("fit is the job's skills the applicant shared; nothing to compare gives no fit", () => {
    expect(applicantFit(["React", "Go"], { skills: ["react.js"] })).toEqual({ matched: ["React"], missing: ["Go"] });
    expect(applicantFit([], { skills: ["x"] })).toBeNull();
    expect(applicantFit(["Go"], undefined)).toBeNull();
    expect(cleanApplicantProfile({ skills: [], headline: "" })).toBeUndefined();
    expect(cleanApplicantProfile({ skills: ["Go"], yearsExperience: 99 })).toEqual({ skills: ["Go"] });
  });
});
