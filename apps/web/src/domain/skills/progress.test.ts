import { describe, expect, it } from "vitest";
import { LEVEL_NAMES, onProfile, percent, profileLevel, readyForResume, summarize, type SavedItem } from "./progress";

const skill = (name: string, level: SavedItem["level"]): SavedItem => ({ name, kind: "skill", level });
const cert = (name: string, level: SavedItem["level"]): SavedItem => ({ name, kind: "certification", level });

describe("saved skills progress", () => {
  it("names five steps for skills and for certifications", () => {
    expect(LEVEL_NAMES.skill[3]).toBe("Confident");
    expect(LEVEL_NAMES.certification[4]).toBe("Earned");
  });

  it("is ready for the résumé at Confident for a skill, and only once Earned for a certification", () => {
    expect(readyForResume(skill("Kafka", 2))).toBe(false);
    expect(readyForResume(skill("Kafka", 3))).toBe(true);
    expect(readyForResume(cert("PMP", 3))).toBe(false);
    expect(readyForResume(cert("PMP", 4))).toBe(true);
  });

  it("maps the tracker onto the Career Profile's 1–5 skill level", () => {
    expect([0, 1, 2, 3, 4].map((l) => profileLevel(l as SavedItem["level"]))).toEqual([1, 2, 3, 4, 5]);
    expect(percent(2)).toBe(50);
  });

  it("knows when the profile already shows it", () => {
    const profile = { skills: ["Apache Kafka"], certifications: ["PMP"] };
    expect(onProfile(skill("Kafka", 3), profile)).toBe(true);
    expect(onProfile(cert("PMP (Project Management Professional)", 4), profile)).toBe(true);
    expect(onProfile(skill("Rust", 3), profile)).toBe(false);
  });

  it("sums up how many are ready to add and the average progress", () => {
    const profile = { skills: ["Kafka"], certifications: [] };
    expect(summarize([skill("Kafka", 4), skill("Rust", 3), cert("CISSP", 2)], profile)).toEqual({ saved: 3, toAdd: 1, average: 75 });
    expect(summarize([], profile)).toEqual({ saved: 0, toAdd: 0, average: 0 });
  });
});
