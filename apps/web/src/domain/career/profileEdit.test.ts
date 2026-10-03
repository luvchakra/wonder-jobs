import { describe, expect, it } from "vitest";
import { EMPTY_DNA, type CareerDNA } from "./types";
import { historyOf } from "./history";
import { profileChanged } from "./profileEdit";

const saved: CareerDNA = { ...EMPTY_DNA, name: "Asha Verma", headline: "Product manager", updatedAt: "2026-10-01T00:00:00.000Z" };

describe("unsaved changes on the Career Profile", () => {
  it("is clean once saved, although saving stamps a new time", () => {
    const draft = { ...saved, name: "Asha V." };
    expect(profileChanged(draft, saved)).toBe(true);
    const afterSave = { ...saved, ...draft, updatedAt: "2026-10-03T07:42:00.000Z" };
    expect(profileChanged(draft, afterSave)).toBe(false);
  });

  it("ignores key order and a work history written out in full without any edit", () => {
    const reordered = Object.fromEntries(Object.entries(saved).reverse()) as unknown as CareerDNA;
    expect(profileChanged(reordered, saved)).toBe(false);
    expect(profileChanged({ ...saved, history: historyOf(saved) }, saved)).toBe(false);
    expect(profileChanged({ ...saved, history: { ...historyOf(saved), summary: undefined } }, saved)).toBe(false);
  });

  it("still sees a real edit inside the work history", () => {
    expect(profileChanged({ ...saved, history: { ...historyOf(saved), summary: "Eight years in payments." } }, saved)).toBe(true);
    expect(profileChanged({ ...saved, skills: [...saved.skills, { name: "SQL", level: 3 }] }, saved)).toBe(true);
  });
});
