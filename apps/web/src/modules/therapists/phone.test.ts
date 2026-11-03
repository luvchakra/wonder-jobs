import { describe, expect, it } from "vitest";
import { cleanPhone, telHref } from "./domain";

describe("a mapped practice's published phone", () => {
  it("keeps the first plausible number the map gives, and drops anything else", () => {
    expect(cleanPhone("+91 20 1234 5678")).toBe("+91 20 1234 5678");
    expect(cleanPhone("020-2345 6789; +91 98765 43210")).toBe("020-2345 6789");
    expect(cleanPhone("call me")).toBeUndefined();
    expect(cleanPhone("12345")).toBeUndefined();
    expect(cleanPhone("javascript:alert(1)")).toBeUndefined();
    expect(cleanPhone(undefined)).toBeUndefined();
  });

  it("dials only digits and a leading plus", () => {
    expect(telHref("+91 (20) 1234-5678")).toBe("tel:+912012345678");
  });
});
