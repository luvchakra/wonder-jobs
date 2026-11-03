import { describe, expect, it } from "vitest";
import { listingShareMessage, publicPath } from "@/wonderworks/listing/share";
import type { ServiceListing } from "./domain";
import { originalLabel, sameName, shareOf } from "./share";

const base = { postedAt: null, termsFrom: "posting", sourceId: "s", sourceName: "Houzz professionals" } as const;
const own = { ...base, id: "ws_post1", origin: "wonderstar", postingId: "post1", title: "AC service & gas refill", company: "CoolFix Pune", companyVerified: true, location: "Kothrud, Pune", workMode: "onsite", description: "Split AC service at your place.", terms: { lane: "local", currency: "INR", category: "AC service & repair", priceKind: "visit", priceMin: 499, areas: ["Pune"] } } as unknown as ServiceListing;
const outsideDir = { ...base, id: "services:abc/1", origin: "outside", title: "De Panache", company: "De Panache", location: "Bengaluru", workMode: "onsite", description: "Interior design studio.", applyUrl: "https://depanache.in", terms: { lane: "local", currency: "INR", category: "Design, build & renovation", areas: ["Bengaluru"], rating: 5, reviews: 161 } } as unknown as ServiceListing;
const outsideFreelancer = { ...outsideDir, id: "services:fl/2", title: "PHP, WordPress", company: "Skyapps", location: "Remote", terms: { lane: "remote", currency: "USD", skills: ["PHP"] } } as unknown as ServiceListing;

describe("Share for a pro", () => {
  it("gives every origin a public page of its own, and only an outside pro an original link", () => {
    for (const l of [own, outsideDir, outsideFreelancer]) {
      const s = shareOf(l);
      expect(s.module).toBe("services");
      expect(s.url).toBe(publicPath("services", l.id));
      expect(s.url.startsWith("/s/services/")).toBe(true);
      expect(s.title).toBe(l.title);
      // The logo comes from the first fact: the pro's name.
      expect(s.facts?.[0]).toBe(l.company);
    }
    expect(shareOf(own).originalUrl).toBeUndefined();
    expect(shareOf(outsideDir).originalUrl).toBe("https://depanache.in");
    expect(shareOf(outsideFreelancer).source).toBe("Houzz professionals");
  });

  it("says what a client sees (price, place, areas, rating) and never a phone or an address", () => {
    const text = JSON.stringify(shareOf(outsideDir));
    expect(text).toContain("Rating");
    expect(text).toContain("Bengaluru");
    expect(JSON.stringify(shareOf(own))).toContain("₹499");
    expect(text).not.toMatch(/\+91|@|tel:/);
  });

  it("names the original link for what it is, and carries open data's credit", () => {
    expect(originalLabel("https://www.houzz.in/professionals/construction/a-pf~1")).toBe("Their page on Houzz");
    expect(originalLabel("https://www.wedmegood.com/profile/A-1")).toBe("Their page on WedMeGood");
    expect(originalLabel("https://www.freelancer.com/u/Skyapps")).toBe("Their profile on Freelancer.com");
    expect(originalLabel("https://www.openstreetmap.org/node/1")).toBe("Their page on OpenStreetMap");
    expect(originalLabel("https://depanache.in")).toBe("Their website");
    expect(originalLabel("not a url")).toBe("Their page");
    expect(shareOf(outsideDir).originalLabel).toBe("Their website");
    expect(shareOf(outsideDir).credit).toBeUndefined();
    const osm = shareOf({ ...outsideDir, applyUrl: "https://www.openstreetmap.org/node/1", attribution: "© OpenStreetMap contributors, ODbL" } as ServiceListing);
    expect(osm).toMatchObject({ originalLabel: "Their page on OpenStreetMap", credit: "© OpenStreetMap contributors, ODbL" });
    // An own pro has no original page and no credit.
    expect(shareOf(own)).not.toHaveProperty("originalUrl");
    expect(shareOf(own)).not.toHaveProperty("credit");
  });

  it("leads with what tells most and leaves out a price the source never stated", () => {
    const s = shareOf(outsideDir);
    expect(s.facts).toEqual(["De Panache", null, "Bengaluru"]);
    expect((s.lines as string[]).slice(0, 3)).toEqual(["Category: Design, build & renovation", "Areas: Bengaluru", "Rating: 5.0 (161 reviews)"]);
    expect(shareOf(own).facts).toContain("₹499 a visit");
  });

  it("doesn't say a directory business's name twice in the message", () => {
    expect(sameName(outsideDir)).toBe(true);
    expect(sameName(own)).toBe(false);
    const s = shareOf(outsideDir);
    const m = listingShareMessage(s, `https://wonderworks.example${s.url}`, { image: true });
    const head = m.whatsapp.split("\n")[0];
    expect(head.split("De Panache").length - 1).toBe(1);
  });
});
