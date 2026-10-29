import { describe, expect, it } from "vitest";
import { refineInternships } from "./components/Find";
import type { InternshipListing } from "./domain";

const l = (id: string, terms: InternshipListing["terms"], extra: Partial<InternshipListing> = {}): InternshipListing => ({ id, origin: "outside", title: id, company: "Co", location: "Pune", terms, termsFrom: "posting", skills: [], description: "", sourceId: "s", sourceName: "S", ...extra });

describe("Internships' Refine and sort, on Jobs' Find structure", () => {
  const list = [l("a", { currency: "INR", stipendMin: 8000, durationMonths: 2, startsOn: "2026-12-01" }, { postedAt: "2026-10-01" }), l("b", { currency: "INR", stipendMax: 25000, durationMonths: 6 }, { workMode: "remote", postedAt: "2026-10-20" }), l("c", { currency: "INR" })];

  it("applies stipend, duration, start month and remote, and says how many it hid", () => {
    expect(refineInternships(list, {}, "relevance").kept.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(refineInternships(list, { stipend: "10000" }, "relevance")).toEqual({ kept: [list[1]], hidden: 2 });
    expect(refineInternships(list, { months: "3" }, "relevance").kept.map((x) => x.id)).toEqual(["a"]);
    expect(refineInternships(list, { start: "2026-12" }, "relevance").kept.map((x) => x.id)).toEqual(["a"]);
    expect(refineInternships(list, { remote: "1" }, "relevance").kept.map((x) => x.id)).toEqual(["b"]);
  });

  it("sorts by newest or stipend without dropping anything", () => {
    expect(refineInternships(list, {}, "date").kept.map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(refineInternships(list, {}, "stipend").kept.map((x) => x.id)).toEqual(["b", "a", "c"]);
  });
});
