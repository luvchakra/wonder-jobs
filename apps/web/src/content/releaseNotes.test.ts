import { describe, expect, it } from "vitest";
import { RELEASE_NOTES } from "./releaseNotes";
import { HELP_SECTIONS } from "./help";

describe("release notes", () => {
  it("are newest first, each covering the pull requests after the one before", () => {
    for (let i = 1; i < RELEASE_NOTES.length; i++) {
      expect(RELEASE_NOTES[i - 1].date >= RELEASE_NOTES[i].date).toBe(true);
      expect(RELEASE_NOTES[i - 1].through).toBeGreaterThan(RELEASE_NOTES[i].through);
    }
  });
  it("every entry has a real date, a title and at least one change", () => {
    for (const n of RELEASE_NOTES) {
      expect(n.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(n.date))).toBe(false);
      expect(n.title.trim()).not.toBe("");
      expect(n.items.length).toBeGreaterThan(0);
      for (const item of n.items) expect(item.startsWith("- ")).toBe(false);
    }
  });
  it("show in the help guide, dated by the newest entry", () => {
    const section = HELP_SECTIONS.find((s) => s.id === "release-notes");
    expect(section?.updated).toBe(RELEASE_NOTES[0].date);
    expect(section?.body.filter((l) => l.startsWith("- "))).toHaveLength(RELEASE_NOTES.reduce((n, r) => n + r.items.length, 0));
  });
});
