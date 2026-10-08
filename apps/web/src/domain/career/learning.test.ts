import { describe, expect, it } from "vitest";
import { computeLearnedSignals, learnedRankingEffect, type InteractionRecord, type RejectionRecord } from "./learning";

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

  it("a rejection with no reason (and no title or employer recorded) never contributes to any signal", () => {
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

function interactions(n: number, patch: Partial<InteractionRecord>): InteractionRecord[] {
  return Array.from({ length: n }, (_, i) => ({ jobId: `saved-${i}`, at: at(n - i), kind: "saved" as const, industry: "Security", workMode: "remote" as const, title: "Identity Governance Lead", company: `Co ${i}`, ...patch }));
}

describe("progressive learning — what the candidate keeps choosing, turning down and searching", () => {
  const job = { industry: "Security", workMode: "remote" as const, seniority: "senior" as const, title: "Director, Identity Governance", company: "Acme", location: "Singapore" };

  it("saves and applications teach a preference only after the same threshold", () => {
    expect(computeLearnedSignals([], new Set(), { interactions: interactions(2, {}) })).toEqual([]);
    const ids = computeLearnedSignals([], new Set(), { interactions: interactions(3, {}) }).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["prefer_industry:security", "prefer_work_mode:remote", "prefer_title_term:identity", "prefer_title_term:governance"]));
    expect(ids).not.toContain("prefer_title_term:lead"); // level words say nothing about the work
  });

  it("doesn't learn what the candidate already put in their preferences", () => {
    const ids = computeLearnedSignals([], new Set(), { interactions: interactions(3, {}), dna: { industries: ["security"], workModes: ["remote"], preferredLocations: [] } }).map((s) => s.id);
    expect(ids).not.toContain("prefer_industry:security");
    expect(ids).not.toContain("prefer_work_mode:remote");
  });

  it("a preference ranks matching roles higher, bounded, and more with more evidence", () => {
    const few = computeLearnedSignals([], new Set(), { interactions: interactions(3, {}) });
    const many = computeLearnedSignals([], new Set(), { interactions: interactions(8, {}) });
    const a = learnedRankingEffect(job, "senior", few);
    const b = learnedRankingEffect(job, "senior", many);
    expect(a.points).toBeLessThan(0);
    expect(b.points).toBeLessThan(a.points);
    expect(b.points).toBeGreaterThanOrEqual(-8);
    expect(b.note).toBe("Like roles you've saved or applied to");
    expect(learnedRankingEffect({ ...job, industry: "Retail", workMode: "onsite", title: "Store manager" }, "senior", many)).toEqual({ points: 0 });
  });

  it("turning down the same title words or employer ranks them lower, unless they're also chosen", () => {
    const turned = rejections(3, { reason: undefined, title: "Sales Development Representative" }).map((r, i) => ({ ...r, company: `C${i}` }));
    const ids = computeLearnedSignals(turned).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["avoid_title_term:sales"]));
    const signals = computeLearnedSignals(turned);
    expect(learnedRankingEffect({ ...job, title: "Sales Director" }, "senior", signals).points).toBeGreaterThan(0);
    const alsoChosen = computeLearnedSignals(turned, new Set(), { interactions: interactions(3, { title: "Sales Engineer" }) }).map((s) => s.id);
    expect(alsoChosen).not.toContain("avoid_title_term:sales");
    const acme = rejections(2, { reason: "not_interested", company: "Acme" });
    expect(computeLearnedSignals(acme).map((s) => s.id)).toContain("avoid_company:acme");
    expect(learnedRankingEffect(job, "senior", computeLearnedSignals(acme)).points).toBe(12);
  });

  it("places typed into searches three times rank roles there higher", () => {
    const searches = [1, 2, 3].map((d) => ({ at: at(d), locations: ["Singapore"] }));
    const signals = computeLearnedSignals([], new Set(), { searches });
    expect(signals.map((s) => s.id)).toEqual(["prefer_location:singapore"]);
    expect(learnedRankingEffect(job, "senior", signals)).toMatchObject({ note: "Where you often search" });
    expect(computeLearnedSignals([], new Set(), { searches, dna: { industries: [], workModes: [], preferredLocations: ["Singapore"] } })).toEqual([]);
  });

  it("an avoid and a preference never stack: the strongest avoid wins over small boosts", () => {
    const signals = [...computeLearnedSignals(rejections(2, { reason: "other", company: "Acme" })), ...computeLearnedSignals([], new Set(), { interactions: interactions(3, {}) })];
    const e = learnedRankingEffect(job, "senior", signals);
    expect(e.points).toBeGreaterThan(0);
    expect(e.note).toBe("Similar to roles you've marked not for me");
  });

  it("confirmed and dismissed choices survive recomputing", () => {
    const list = interactions(3, {});
    expect(computeLearnedSignals([], new Set(), { interactions: list, confirmed: new Set(["prefer_industry:security"]) }).find((s) => s.id === "prefer_industry:security")?.status).toBe("confirmed");
    expect(computeLearnedSignals([], new Set(["prefer_industry:security"]), { interactions: list }).map((s) => s.id)).not.toContain("prefer_industry:security");
  });
});
