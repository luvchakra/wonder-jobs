import { describe, expect, it } from "vitest";
import { applyFacets, cleanProfile, cleanTherapistPosting, feeLabel, matchTherapist, readTerms, type TherapistTerms } from "./domain";

const OK = { title: "Counselling for work stress", description: "I work with adults on stress, relationships and career change, in short sessions.", modes: ["online", "in_person"], city: "Pune", languages: ["English", "Hindi"], focus: ["Stress & anxiety", "Career & work"], feeMin: 1500, feeMax: 2000 };

describe("a practitioner's listing", () => {
  it("is checked: what clients compare is required, and the terms are what was given", () => {
    const c = cleanTherapistPosting({ ...OK, approaches: ["CBT"], sessionMinutes: 50 });
    expect(c).toMatchObject({ value: { location: "Pune", workMode: "hybrid", terms: { modes: ["online", "in_person"], languages: ["English", "Hindi"], feeMin: 1500, feeMax: 2000, approaches: ["CBT"], sessionMinutes: 50, currency: "INR" } } });
    expect(cleanTherapistPosting({ ...OK, modes: ["online"], city: "" })).toMatchObject({ value: { location: "Online", workMode: "remote" } });
    expect(cleanTherapistPosting({ ...OK, city: "" })).toEqual({ problem: "Say which city you see clients in." });
    expect(cleanTherapistPosting({ ...OK, modes: [] })).toMatchObject({ problem: expect.stringContaining("online, in person") });
    expect(cleanTherapistPosting({ ...OK, languages: [] })).toMatchObject({ problem: expect.stringContaining("languages") });
    expect(cleanTherapistPosting({ ...OK, focus: [] })).toMatchObject({ problem: expect.stringContaining("what you work with") });
    expect(cleanTherapistPosting({ ...OK, focus: ["Stress & anxiety", "Low mood", "Relationships", "Family & parenting", "Career & work", "Grief & loss", "Trauma"] })).toMatchObject({ problem: expect.stringContaining("up to 6") });
    expect(cleanTherapistPosting({ ...OK, feeMin: undefined })).toMatchObject({ problem: expect.stringContaining("fee") });
    expect(cleanTherapistPosting({ ...OK, feeMax: 1000 })).toMatchObject({ problem: expect.stringContaining("upper end") });
  });

  it("holds no licence, qualification, outcome or rating, even if one is sent", () => {
    const c = cleanTherapistPosting({ ...OK, licence: "RCI-1234", verified: true, rating: 5, qualifications: "PhD" } as never);
    expect(JSON.stringify(c)).not.toMatch(/RCI-1234|verified|rating|PhD/);
  });

  it("reads malformed stored terms as unstated, never guessed", () => {
    expect(readTerms({ modes: ["telepathy"], languages: "Hindi", feeMin: -5, currency: "rupees" })).toEqual({ currency: "INR" });
    expect(feeLabel(readTerms({}))).toBe("Fee not stated");
    expect(feeLabel({ feeMin: 1500, feeMax: 2000, currency: "INR" })).toBe("₹1,500–₹2,000 a session");
  });
});

describe("fit and Refine", () => {
  const t: TherapistTerms = { currency: "INR", modes: ["online"], languages: ["Hindi"], focus: ["Grief & loss"], feeMin: 1500 };
  it("compares only the client's language, way of meeting and budget; a term not stated says nothing", () => {
    expect(matchTherapist({ terms: t }, null).fit).toBe("unknown");
    expect(matchTherapist({ terms: t }, { languages: ["Hindi"], mode: "online", budget: 2000 })).toMatchObject({ fit: "strong" });
    expect(matchTherapist({ terms: t }, { languages: ["Tamil"], mode: "", budget: 1000 })).toMatchObject({ fit: "some" });
    expect(matchTherapist({ terms: { currency: "INR" } }, { languages: ["Hindi"], mode: "online", budget: 100 })).toEqual({ fit: "unknown", signals: [] });
  });
  it("Refine keeps what states the term and counts what it left out", () => {
    const list = [{ terms: t }, { terms: { currency: "INR" } as TherapistTerms }];
    expect(applyFacets(list, { language: "Hindi" })).toMatchObject({ hidden: 1 });
    expect(applyFacets(list, { maxFee: 1000 }).kept).toHaveLength(0);
    expect(applyFacets(list, { mode: "online", focus: "Grief & loss", maxFee: 2000 }).kept).toHaveLength(1);
  });
  it("preferences need at least one answer and nothing about why", () => {
    expect(cleanProfile({})).toMatchObject({ problem: expect.any(String) });
    expect(cleanProfile({ languages: ["Hindi", "Klingon"], mode: "online", budget: 2000, reason: "anxiety" })).toEqual({ value: { languages: ["Hindi"], mode: "online", budget: 2000 } });
  });
});
