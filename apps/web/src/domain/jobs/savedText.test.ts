import { describe, expect, it } from "vitest";
import { savedTextMatches } from "./savedText";

const job = { title: "Staff Accountant", company: "Interactive Brokers", location: "Mumbai, Maharashtra", skills: ["Tally", "GST"], tags: ["finance"] };

describe("Saved's filter words", () => {
  it("matches as you type: each word, or its start, anywhere in the job's own words", () => {
    for (const t of ["i", "in", "int", "inter", "INTERACTIVE", "acc", "mumbai", "gst", "fin", "staff mum", "  "]) expect(savedTextMatches(job, t)).toBe(true);
  });
  it("needs every word", () => {
    expect(savedTextMatches(job, "intx")).toBe(false);
    expect(savedTextMatches(job, "staff pune")).toBe(false);
  });
});
