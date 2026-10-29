import { describe, expect, it } from "vitest";
import { searchedAs } from "./JobsReadiness";

describe("what a search ran as", () => {
  it("names the role, My profile for the Career Profile, nothing for typed words", () => {
    expect(searchedAs({ role: { title: "Senior Director" }, origin: "words" })).toBe("Senior Director");
    expect(searchedAs({ origin: "profile" })).toBe("My profile");
    expect(searchedAs({})).toBeNull();
    expect(searchedAs({ origin: "words" })).toBeNull();
  });
});
