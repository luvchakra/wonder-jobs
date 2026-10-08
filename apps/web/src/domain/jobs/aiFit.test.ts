import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_DNA } from "@/domain/career/types";
import type { JobMatch, JobQuality } from "./types";
import { AI_LABEL, AI_QUALITY_LABEL, blendAiFit, blendAiQuality, checkedFlags, profileKey } from "./aiFit";
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
    expect(await aiRankJobs({ profile: {}, jobs: [job("a"), job("b")] })).toEqual([{ id: "a", score: 92, reason: "Fits.", flags: [] }]);
    setAssistModelForTests(async () => JSON.stringify({ scores: [{ id: "a", score: 140, reason: "Too high." }] }));
    expect(await aiRankJobs({ profile: {}, jobs: [job("a")] })).toBeNull();
  });
});

describe("posting warning signs — the app's words, the posting's own quote as proof", () => {
  const posting = "Join our team! A one-time registration fee of $50 is required. Contact us on WhatsApp.";
  it("keeps only known flags whose quote is really in the posting", () => {
    expect(
      checkedFlags(
        [
          { flag: "fee_to_apply", quote: "registration  fee of $50" },
          { flag: "off_platform_contact", quote: "Telegram only" },
          { flag: "made_up", quote: "Join our team" },
          { flag: "fee_to_apply", quote: "one-time registration" },
        ],
        posting,
      ),
    ).toEqual([{ flag: "fee_to_apply", quote: "registration fee of $50" }]);
  });

  const quality: JobQuality = { jobId: "j1", confidence: "high", summary: "The role is recent.", signals: [] };
  const fit = (flags: ReturnType<typeof checkedFlags> | undefined) => ({ score: 50, reason: "", profile: "p", at: "", flags });
  it("a strong sign makes hiring confidence low and is shown as AI's", () => {
    const q = blendAiQuality(quality, fit([{ flag: "fee_to_apply", quote: "registration fee of $50" }]));
    expect(q.confidence).toBe("low");
    expect(q.signals.at(-1)).toMatchObject({ key: "posting_content", label: AI_QUALITY_LABEL, sentiment: "caution" });
    expect(q.signals.at(-1)?.value).toContain("“registration fee of $50”");
  });
  it("nothing found never raises confidence; no AI read changes nothing", () => {
    const q = blendAiQuality({ ...quality, confidence: "moderate" }, fit([]));
    expect(q.confidence).toBe("moderate");
    expect(q.signals.at(-1)).toMatchObject({ value: "No warning signs found", sentiment: "neutral" });
    expect(blendAiQuality(quality, fit(undefined))).toEqual(quality);
    expect(blendAiQuality(quality, undefined)).toEqual(quality);
  });
});
