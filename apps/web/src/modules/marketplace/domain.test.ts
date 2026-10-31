import { describe, expect, it } from "vitest";
import { cleanListing, cleanMessage, cleanOffer, confirmExpired, hasContactDetails, looksRisky, mayDo, prohibitedReason, statusAfter, visible, withinLimit, type Offer, type ThreadShape } from "./domain";

const ok = { title: "Study table", description: "Solid wood study table, two drawers, lightly used.", category: "Furniture", price: 3500, condition: "Used", area: "Indiranagar" };
const thread = (o: Partial<ThreadShape> = {}): ThreadShape => ({ status: "messaged", buyer: "b", seller: "s", offers: [], doneMarks: [], ...o });
const offer = (status: Offer["status"]): Offer => ({ id: "o1", amount: 3000, status, at: "2026-10-31T00:00:00Z" });

describe("cleanListing", () => {
  it("accepts a plain listing", () => expect("value" in cleanListing(ok)).toBe(true));
  it("refuses rent for now", () => expect(cleanListing({ ...ok, kind: "rent" })).toHaveProperty("problem", expect.stringContaining("Rentals")));
  it("refuses prohibited items", () => expect(cleanListing({ ...ok, title: "Air pistol for sale" })).toHaveProperty("problem", expect.stringContaining("weapons")));
  it("refuses contact details", () => expect(cleanListing({ ...ok, description: "Call me on 98450 12345 for the table." })).toHaveProperty("problem"));
  it("needs a whole-rupee price", () => expect(cleanListing({ ...ok, price: 10.5 })).toHaveProperty("problem"));
});

describe("anti-scam text rules", () => {
  it("finds phones, emails and links", () => {
    expect(hasContactDetails("mail me at a.b@x.com")).toBe(true);
    expect(hasContactDetails("see wa.me/9198")).toBe(true);
    expect(hasContactDetails("two drawers, 120 cm wide")).toBe(false);
  });
  it("flags advance-payment wording", () => expect(looksRisky("send a token amount first")).toBe(true));
  it("refuses a message with a number", () => expect(cleanMessage("call 9845012345")).toHaveProperty("problem"));
  it("names the prohibited kind", () => expect(prohibitedReason("fake passport")).toMatch(/stolen or counterfeit|documents/));
});

describe("limits and visibility", () => {
  it("counts only the window", () => {
    const at = Date.parse("2026-10-31T12:00:00Z");
    expect(withinLimit(["2026-10-31T11:30:00Z", "2026-10-30T00:00:00Z"], 2, 3_600_000, at)).toBe(true);
    expect(withinLimit(["2026-10-31T11:30:00Z", "2026-10-31T11:40:00Z"], 2, 3_600_000, at)).toBe(false);
  });
  it("hides at three reports", () => {
    expect(visible("open", 2)).toBe(true);
    expect(visible("open", 3)).toBe(false);
    expect(visible("sold", 0)).toBe(false);
  });
});

describe("offers", () => {
  it("is at most the asking price", () => {
    expect(cleanOffer(3000, 3500)).toEqual({ value: 3000 });
    expect(cleanOffer(4000, 3500)).toHaveProperty("problem");
  });
});

describe("what each side may do", () => {
  it("lets only the buyer offer, and only when none is open", () => {
    expect(mayDo(thread(), "b")).toContain("offer");
    expect(mayDo(thread(), "s")).not.toContain("offer");
    expect(mayDo(thread({ offers: [offer("pending")] }), "b")).not.toContain("offer");
  });
  it("lets only the seller answer", () => {
    const t = thread({ status: "offer", offers: [offer("pending")] });
    expect(mayDo(t, "s")).toEqual(expect.arrayContaining(["accept", "decline"]));
    expect(mayDo(t, "b")).not.toContain("accept");
    expect(mayDo(t, "b")).toContain("withdraw");
  });
  it("gives a stranger nothing and a finished deal nothing", () => {
    expect(mayDo(thread(), "x")).toEqual([]);
    expect(mayDo(thread({ status: "done" }), "b")).toEqual([]);
  });
  it("needs both sides to mark done", () => {
    const t = thread({ status: "visit", offers: [offer("accepted")], doneMarks: ["b"] });
    expect(mayDo(t, "b")).not.toContain("mark_done");
    expect(mayDo(t, "s")).toContain("confirm_done");
    expect(statusAfter(t)).toBe("visit");
    expect(statusAfter({ ...t, doneMarks: ["b", "s"] })).toBe("done");
  });
  it("expires an unconfirmed mark after 14 days", () => {
    expect(confirmExpired("2026-10-01T00:00:00Z", Date.parse("2026-10-20T00:00:00Z"))).toBe(true);
    expect(confirmExpired("2026-10-15T00:00:00Z", Date.parse("2026-10-20T00:00:00Z"))).toBe(false);
  });
});
