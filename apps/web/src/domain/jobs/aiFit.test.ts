import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_DNA } from "@/domain/career/types";
import type { JobMatch } from "./types";
import { AI_LABEL, blendAiFit, profileKey } from "./aiFit";
import { setAssistModelForTests } from "@/server/ai/assist";
import { aiRankJobs } from "@/server/ai/rank";

const match = (score: number): JobMatch => ({ jobId: "j1", score, fit: "worth_considering", reasons: [], highlights: [], computedAt: "2026-10-08T00:00:00Z" });
const dna = { ...EMPTY_DNA, careerGoal: "Director, identity and access management", headline: "IAM SME" };
const key = profileKey(dna);

describe("blendAiFit — the model nudges the rules' score within a band, visibly", () => {
  it("moves the score toward the AI read by at most +15 / −20, and says why", () => {
    const up = blendAiFit(match(60), { score: 100, reason: "Squarely an IAM director role.", profile: key, at: "" }, key);
    expect(up.score).toBe(75);
    expect(up.reasons.at(-1)).toMatchObject({ label: AI_LABEL, summary: "Squarely an IAM director role." });
    const down = blendAiFit(match(85), { score: 0, reason: "A sales role.", profile: key, at: "" }, key);
    expect(down.score).toBe(65);
    expect(down.fit).not.toBe("strong");
    expect(blendAiFit(match(60), { score: 70, reason: "Close.", profile: key, at: "" }, key).score).toBe(64);
  });
  it("ignores a read made against a different Career Profile", () => {
    const other = profileKey({ ...dna, careerGoal: "Product manager" });
    expect(other).not.toBe(key);
    expect(blendAiFit(match(60), { score: 100, reason: "x", profile: other, at: "" }, key)).toEqual(match(60));
    expect(blendAiFit(match(60), undefined, key)).toEqual(match(60));
  });
});

describe("aiRankJobs — only the postings it was given, scores clamped", () => {
  afterEach(() => setAssistModelForTests(null));
  const job = (id: string) => ({ id, title: "Director IAM", company: "Acme", location: "Mumbai", level: "director", excerpt: "Lead identity." });
  it("drops ids it wasn't given and rejects out-of-range scores", async () => {
    setAssistModelForTests(async () => JSON.stringify({ scores: [{ id: "a", score: 91.6, reason: "Fits." }, { id: "zzz", score: 99, reason: "Invented." }] }));
    expect(await aiRankJobs({ profile: {}, jobs: [job("a"), job("b")] })).toEqual([{ id: "a", score: 92, reason: "Fits." }]);
    setAssistModelForTests(async () => JSON.stringify({ scores: [{ id: "a", score: 140, reason: "Too high." }] }));
    expect(await aiRankJobs({ profile: {}, jobs: [job("a")] })).toBeNull();
  });
});
