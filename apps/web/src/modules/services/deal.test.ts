import { describe, expect, it } from "vitest";
import { chipsOf, cleanBooking, cleanQuote, cleanRequest, cleanReview, clientMay, paidLabel, proMay, readDeal, startLabel, summarise, warrantyUntil } from "./deal";

const T = "2026-11-01";

describe("a quote request", () => {
  it("asks a local client where and when (never the address yet), and a remote one only what they want", () => {
    expect(cleanRequest({ details: "AC not cooling, 1.5 ton.", area: "Kothrud", date: "2026-11-03", slot: "evening", budget: 900 }, "local", T)).toEqual({ value: { lane: "local", details: "AC not cooling, 1.5 ton.", area: "Kothrud", date: "2026-11-03", slot: "evening" } });
    expect(cleanRequest({ details: "AC not cooling, 1.5 ton.", area: "Kothrud", date: "2026-10-31", slot: "evening" }, "local", T)).toEqual({ problem: "Choose a day in the next three months." });
    expect(cleanRequest({ details: "AC not cooling, 1.5 ton.", date: "2026-11-03", slot: "evening" }, "local", T)).toEqual({ problem: "Add the area or pin code the job is in." });
    expect(cleanRequest({ details: "A logo for a bakery, three concepts.", budget: 8000, neededBy: "2026-11-20", area: "Pune" }, "remote", T)).toEqual({ value: { lane: "remote", details: "A logo for a bakery, three concepts.", budget: 8000, neededBy: "2026-11-20" } });
    expect(cleanRequest({ details: "logo" }, "remote", T)).toMatchObject({ problem: expect.stringMatching(/Describe the work/) });
  });
});

describe("the pro's quote", () => {
  it("is priced line by line; the total is their sum; a visit has a window and a project a delivery day", () => {
    const q = cleanQuote({ items: [{ label: "Service charge", amount: 599 }, { label: "", amount: undefined }, { label: "Gas refill", amount: 2200 }], start: "2026-11-03", slot: "morning", deliverBy: "2026-11-09" }, "local", T, "at");
    expect(q).toEqual({ value: { items: [{ label: "Service charge", amount: 599 }, { label: "Gas refill", amount: 2200 }], currency: "INR", total: 2799, start: "2026-11-03", slot: "morning", validUntil: "2026-11-08", at: "at" } });
    expect(startLabel((q as { value: Parameters<typeof startLabel>[0] }).value)).toBe("Starts 3 Nov 2026, morning (8 am–12 pm)");
    expect(cleanQuote({ items: [{ label: "Concepts", amount: 8000 }], start: "2026-11-03", deliverBy: "2026-11-02" }, "remote", T, "at")).toEqual({ problem: "Delivery can't be before the start." });
    expect(cleanQuote({ items: [], start: "2026-11-03" }, "remote", T, "at")).toMatchObject({ problem: expect.stringMatching(/at least one line/) });
    expect(cleanQuote({ items: [{ label: "Fix", amount: 10.5 }], start: "2026-11-03", slot: "morning" }, "local", T, "at")).toMatchObject({ problem: expect.stringMatching(/whole rupees/) });
    expect(cleanQuote({ items: [{ label: "Fix", amount: 500 }], start: "2026-11-03" }, "local", T, "at")).toEqual({ problem: "Choose the time of day you'd come." });
  });
});

describe("booking, paid, review and what comes next", () => {
  it("a visit needs an address and a phone; a remote project neither", () => {
    expect(cleanBooking({ address: "Flat 4, Shanti Apts", phone: "+91 98765-43210" }, "local", "at")).toEqual({ value: { at: "at", address: "Flat 4, Shanti Apts", phone: "+919876543210" } });
    expect(cleanBooking({ address: "Flat 4, Shanti Apts", phone: "12" }, "local", "at")).toMatchObject({ problem: expect.stringMatching(/phone/) });
    expect(cleanBooking({}, "remote", "at")).toEqual({ value: { at: "at" } });
  });

  it("paid is each side's own mark, and Paid only when both marked it", () => {
    expect(paidLabel({}, "client")).toBeNull();
    expect(paidLabel({ paid: { client: "t" } }, "client")).toBe("You marked it paid");
    expect(paidLabel({ paid: { client: "t" } }, "pro")).toBe("The client marked it paid");
    expect(paidLabel({ paid: { client: "t", pro: "t" } }, "pro")).toBe("Paid");
    expect(chipsOf("done", { paid: { client: "t", pro: "t" }, review: { rating: 5, text: "", name: "M", at: "t" } }, "client")).toEqual(["Done", "Paid", "Reviewed"]);
    expect(chipsOf("declined", {}, "client")).toEqual(["Declined"]);
  });

  it("what each side may do at each stage", () => {
    const quote = { items: [{ label: "x", amount: 1 }], currency: "INR", total: 1, start: T, validUntil: "2026-11-02", at: "t" };
    expect(clientMay("quoted", { quote }, T)).toEqual(["accept", "cancel"]);
    expect(clientMay("quoted", { quote }, "2026-11-03")).toEqual(["cancel"]);
    expect(clientMay("booked", {}, T)).toEqual(["cancel", "paid"]);
    expect(clientMay("done", { paid: { client: "t" } }, T)).toEqual(["review", "issue"]);
    expect(clientMay("declined", {}, T)).toEqual([]);
    expect(proMay("requested", {})).toEqual(["quote", "decline"]);
    expect(proMay("booked", {})).toEqual(["done", "paid"]);
    expect(proMay("done", { paid: { pro: "t" } })).toEqual([]);
  });

  it("a review is 1–5 stars with the client's first name; the warranty runs from the day it was done", () => {
    expect(cleanReview({ rating: 5, text: " Great " }, "Meera Iyer", "t")).toEqual({ value: { rating: 5, text: "Great", name: "Meera", at: "t" } });
    expect(cleanReview({ rating: 6 }, "Meera", "t")).toEqual({ problem: "Choose 1 to 5 stars." });
    expect(warrantyUntil("2026-11-03T10:00:00Z", 30)).toBe("2026-12-03");
    expect(warrantyUntil("2026-11-03T10:00:00Z", undefined)).toBeNull();
    expect(summarise([{ rating: 5, text: "", name: "A", at: "2" }, { rating: 4, text: "", name: "B", at: "3" }])).toMatchObject({ rating: 4.5, count: 2, latest: [{ name: "B" }, { name: "A" }] });
    expect(readDeal({ quote: { items: "x" }, paid: { client: 1 }, review: { rating: 9 } })).toEqual({ paid: {} });
  });
});
