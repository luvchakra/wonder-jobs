import { describe, expect, it } from "vitest";
import { CANARIES, getUniverse } from "./universe";

describe("demo universe canaries", () => {
  it("holds each canary posting once, marked as a sample", () => {
    const { jobs } = getUniverse();
    for (const c of CANARIES) {
      const found = jobs.filter((j) => j.company === c.company);
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe(c.id);
      expect(found[0].company).toMatch(/\(sample\)$/);
      expect(found[0].applyUrl).toMatch(/\.example\//);
    }
  });
});
