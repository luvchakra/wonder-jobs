import { describe, expect, it } from "vitest";
import { formatInterval, formatMoney } from "./format";

describe("billing formatting", () => {
  it("converts minor units using the currency's own decimals", () => {
    expect(formatMoney(49900, "INR")).toBe("₹499.00");
    expect(formatMoney(1999, "USD", "en-US")).toBe("$19.99");
    expect(formatMoney(500, "JPY", "en-US")).toBe("¥500");
  });
  it("describes the billing interval", () => {
    expect(formatInterval({ interval: "month", intervalCount: 1 })).toBe("per month");
    expect(formatInterval({ interval: "month", intervalCount: 3 })).toBe("every 3 months");
  });
});
