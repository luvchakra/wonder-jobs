import { describe, expect, it } from "vitest";
import { applyFacets, attendeeMay, cleanEventPosting, EMPTY_FACETS, matchEvent, organiserMay, readTerms, seatFor, seatsLeft, waitlistPlace, whenLabel, type EventListing } from "./domain";

const NOW = Date.parse("2026-11-01T00:00:00Z");
const base = { title: "Sunday board games", description: "Bring a game or borrow one; all levels welcome.", location: "Koregaon Park, Pune", startsAt: "2026-11-08T12:30:00Z", capacity: 12 };

describe("seats", () => {
  it("a seat while going < capacity, else the waitlist; no capacity means no limit", () => {
    expect(seatFor(2, 1)).toBe("going");
    expect(seatFor(2, 2)).toBe("waitlist");
    expect(seatFor(undefined, 100_000)).toBe("going");
    expect(seatsLeft(2, 5)).toBe(0);
    expect(seatsLeft(undefined, 5)).toBeUndefined();
  });
  it("the waitlist place is by who asked first", () => {
    const q = [{ createdAt: "b", id: "2" }, { createdAt: "a", id: "1" }, { createdAt: "b", id: "3" }];
    expect(waitlistPlace(q, { createdAt: "a", id: "1" })).toBe(1);
    expect(waitlistPlace(q, { createdAt: "b", id: "3" })).toBe(3);
  });
  it("an attendee cancels only until it starts; the organiser marks attendance only after", () => {
    const starts = "2026-11-08T12:30:00Z";
    expect(attendeeMay("going", starts, NOW)).toEqual(["cancel"]);
    expect(attendeeMay("waitlist", starts, NOW)).toEqual(["cancel"]);
    expect(attendeeMay("going", starts, Date.parse(starts) + 1)).toEqual([]);
    expect(attendeeMay("attended", starts, NOW)).toEqual([]);
    expect(organiserMay("going", starts, NOW)).toEqual(["cancelled"]);
    expect(organiserMay("going", starts, Date.parse(starts) + 1)).toEqual(["attended", "no_show"]);
    expect(organiserMay("waitlist", starts, Date.parse(starts) + 1)).toEqual([]);
    expect(organiserMay("cancelled", starts, NOW)).toEqual([]);
  });
});

describe("an organiser's event", () => {
  it("accepts a valid free event and keeps its terms", () => {
    const c = cleanEventPosting(base, NOW);
    expect(c).toMatchObject({ value: { title: "Sunday board games", workMode: "onsite", terms: { capacity: 12, online: false, tags: [] } } });
    expect(readTerms((c as { value: { terms: unknown } }).value.terms)).toMatchObject({ startsAt: "2026-11-08T12:30:00.000Z", capacity: 12 });
  });
  it("refuses what's missing or wrong with one plain sentence", () => {
    expect(cleanEventPosting({ ...base, title: "" }, NOW)).toEqual({ problem: "Give the event a name." });
    expect(cleanEventPosting({ ...base, startsAt: "2026-10-01T10:00:00Z" }, NOW)).toEqual({ problem: "Choose a start time in the future." });
    expect(cleanEventPosting({ ...base, location: "" }, NOW)).toEqual({ problem: "Say where it is, or mark it online." });
    expect(cleanEventPosting({ ...base, location: "", online: true }, NOW)).toMatchObject({ value: { workMode: "remote" } });
    expect(cleanEventPosting({ ...base, capacity: 0 }, NOW)).toMatchObject({ problem: expect.stringContaining("Capacity") });
    expect(cleanEventPosting({ ...base, capacity: "" }, NOW)).toMatchObject({ value: { terms: { online: false } } });
    expect(cleanEventPosting({ ...base, endsAt: "2026-11-08T10:00:00Z" }, NOW)).toEqual({ problem: "The end must be after the start." });
  });
  it("paid events aren't open: a price above zero is refused", () => {
    expect(cleanEventPosting({ ...base, price: 500 }, NOW)).toEqual({ problem: "Paid events aren't open yet. List it as free for now." });
    expect(cleanEventPosting({ ...base, price: 0 }, NOW)).toMatchObject({ value: {} });
  });
});

const ev = (o: Partial<Omit<EventListing, "terms">> & { terms?: Partial<EventListing["terms"]> }): EventListing => ({ id: "ws_1", postingId: "1", title: "Board games", company: "Pune Games", location: "Pune", description: "", waitlisted: 0, sourceId: "evt_wonderworks", sourceName: "WonderWorks events", ...o, terms: { startsAt: "2026-11-05T10:00:00Z", online: false, tags: ["Games"], ...o.terms } });

describe("what fits and Refine", () => {
  it("signals come only from what the person told us", () => {
    expect(matchEvent(ev({}), null)).toEqual({ signals: [], score: 0 });
    expect(matchEvent(ev({}), { interests: ["games"], city: "Pune" })).toMatchObject({ score: 2 });
    expect(matchEvent(ev({}), { interests: ["pottery"], city: "Delhi" })).toMatchObject({ score: 0 });
  });
  it("narrows by when, where, open seats and kind, and says how many it hid", () => {
    const items = [ev({ id: "a" }), ev({ id: "b", terms: { startsAt: "2026-12-30T10:00:00Z" } }), ev({ id: "c", terms: { online: true, capacity: 5 }, seatsLeft: 0 })];
    expect(applyFacets(items, { ...EMPTY_FACETS, when: "Next 7 days" }, NOW + 0).kept.map((x) => x.id)).toEqual(["a", "c"]);
    expect(applyFacets(items, { ...EMPTY_FACETS, where: "online" }, NOW).kept.map((x) => x.id)).toEqual(["c"]);
    expect(applyFacets(items, { ...EMPTY_FACETS, openOnly: true }, NOW).kept.map((x) => x.id)).toEqual(["a", "b"]);
    expect(applyFacets(items, { ...EMPTY_FACETS, tag: "games" }, NOW)).toMatchObject({ hidden: 0 });
  });
  it("shows the time in India time", () => {
    expect(whenLabel("2026-11-08T12:30:00Z")).toBe("Sun 8 Nov · 6:00 pm");
  });
});
