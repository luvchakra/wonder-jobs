import { describe, expect, it } from "vitest";
import { computeLearnedSignals, learnedRankingEffect, type RejectionRecord } from "./learning";

/**
 * Learning evaluation (spec §35): fixtures proving the "not for me" signal requires real evidence
 * before it changes anything, and never changes anything silently once it does.
 */

const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

function rejections(n: number, patch: Partial<RejectionRecord>): RejectionRecord[] {
  return Array.from({ length: n }, (_, i) => ({ jobId: `job-${i}`, at: at(n - i), industry: "Fintech", workMode: "remote", ...patch }));
}

describe("computeLearnedSignals — over-learning guard", () => {
  it("a single rejection, with a reason, causes no major change (spec §35)", () => {
    const records = rejections(1, { reason: "too_junior" });
    expect(computeLearnedSignals(records)).toEqual([]);
  });

  it("two rejections of the same pattern still don't cross the threshold", () => {
    const records = rejections(2, { reason: "wrong_industry", industry: "Gaming" });
    expect(computeLearnedSignals(records)).toEqual([]);
  });

  it("a rejection with no reason never contributes to any signal, however many accumulate", () => {
    const records = rejections(10, { reason: undefined });
    expect(computeLearnedSignals(records)).toEqual([]);
  });
});

describe("computeLearnedSignals — evidence produces a signal", () => {
  it("three same-industry rejections surface an avoid_industry signal", () => {
    const records = rejections(3, { reason: "wrong_industry", industry: "Gaming" });
    const signals = computeLearnedSignals(records);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: "avoid_industry", value: "Gaming", signalCount: 3, status: "suggested" });
  });

  it("three same-work-mode rejections surface an avoid_work_mode signal", () => {
    const records = rejections(3, { reason: "wrong_work_mode", workMode: "onsite" });
    const signals = computeLearnedSignals(records);
    expect(signals[0]).toMatchObject({ kind: "avoid_work_mode", value: "onsite" });
  });

  it("three 'too senior' rejections surface a prefer_lower_seniority signal", () => {
    const signals = computeLearnedSignals(rejections(3, { reason: "too_senior" }));
    expect(signals[0].kind).toBe("prefer_lower_seniority");
  });

  it("three 'too junior' rejections surface a prefer_higher_seniority signal", () => {
    const signals = computeLearnedSignals(rejections(3, { reason: "too_junior" }));
    expect(signals[0].kind).toBe("prefer_higher_seniority");
  });

  it("confidence rises with more evidence, deterministically", () => {
    expect(computeLearnedSignals(rejections(3, { reason: "wrong_industry", industry: "Gaming" }))[0].confidence).toBe("low");
    expect(computeLearnedSignals(rejections(5, { reason: "wrong_industry", industry: "Gaming" }))[0].confidence).toBe("medium");
    expect(computeLearnedSignals(rejections(8, { reason: "wrong_industry", industry: "Gaming" }))[0].confidence).toBe("high");
  });

  it("different industries never merge into one signal", () => {
    const records = [...rejections(3, { reason: "wrong_industry", industry: "Gaming" }), ...rejections(3, { reason: "wrong_industry", industry: "Media" })];
    const signals = computeLearnedSignals(records);
    expect(signals.map((s) => s.value).sort()).toEqual(["Gaming", "Media"]);
  });

  it("evidence text names the pattern in plain language, for the review surface", () => {
    const signals = computeLearnedSignals(rejections(4, { reason: "wrong_industry", industry: "Gaming" }));
    expect(signals[0].evidence).toMatch(/4 gaming roles/i);
  });
});

describe("computeLearnedSignals — dismissal and undo", () => {
  it("a dismissed signal id never resurfaces, even with more evidence", () => {
    const records = rejections(5, { reason: "wrong_industry", industry: "Gaming" });
    const dismissed = new Set(["avoid_industry:gaming"]);
    expect(computeLearnedSignals(records, dismissed)).toEqual([]);
  });

  it("removing rejections (undo) can drop a signal back below threshold", () => {
    const all = rejections(3, { reason: "wrong_industry", industry: "Gaming" });
    expect(computeLearnedSignals(all)).toHaveLength(1);
    const afterUndo = all.slice(1); // one job's rejection cleared
    expect(computeLearnedSignals(afterUndo)).toEqual([]);
  });
});

describe("learnedRankingEffect — bounded, never silent, never absolute", () => {
  const job = { industry: "Gaming", workMode: "onsite" as const, seniority: "director" as const };

  it("no effect with no signals", () => {
    expect(learnedRankingEffect(job, "senior", [])).toEqual({ points: 0 });
  });

  it("applies a bounded penalty for a matching industry signal, never an outright exclusion", () => {
    const signals = computeLearnedSignals(rejections(4, { reason: "wrong_industry", industry: "Gaming" }));
    const effect = learnedRankingEffect(job, "senior", signals);
    expect(effect.points).toBeGreaterThan(0);
    expect(effect.points).toBeLessThan(20); // bounded — a nudge, not a veto
    expect(effect.note).toBeTruthy();
  });

  it("does not apply to a job that doesn't match the learned pattern", () => {
    const signals = computeLearnedSignals(rejections(4, { reason: "wrong_industry", industry: "Media" }));
    expect(learnedRankingEffect(job, "senior", signals)).toEqual({ points: 0 });
  });

  it("a dismissed status never applies", () => {
    const signals = computeLearnedSignals(rejections(4, { reason: "wrong_industry", industry: "Gaming" })).map((s) => ({ ...s, status: "dismissed" as const }));
    expect(learnedRankingEffect(job, "senior", signals)).toEqual({ points: 0 });
  });

  it("prefer_lower_seniority only penalizes roles more senior than the candidate's own level", () => {
    const signals = computeLearnedSignals(rejections(4, { reason: "too_senior" }));
    expect(learnedRankingEffect({ ...job, seniority: "director" }, "senior", signals).points).toBeGreaterThan(0);
    expect(learnedRankingEffect({ ...job, seniority: "senior" }, "senior", signals).points).toBe(0);
    expect(learnedRankingEffect({ ...job, seniority: "junior" }, "senior", signals).points).toBe(0);
  });
});
