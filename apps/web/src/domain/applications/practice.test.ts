import { describe, expect, it } from "vitest";
import { jsonIn, parseFlashcards, parseMockQuestion, parseMockReview, parseQuiz, practiceTrend, quizResult, withAttempt, type QuizQuestion } from "./practice";

const q = (i: number) => ({ q: `Question ${i}?`, options: ["A", "B", "C", "D"], answer: i % 4, why: "Because." });

describe("interview practice from the model is checked before it's used", () => {
  it("finds the JSON in a reply with fences or prose around it", () => {
    expect(jsonIn('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(jsonIn("no json")).toBeUndefined();
  });

  it("accepts a test only with ten questions of four distinct options and a valid answer", () => {
    const ten = Array.from({ length: 10 }, (_, i) => q(i));
    expect(parseQuiz(JSON.stringify({ questions: ten }))).toHaveLength(10);
    expect(parseQuiz(JSON.stringify({ questions: ten.slice(0, 9) }))).toBeNull();
    const bad = [...ten.slice(0, 9), { q: "Dup?", options: ["A", "a", "C", "D"], answer: 0 }, { q: "Out of range?", options: ["A", "B", "C", "D"], answer: 4 }];
    expect(parseQuiz(JSON.stringify({ questions: bad }))).toBeNull();
    expect(parseQuiz(JSON.stringify([...ten, q(11)]))).toHaveLength(10);
  });

  it("accepts twenty flashcards with a front and back", () => {
    const cards = Array.from({ length: 20 }, (_, i) => ({ front: `F${i}`, back: `B${i}` }));
    expect(parseFlashcards(JSON.stringify({ cards }))).toHaveLength(20);
    expect(parseFlashcards(JSON.stringify({ cards: [...cards.slice(0, 19), { front: "", back: "x" }] }))).toBeNull();
  });

  it("takes the interviewer's question as one clean line", () => {
    expect(parseMockQuestion('Interviewer: "Tell me about a time you led a migration."')).toBe("Tell me about a time you led a migration.");
    expect(parseMockQuestion("ok")).toBeNull();
  });

  it("accepts a review only with a 0–100 score, a summary and something to improve", () => {
    expect(parseMockReview('{"score": 72.4, "summary": "Solid.", "strengths": ["Clear"], "improvements": ["Add numbers"]}')).toEqual({ score: 72, summary: "Solid.", strengths: ["Clear"], improvements: ["Add numbers"] });
    expect(parseMockReview('{"score": 140, "summary": "x", "improvements": ["y"]}')).toBeNull();
    expect(parseMockReview('{"score": 50, "summary": "x", "improvements": []}')).toBeNull();
  });
});

describe("scoring and keeping practice", () => {
  const qs: QuizQuestion[] = Array.from({ length: 10 }, (_, i) => q(i));
  it("passes at 90% or more; a timed-out question counts as wrong", () => {
    const right = qs.map((x) => x.answer);
    expect(quizResult(right, qs)).toEqual({ score: 10, total: 10, passed: true });
    expect(quizResult([...right.slice(0, 9), null], qs)).toEqual({ score: 9, total: 10, passed: true });
    expect(quizResult([null, null, ...right.slice(2)], qs)).toEqual({ score: 8, total: 10, passed: false });
  });

  it("keeps attempts newest first and capped", () => {
    let p = withAttempt(undefined, {});
    for (let i = 0; i < 25; i++) p = withAttempt(p, { quiz: { id: `q${i}`, at: `2026-10-${String(i + 1).padStart(2, "0")}`, score: 5, total: 10, passed: false } });
    expect(p.quizzes).toHaveLength(20);
    expect(p.quizzes[0].id).toBe("q24");
  });

  it("trends test and mock scores across applications, oldest first", () => {
    const mock = (id: string, at: string, score: number) => ({ id, at, score, seconds: 300, questions: [], summary: "s", strengths: [], improvements: ["i"] });
    const t = practiceTrend([
      { id: "a1", job: { company: "Acme" }, practice: { quizzes: [{ id: "q1", at: "2026-10-02", score: 9, total: 10, passed: true }], mocks: [mock("m2", "2026-10-03", 70)] } },
      { id: "a2", job: { company: "Beta" }, practice: { quizzes: [{ id: "q2", at: "2026-10-01", score: 6, total: 10, passed: false }], mocks: [mock("m1", "2026-10-01", 55)] } },
      { id: "a3" },
    ]);
    expect(t.tests).toEqual([60, 90]);
    expect(t.testsPassed).toBe(1);
    expect(t.mocks).toEqual([55, 70]);
    expect(t.mockChange).toBe(15);
    expect(t.latest).toMatchObject({ id: "m2", applicationId: "a1", company: "Acme" });
  });
});
