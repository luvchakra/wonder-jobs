import { describe, expect, it } from "vitest";
import { appendDictated } from "./dictation";

describe("appendDictated", () => {
  it("uses a dictated phrase as-is when the field is empty", () => {
    expect(appendDictated("", "senior director at Saviynt")).toBe("senior director at Saviynt");
  });

  it("appends to what is already typed with a single space", () => {
    expect(appendDictated("senior director", "at Saviynt")).toBe("senior director at Saviynt");
    expect(appendDictated("senior director ", "at Saviynt")).toBe("senior director at Saviynt");
    expect(appendDictated("senior director\n", "at Saviynt")).toBe("senior director at Saviynt");
  });

  it("starts a new sentence after terminal punctuation", () => {
    expect(appendDictated("I want a director role.", "remote only")).toBe("I want a director role. Remote only");
    expect(appendDictated("Which team?", "ideally platform")).toBe("Which team? Ideally platform");
  });

  it("keeps the candidate's own words verbatim", () => {
    const spoken = "Staff PM, fintech, Bengaluru or remote";
    expect(appendDictated("", spoken)).toBe(spoken);
    expect(appendDictated("Looking for:", spoken)).toBe(`Looking for: ${spoken}`);
  });
});
