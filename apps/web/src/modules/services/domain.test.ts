import { describe, expect, it } from "vitest";
import { applyFacets, cleanProfile, fieldFromSkills, laneOf, matchService, priceLabel, proTags, ratingLabel, readProTags, readTerms, termsFromPro, visitLabel, warrantyLabel, type ServiceListing } from "./domain";

const L = (over: Partial<ServiceListing["terms"]> = {}, location = "Pune"): Pick<ServiceListing, "terms" | "location"> => ({ terms: { currency: "INR", ...over }, location });

describe("an outside pro's facts travel in tags and come back unchanged", () => {
  it("round-trips only what the source reported", () => {
    const f = { skills: ["Logo Design", "Branding"], rate: { amount: 25.5, currency: "USD" }, rating: 4.99, reviews: 101, completed: 115, onTimePct: 99, country: "Pakistan" };
    expect(readProTags(proTags(f))).toEqual(f);
    expect(readProTags(proTags({}))).toEqual({});
    expect(readProTags(["rate:0:USD", "rating:abc", "skill:", "other:thing"])).toEqual({});
  });

  it("an outside pro is remote work, hourly at the stated rate, with the stated record; nothing is invented", () => {
    const t = termsFromPro({ skills: ["Logo Design"], rate: { amount: 25, currency: "USD" }, rating: 4.9, reviews: 10 });
    expect(t).toMatchObject({ lane: "remote", category: "Design", priceKind: "hourly", priceMin: 25, currency: "USD", rating: 4.9, reviews: 10 });
    const bare = termsFromPro({});
    expect(bare).toEqual({ lane: "remote", currency: "INR" });
    expect(priceLabel(bare)).toBe("Price not stated");
    expect(ratingLabel(bare)).toBeNull();
  });

  it("reads a pro's field from their own skills, or says nothing", () => {
    expect(fieldFromSkills(["PHP", "WordPress"])).toBe("Development");
    expect(fieldFromSkills(["Bookkeeping"])).toBe("Accounting & tax");
    expect(fieldFromSkills(["Gardening"])).toBeUndefined();
  });
});

describe("how a price and a trade's terms read", () => {
  it("states the kind of price, never a guess", () => {
    expect(priceLabel({ currency: "INR", priceKind: "visit", priceMin: 499 })).toBe("₹499 a visit");
    expect(priceLabel({ currency: "INR", priceKind: "fixed", priceMin: 1200, priceMax: 2000 })).toBe("₹1,200–₹2,000 fixed");
    expect(priceLabel({ currency: "USD", priceKind: "hourly", priceMin: 25 })).toBe("$25 an hour");
    expect(priceLabel({ currency: "INR", priceKind: "quote" })).toBe("Quote on request");
    expect(priceLabel({ currency: "INR" })).toBe("Price not stated");
    expect(visitLabel({ currency: "INR", visitCharge: 0 })).toBe("Free visit");
    expect(visitLabel({ currency: "INR" })).toBeNull();
    expect(warrantyLabel(30)).toBe("30-day warranty");
    expect(warrantyLabel(undefined)).toBeNull();
  });

  it("local trades are the local lane and remote fields the remote one", () => {
    expect(laneOf("AC service & repair")).toBe("local");
    expect(laneOf("Design")).toBe("remote");
  });
});

describe("a pro's stored terms", () => {
  it("drop anything malformed instead of guessing", () => {
    expect(readTerms({ category: "Plumbing", priceKind: "visit", priceMin: 299, visitCharge: 0, materials: "extra", warrantyDays: 30, areas: ["Pune", " ", "411001"], gst: true, currency: "INR" })).toEqual({ currency: "INR", lane: "local", category: "Plumbing", priceKind: "visit", priceMin: 299, visitCharge: 0, materials: "extra", warrantyDays: 30, areas: ["Pune", "411001"], gst: true });
    expect(readTerms({ category: "Astrology", priceKind: "barter", priceMin: -5, warrantyDays: 1.5, gst: "yes", currency: "rupees" })).toEqual({ currency: "INR" });
    expect(readTerms(null)).toEqual({ currency: "INR" });
  });
});

describe("whether a pro serves the client", () => {
  it("compares the client's area with the areas a local pro states, and only those", () => {
    const area = { area: "Pune" };
    expect(matchService(L({ lane: "local", areas: ["Pune", "Pimpri"] }), area)).toMatchObject({ fit: "strong", signals: [{ tone: "good", text: "Serves Pune" }] });
    expect(matchService(L({ lane: "local", areas: ["Mumbai"] }, "Mumbai"), area)).toMatchObject({ fit: "some", signals: [{ tone: "bad" }] });
    expect(matchService(L({ lane: "local" }, "Pune"), area).fit).toBe("strong");
    // Remote work has no area to compare, and no area saved means no signal.
    expect(matchService(L({ lane: "remote" }), area)).toEqual({ fit: "unknown", signals: [] });
    expect(matchService(L({ lane: "local", areas: ["Pune"] }), null).fit).toBe("unknown");
    // A pin code against city names (or the reverse) can't be compared, so nothing is claimed either way.
    expect(matchService(L({ lane: "local", areas: ["Pune"] }), { area: "411001" })).toEqual({ fit: "unknown", signals: [] });
    expect(matchService(L({ lane: "local", areas: ["411001", "411002"] }), { area: "411001" }).fit).toBe("strong");
    expect(matchService(L({ lane: "local", areas: ["400001"] }), { area: "411001" }).fit).toBe("some");
  });

  it("asks for the area it compares with", () => {
    expect(cleanProfile({ area: "  " })).toEqual({ problem: "Add your city or pin code." });
    expect(cleanProfile({ area: " Pune " })).toEqual({ value: { area: "Pune" } });
  });
});

describe("Refine", () => {
  const items = [
    { id: "a", terms: { currency: "INR", lane: "local", category: "Plumbing", warrantyDays: 30 } },
    { id: "b", terms: { currency: "INR", lane: "remote", category: "Design", rating: 4.9 } },
    { id: "c", terms: { currency: "INR", lane: "remote", rating: 3.2 } },
    { id: "d", terms: { currency: "INR" } },
  ] as unknown as (Pick<ServiceListing, "terms"> & { id: string })[];
  it("keeps what passes and counts what it left out; a term not stated doesn't pass a filter on it", () => {
    expect(applyFacets(items, { lane: "remote" })).toMatchObject({ hidden: 2, kept: [{ id: "b" }, { id: "c" }] });
    expect(applyFacets(items, { warranty: true }).kept.map((i) => i.id)).toEqual(["a"]);
    expect(applyFacets(items, { rated: true }).kept.map((i) => i.id)).toEqual(["b"]);
    expect(applyFacets(items, { category: "Design" }).kept.map((i) => i.id)).toEqual(["b"]);
    expect(applyFacets(items, {})).toMatchObject({ hidden: 0 });
  });
});
