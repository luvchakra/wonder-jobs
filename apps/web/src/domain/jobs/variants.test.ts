import { describe, expect, it } from "vitest";
import { ruleVariants, searchVariants } from "./variants";

const vocab = new Set(["senior", "director", "identity", "access", "management", "security", "governance"]);

describe("smart search phrasings", () => {
  it("rules broaden a title step by step: level qualifiers, then the field, then its first word", () => {
    expect(ruleVariants("senior director identity access")).toEqual(["director identity access", "identity access", "identity"]);
    expect(ruleVariants("identity")).toEqual([]);
    expect(ruleVariants("Data Engineer")).toEqual(["data"]);
  });

  it("AI phrasings made of the candidate's own words come first; new roles and repeats are dropped; at most three", () => {
    const r = searchVariants("senior director identity access", ["identity and access management", "IAM architect", "Senior Director Identity Access", "identity governance"], vocab);
    expect(r.variants).toEqual(["identity and access management", "identity governance", "director identity access"]);
    expect(r.fromAi).toEqual(["identity and access management", "identity governance"]);
  });

  it("without AI the rules alone decide", () => {
    expect(searchVariants("senior director identity access", null, vocab)).toEqual({ variants: ["director identity access", "identity access", "identity"], fromAi: [] });
  });
});
