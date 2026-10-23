import { describe, expect, it } from "vitest";
import { EMPTY_DNA, type CareerDNA } from "@/domain/career/types";
import { EMPTY_HISTORY } from "@/domain/career/history";
import { interviewPrep } from "./interviewPrep";

const dna: CareerDNA = {
  ...EMPTY_DNA,
  skills: [
    { name: "Python", level: 3 },
    { name: "IAM", level: 5 },
  ],
  history: {
    ...EMPTY_HISTORY,
    experience: [
      { id: "e1", employer: "Acme", title: "Engineering Lead", startDate: "2021", current: true, provenance: "USER_PROVIDED", bullets: [{ id: "b1", text: "Rolled out SSO and IAM for 4,000 staff", provenance: "USER_PROVIDED" }] },
      { id: "e2", employer: "Beta", title: "Engineer", startDate: "2016", endDate: "2020", provenance: "USER_PROVIDED", bullets: [{ id: "b2", text: "Built Python services for billing", provenance: "USER_PROVIDED" }] },
    ],
  },
};

describe("interview prep for one application", () => {
  it("leads with the posting's skills the candidate has, strongest first, each with a line from their own history", () => {
    const p = interviewPrep({ title: "Engineering Manager", company: "Canonical", skills: ["Python", "iam", "Go", "SSO"] }, dna);
    expect(p.leadWith).toEqual([
      { skill: "iam", level: 5, story: { text: "Rolled out SSO and IAM for 4,000 staff", role: "Engineering Lead at Acme" } },
      { skill: "Python", level: 3, story: { text: "Built Python services for billing", role: "Engineer at Beta" } },
    ]);
    // Not in the profile: Go has no story; SSO has one in the history even though it isn't a listed skill.
    expect(p.gaps).toEqual([{ skill: "Go", story: undefined }, { skill: "SSO", story: { text: "Rolled out SSO and IAM for 4,000 staff", role: "Engineering Lead at Acme" } }]);
  });

  it("asks one practice question per requirement, in the posting's words, then why this company and role", () => {
    const p = interviewPrep({ title: "Engineering Manager", company: "Canonical", requirements: ["Experience leading distributed teams.", " "], niceToHave: ["Ubuntu"] }, dna);
    expect(p.lookingFor).toEqual(["Experience leading distributed teams."]);
    expect(p.niceToHave).toEqual(["Ubuntu"]);
    expect(p.questions).toEqual([
      { q: "Can you give an example that shows this: “experience leading distributed teams”?", from: "Experience leading distributed teams." },
      { q: "Why Canonical, and why this Engineering Manager role?" },
      { q: "What questions do you have for us?" },
    ]);
  });

  it("invents nothing when the posting lists no skills or requirements", () => {
    const p = interviewPrep({ title: "Analyst", company: "X" }, EMPTY_DNA);
    expect([p.leadWith, p.gaps, p.lookingFor, p.niceToHave]).toEqual([[], [], [], []]);
    expect(p.questions).toHaveLength(2);
  });
});
