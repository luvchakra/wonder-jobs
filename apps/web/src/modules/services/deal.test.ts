import { describe, expect, it } from "vitest";
import { amountLabel, breakdown, chipsOf, cleanBooking, cleanQuote, cleanRequest, cleanReview, clientMay, paidLabel, proMay, readDeal, startLabel, summarise, warrantyUntil } from "./deal";

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
    expect(q).toEqual({ value: { items: [{ label: "Service charge", amount: 599 }, { label: "Gas refill", amount: 2200 }], currency: "INR", taxable: 2799, total: 2799, start: "2026-11-03", slot: "morning", validUntil: "2026-11-08", at: "at" } });
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

describe("GST and TDS on a quote: only what the pro states, and arithmetic on it", () => {
  const base = { items: [{ label: "Service charge", amount: 599 }, { label: "Gas refill", amount: 2200 }], start: "2026-11-03", slot: "morning" };
  const clean = (extra: Record<string, unknown>, gstin?: string) => cleanQuote({ ...base, ...extra }, "local", T, "at", { gstin });

  it("states no tax unless the pro does: a quote without it has no GST or TDS line", () => {
    const q = (clean({}) as { value: Parameters<typeof breakdown>[0] }).value;
    expect(q).toMatchObject({ taxable: 2799, total: 2799 });
    expect(q.gst).toBeUndefined();
    expect(q.tds).toBeUndefined();
    expect(breakdown(q).map((r) => r.label)).toEqual(["Service charge", "Gas refill", "Total"]);
  });

  it("GST needs the pro's GSTIN, a rate and a SAC; the amount is that rate on the lines, in whole paise", () => {
    expect(clean({ gstRate: 18, sac: "998733" })).toEqual({ problem: "Add your GSTIN to this service (You → Offer your services → Edit) before charging GST." });
    expect(clean({ gstRate: 18 }, "27ABCDE1234F1Z5")).toEqual({ problem: "Add the SAC code for this service (4 to 8 digits) to charge GST." });
    expect(clean({ gstRate: 18, sac: "ab12" }, "27ABCDE1234F1Z5")).toMatchObject({ problem: expect.stringMatching(/SAC/) });
    expect(clean({ gstRate: 99, sac: "998733" }, "27ABCDE1234F1Z5")).toMatchObject({ problem: expect.stringMatching(/GST rate/) });
    expect(clean({ gstRate: 18.123, sac: "998733" }, "27ABCDE1234F1Z5")).toMatchObject({ problem: expect.stringMatching(/GST rate/) });
    const q = (clean({ gstRate: 18, sac: "998733", items: [{ label: "Service charge", amount: 599 }] }, "27ABCDE1234F1Z5") as { value: Parameters<typeof breakdown>[0] }).value;
    // ₹599 at 18% is ₹107.82, never 107.82000000000001.
    expect(q).toMatchObject({ taxable: 599, gst: { rate: 18, sac: "998733", amount: 107.82 }, total: 706.82 });
    expect(breakdown(q).map((r) => [r.label, r.amount])).toEqual([["Service charge", 599], ["Taxable value", 599], ["GST at 18%", 107.82], ["Total", 706.82]]);
    expect(amountLabel(107.82, "INR")).toBe("₹107.82");
    expect(amountLabel(2799, "INR")).toBe("₹2,799");
  });

  it("TDS is the section and rate the pro names, worked on the amount before GST, and shown with what's payable after it", () => {
    expect(clean({ tdsSection: "194J" })).toMatchObject({ problem: expect.stringMatching(/section.*rate/) });
    expect(clean({ tdsRate: 10 })).toMatchObject({ problem: expect.stringMatching(/section.*rate/) });
    const q = (clean({ gstRate: 18, sac: "998733", tdsSection: "194J", tdsRate: 10 }, "27ABCDE1234F1Z5") as { value: Parameters<typeof breakdown>[0] }).value;
    // 18% on ₹2,799 is ₹503.82; 10% TDS is on the ₹2,799, not on ₹3,302.82.
    expect(q).toMatchObject({ taxable: 2799, gst: { amount: 503.82 }, total: 3302.82, tds: { section: "194J", rate: 10, amount: 279.9 }, net: 3022.92 });
    expect(breakdown(q).at(-1)).toMatchObject({ label: "Payable after TDS", amount: 3022.92, strong: true });
    // A pro without a GSTIN can still state TDS (it is on the lines).
    expect(clean({ tdsSection: "194C", tdsRate: 2 })).toMatchObject({ value: { total: 2799, tds: { amount: 55.98 }, net: 2743.02 } });
  });
});
