import { describe, expect, it } from "vitest";
import { listingOfApplication, shareOf } from "./share";
import type { MyScholarshipApplicationDetail, ScholarshipListing } from "./domain";

const base: ScholarshipListing = { id: "opp_1", origin: "outside", title: "STEM scholarship", company: "Example Trust", location: "India", terms: { kind: "scholarship", currency: "INR", awardAmount: 25000, awardPeriod: "one_time", deadline: "2026-12-01" }, termsFrom: "posting", skills: [], description: "For undergraduate women.", applyUrl: "https://trust.example.org/apply", sourceId: "s", sourceName: "Partner" };

describe("Share for Scholarships & Projects", () => {
  it("an outside listing shares its public page, with the provider first and its original page", () => {
    const s = shareOf(base);
    expect(s).toMatchObject({ module: "scholarships", url: "/s/scholarships/opp_1", originalUrl: "https://trust.example.org/apply" });
    expect(s.facts?.[0]).toBe("Example Trust");
  });

  it("a WonderWorks listing shares /s/scholarships/ws_<id> and no original page", () => {
    const s = shareOf({ ...base, id: "ws_lst_abc12345", origin: "wonderstar", postingId: "lst_abc12345" });
    expect(s.url).toBe("/s/scholarships/ws_lst_abc12345");
    expect(s.originalUrl).toBeUndefined();
  });

  it("unstated award and deadline are left out of the facts; the kind isn't repeated as a line", () => {
    const s = shareOf({ ...base, terms: { kind: "scholarship", currency: "INR" } });
    expect(s.facts).toEqual(["Example Trust", null, null]);
    expect(s.lines?.some((x) => typeof x === "string" && x.startsWith("Kind:"))).toBe(false);
  });

  it("no provider stated: the first fact is empty, never the source's name", () => {
    expect(shareOf({ ...base, company: "" }).facts?.[0]).toBeNull();
  });

  it("one of the student's own applications shares the listing it was sent to", () => {
    const a = { id: "rsp_1", postingId: "lst_abc12345", title: "Merit award", company: "Foundation", status: "applied", terms: base.terms, appliedAt: "", updatedAt: "", location: "", workMode: "remote", description: "", sent: { name: "", email: "", profile: { field: "", institution: "", region: "" }, answers: [], statement: "" }, events: [] } as MyScholarshipApplicationDetail;
    expect(shareOf(listingOfApplication(a))).toMatchObject({ url: "/s/scholarships/ws_lst_abc12345", title: "Merit award" });
  });
});
