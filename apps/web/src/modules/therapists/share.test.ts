import { describe, expect, it } from "vitest";
import { shareOf } from "./share";
import { termsFromOsm, type TherapistListing } from "./domain";

const own: TherapistListing = { id: "ws_4", postingId: "4", origin: "wonderworks", title: "Counselling for work stress", company: "Dr Rao", location: "Pune, Maharashtra", sourceId: "s", sourceName: "WonderWorks practitioners", description: "I work with stress.", terms: { currency: "INR", modes: ["online"], languages: ["English"], feeMin: 2000, sessionMinutes: 50 } };
const mapped: TherapistListing = { id: "osm_1", origin: "outside", title: "Sindhi Polyclinic", company: "Sindhi Polyclinic", location: "Indore, Madhya Pradesh", sourceId: "thp_osm", sourceName: "OpenStreetMap", description: "", terms: termsFromOsm(), practiceKind: "Clinic", attribution: "© OpenStreetMap contributors" };

describe("Therapists Share", () => {
  it("an own practitioner and a mapped practice each get their public page", () => {
    expect(shareOf(own).url).toBe("/s/therapists/ws_4");
    expect(shareOf(mapped).url).toBe("/s/therapists/osm_1");
    expect(shareOf(mapped).module).toBe("therapists");
  });

  it("a mapped practice shares only what the map has: no fee, language or focus is invented", () => {
    const s = JSON.stringify(shareOf(mapped));
    for (const x of ["Sindhi Polyclinic", "Indore"]) expect(s).toContain(x);
    expect(s).toContain("© OpenStreetMap contributors");
    expect(s).not.toContain("Fee not stated");
    for (const x of ["Languages", "Focus", "Ways of working", "Session:", "₹"]) expect(s).not.toContain(x);
  });

  it("an own practitioner shares what they published", () => {
    const s = JSON.stringify(shareOf(own));
    for (const x of ["Languages: English", "Session: 50 min", "I work with stress."]) expect(s).toContain(x);
  });
});
