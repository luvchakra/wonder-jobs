import { describe, expect, it } from "vitest";
import { skillGaps, type GapJob } from "./gap";

const job = (id: string, ...skills: string[]): GapJob => ({ id, title: `Role ${id}`, company: `Co ${id}`, skills });

describe("skillGaps", () => {
  it("counts the skills jobs ask for that the profile lacks, most-asked first", () => {
    const jobs = [job("1", "Kubernetes", "Python"), job("2", "Kubernetes", "Terraform"), job("3", "Kubernetes", "Terraform", "Go"), job("4", "Python"), job("5", "Terraform")];
    const r = skillGaps(["Python"], jobs);
    expect(r.considered).toBe(5);
    expect(r.gaps.map((g) => [g.skill, g.jobs])).toEqual([["Kubernetes", 3], ["Terraform", 3]]);
  });

  it("keeps up to three example jobs for each skill, to show where it was seen", () => {
    const jobs = ["1", "2", "3", "4", "5"].map((id) => job(id, "Kubernetes"));
    expect(skillGaps([], jobs).gaps[0].examples.map((j) => j.id)).toEqual(["1", "2", "3"]);
  });

  it("treats a skill the profile already covers, in other words, as covered", () => {
    const jobs = [job("1", "Python"), job("2", "Python"), job("3", "Cloud Security"), job("4", "Cloud Security")];
    expect(skillGaps(["Python programming", "cloud security"], jobs).gaps).toEqual([]);
  });

  it("ignores casing, punctuation and a skill repeated in one job", () => {
    const jobs = [job("1", "CI/CD", "ci cd"), job("2", "ci/cd"), job("3"), job("4"), job("5")];
    const [gap] = skillGaps([], jobs).gaps;
    expect(gap).toMatchObject({ skill: "CI/CD", jobs: 2 });
  });

  it("needs two jobs, unless there are too few jobs for that to be fair", () => {
    const many = [job("1", "Rust"), job("2"), job("3"), job("4"), job("5")];
    expect(skillGaps([], many).gaps).toEqual([]);
    expect(skillGaps([], [job("1", "Rust"), job("2")]).gaps.map((g) => g.skill)).toEqual(["Rust"]);
  });

  it("says nothing when there are no jobs", () => {
    expect(skillGaps(["Python"], [])).toEqual({ considered: 0, gaps: [] });
  });

  it("caps the list", () => {
    const jobs = Array.from({ length: 6 }, (_, i) => job(String(i), ...Array.from({ length: 12 }, (_, k) => `Skill ${k}`)));
    expect(skillGaps([], jobs, 5).gaps).toHaveLength(5);
  });
});
