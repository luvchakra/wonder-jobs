import { describe, expect, it } from "vitest";
import { skillGaps, type GapJob } from "./gap";

const job = (id: string, ...skills: string[]): GapJob => ({ id, title: `Role ${id}`, company: `Co ${id}`, skills });
/** A plain whole-word test, standing in for the matcher's own rule. */
const mentions = (text: string, skill: string) => new RegExp(`\\b${skill.toLowerCase()}\\b`).test(text);

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
    expect(skillGaps(["Python"], [])).toEqual({ considered: 0, gaps: [], strengths: [] });
  });

  it("caps the list", () => {
    const jobs = Array.from({ length: 6 }, (_, i) => job(String(i), ...Array.from({ length: 12 }, (_, k) => `Skill ${k}`)));
    expect(skillGaps([], jobs, { max: 5 }).gaps).toHaveLength(5);
  });

  it("counts a skill a posting names in its text but doesn't tag — only one these jobs use as a skill", () => {
    const jobs = [job("1", "Terraform"), { ...job("2"), text: "you will automate infrastructure with terraform." }, { ...job("3"), text: "terraform and quantum basket weaving" }, job("4"), job("5")];
    const r = skillGaps([], jobs, { mentions });
    expect(r.gaps.map((g) => [g.skill, g.jobs])).toEqual([["Terraform", 3]]);
  });

  it("ranks the candidate's own growth areas first, then specific skills before generic ones, weighting Strong matches", () => {
    const strong = (id: string, ...s: string[]) => ({ ...job(id, ...s), strong: true });
    const jobs = [job("1", "Agile", "Terraform", "Kafka"), job("2", "Agile", "Terraform", "Kafka"), job("3", "Agile", "Terraform"), strong("4", "Agile", "Kafka", "Rust"), strong("5", "Agile", "Kafka", "Rust")];
    const r = skillGaps([], jobs, { generic: new Set(["agile"]), goals: ["rust"] });
    expect(r.gaps.map((g) => g.skill)).toEqual(["Rust", "Kafka", "Terraform", "Agile"]);
    expect(r.gaps[1]).toMatchObject({ skill: "Kafka", jobs: 4, strong: 2, generic: false });
    expect(r.gaps[0].goal).toBe(true);
    expect(r.gaps[3].generic).toBe(true);
  });

  it("counts a skill built on a generic one as broad", () => {
    const jobs = [job("1", "Cross-functional Leadership", "Python"), job("2", "Cross-functional Leadership", "Python"), job("3", "Cross-functional Leadership"), job("4", "Risk Management", "Cross-functional Leadership"), job("5", "Risk Management")];
    const r = skillGaps([], jobs, { generic: new Set(["leadership", "risk"]) });
    expect(r.gaps.map((g) => [g.skill, g.generic])).toEqual([["Python", false], ["Cross-functional Leadership", true], ["Risk Management", true]]);
  });

  it("lists the candidate's own skills these jobs ask for most", () => {
    const jobs = [job("1", "Python", "SQL"), job("2", "Python"), { ...job("3"), text: "strong sql needed" }, job("4", "Go")];
    expect(skillGaps(["SQL", "Python", "Haskell"], jobs, { mentions }).strengths).toEqual([
      { skill: "Python", jobs: 2 },
      { skill: "SQL", jobs: 2 },
    ]);
  });
});
