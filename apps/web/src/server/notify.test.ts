import { describe, expect, it } from "vitest";
import { parseEmailList } from "./notify";

describe("parseEmailList", () => {
  it("returns an empty list for unset or blank input", () => {
    expect(parseEmailList(undefined)).toEqual([]);
    expect(parseEmailList(null)).toEqual([]);
    expect(parseEmailList("")).toEqual([]);
    expect(parseEmailList("   ")).toEqual([]);
  });

  it("splits, trims and lower-cases a comma-separated list", () => {
    expect(parseEmailList(" Ops@Example.com , founder@example.com ,hello@example.co.in ")).toEqual(["ops@example.com", "founder@example.com", "hello@example.co.in"]);
  });

  it("drops invalid entries instead of throwing", () => {
    expect(parseEmailList("ops@example.com, not-an-email, ,@example.com,x@y")).toEqual(["ops@example.com"]);
  });

  it("dedupes case-insensitively", () => {
    expect(parseEmailList("ops@example.com, OPS@example.com, ops@example.com")).toEqual(["ops@example.com"]);
  });
});
