import { describe, expect, it } from "vitest";
import { cutPlace, shareOf } from "./share";
import type { EventListing } from "./domain";

const own = {
  id: "ws_abc",
  postingId: "abc",
  title: "Sunday board games",
  company: "Pune Games",
  location: "Baner, Pune; 411045",
  workMode: "onsite",
  terms: { startsAt: "2026-11-15T05:30:00.000Z", endsAt: "2026-11-15T08:30:00.000Z", online: false, capacity: 10, tags: ["games"] },
  description: "Bring a game or borrow one.",
  seatsLeft: 3,
  waitlisted: 0,
  sourceId: "evt_wonderworks",
  sourceName: "WonderWorks events",
} as unknown as EventListing;

const outside = {
  id: "ow_xyz",
  postingId: "xyz",
  title: "Acrylic Painting Date - Mumbai",
  company: "",
  location: "Gardens Galleria Mall, Nala Rd, Sector 38, Noida, Uttar Pradesh 201301, India",
  workMode: "onsite",
  terms: { startsAt: "2026-11-14T18:30:00.000Z", online: false, tags: [] },
  description: "Paint together.",
  seatsLeft: 0,
  waitlisted: 0,
  sourceId: "gw",
  sourceName: "WorksLake Data Gateway · Events & Social",
  outside: { url: "https://www.district.in/events/acrylic-painting", startDate: "2026-11-15", online: false, cfpUrl: "https://cfp.example/x", cfpEndDate: "2026-11-30" },
} as unknown as EventListing;

describe("what Share sends about an event", () => {
  it("an event posted on WonderWorks shares its public page with the organiser last, and never who is going", () => {
    const s = shareOf(own);
    expect(s).toMatchObject({ module: "events", noun: "event", title: "Sunday board games", url: "/s/events/ws_abc" });
    expect(s.facts?.at(-1)).toBe("Pune Games");
    expect(s.originalUrl).toBeUndefined();
    expect(s.lines).toContain("Seats: 3 of 10 seats left");
    expect(JSON.stringify(s)).not.toMatch(/going|attendee/i);
  });

  it("an outside event shares WonderWorks' public page and keeps the event's own page as the original", () => {
    const s = shareOf(outside);
    expect(s.url).toBe("/s/events/ow_xyz");
    expect(s.originalUrl).toBe("https://www.district.in/events/acrylic-painting");
    expect(s.lines).toEqual(expect.arrayContaining([expect.stringContaining("Call for papers: https://cfp.example/x (until "), "Source: WorksLakeDG"]));
  });

  it("an outside event with no organiser leaves the organiser slot empty, so the place is never taken for one", () => {
    const s = shareOf(outside);
    expect(s.facts).toHaveLength(3);
    expect(s.facts?.at(-1)).toBe("");
    expect(s.facts?.[1]).toBe("Gardens Galleria Mall, Nala Rd, Sector 38");
    // The full address stays in the message's Where line.
    expect(s.lines).toContain("Where: Gardens Galleria Mall, Nala Rd, Sector 38, Noida, Uttar Pradesh 201301, India");
  });

  it("an outside event that names no place has no place fact or Where line; an online one says Online", () => {
    const none = shareOf({ ...outside, location: "" } as EventListing);
    expect(none.facts?.[1]).toBe("");
    expect(none.lines?.some((x) => typeof x === "string" && x.startsWith("Where:"))).toBe(false);
    const online = shareOf({ ...outside, location: "", outside: { ...outside.outside!, online: true } } as EventListing);
    expect(online.facts?.[1]).toBe("Online");
    expect(shareOf({ ...outside, outside: { ...outside.outside!, online: true } } as EventListing).facts?.[1]).toBe("Gardens Galleria Mall, Nala Rd, Sector 38");
  });
});

describe("a place cut for a chip", () => {
  it("keeps whole comma parts that fit and never cuts a word in half", () => {
    expect(cutPlace("TERI, Domlur, Bengaluru")).toBe("TERI, Domlur, Bengaluru");
    expect(cutPlace("Gardens Galleria Mall, Nala Rd, Sector 38, Noida, Uttar Pradesh 201301, India")).toBe("Gardens Galleria Mall, Nala Rd, Sector 38");
    expect(cutPlace("A, B, C", 3)).toBe("A");
  });
  it("cuts a single very long part at a word, with an ellipsis", () => {
    const long = "The International Convention and Exhibition Centre for Advanced Technology Studies";
    const cut = cutPlace(long, 40);
    expect(cut.length).toBeLessThanOrEqual(40);
    expect(cut.endsWith("…")).toBe(true);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
    // It stopped at a word boundary: the next character of the original is a space.
    expect(long.charAt(cut.length - 1)).toBe(" ");
  });
});
