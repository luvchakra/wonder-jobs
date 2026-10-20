import { describe, expect, it } from "vitest";
import { confidence } from "./confidence";
import { skillGaps } from "./gap";
import { certificationsAsked } from "./certifications";

describe("confidence", () => {
  it("is high when many jobs ask, plainly, and they're Strong matches", () => {
    expect(confidence({ jobs: 10, strong: 10, plain: 10 }, 20)).toMatchObject({ score: 99, level: "high" });
  });

  it("weighs how widely, how strongly and how plainly a skill is asked", () => {
    // A quarter of the jobs is full marks for demand (50); half Strong (12.5); half plain (12.5).
    expect(confidence({ jobs: 5, strong: 2.5, plain: 2.5 }, 20).score).toBe(75);
    // One job in twenty, none Strong, named only in passing: 10.
    expect(confidence({ jobs: 1, strong: 0, plain: 0 }, 20)).toMatchObject({ score: 10, level: "low" });
  });

  it("counts a broad skill for less and a growth area for a little more", () => {
    const base = { jobs: 4, strong: 2, plain: 4 };
    expect(confidence({ ...base, generic: true }, 16).score).toBeLessThan(confidence(base, 16).score);
    expect(confidence({ ...base, goal: true }, 16).score).toBe(confidence(base, 16).score + 10);
  });

  it("says what the score is made of", () => {
    expect(confidence({ jobs: 4, strong: 1, plain: 2, generic: true }, 16).parts).toEqual(["asked in 25% of the jobs that fit you", "25% of them Strong matches", "50% ask for it by name", "a broad skill, so it counts for less"]);
  });

  it("is zero with no evidence", () => {
    expect(confidence({ jobs: 0, strong: 0, plain: 0 }, 10).score).toBe(0);
  });
});

describe("removing a suggestion", () => {
  it("leaves out skills the candidate doesn't want to learn, however they're written", () => {
    const jobs = ["1", "2", "3"].map((id) => ({ id, title: "", company: "", skills: ["Kubernetes", "Terraform"] }));
    expect(skillGaps([], jobs, { hidden: ["kubernetes"] }).gaps.map((g) => g.skill)).toEqual(["Terraform"]);
  });

  it("leaves out certifications the candidate doesn't want", () => {
    const jobs = ["1", "2"].map((id) => ({ id, title: "", company: "", skills: [], text: "PMP and ITIL", strong: id === "1" }));
    const certs = certificationsAsked(jobs, [], 6, ["ITIL"]);
    expect(certs.map((c) => [c.name.split(" ")[0], c.jobs, c.strong])).toEqual([["PMP", 2, 1]]);
  });

  it("tracks which jobs tag a skill rather than only mention it", () => {
    const mentions = (t: string, s: string) => t.includes(s.toLowerCase());
    const jobs = [{ id: "1", title: "", company: "", skills: ["Kafka"] }, { id: "2", title: "", company: "", skills: [], text: "kafka streams" }];
    expect(skillGaps([], jobs, { mentions }).gaps[0]).toMatchObject({ skill: "Kafka", jobs: 2, tagged: 1 });
  });
});
