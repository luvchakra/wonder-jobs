import { describe, expect, it } from "vitest";
import { companyLogoSrc } from "./CompanyLogo";

describe("one logo URL per company, whichever module asks", () => {
  it("asks by the cleaned domain when a website or domain is known, so every module shares the cached copy", () => {
    const a = companyLogoSrc({ name: "Sunrise School", website: "https://www.sunrise.edu.in/admissions?x=1" });
    expect(a).toBe(companyLogoSrc({ name: "Sunrise Public School", domain: "sunrise.edu.in" }));
    expect(a).toMatch(/^\/api\/company-logo\?d=sunrise\.edu\.in&v=\d+$/);
  });
  it("falls back to the normalized name, and gives nothing to ask by as null", () => {
    expect(companyLogoSrc({ name: "IBM Corporation" })).toBe(companyLogoSrc({ name: "IBM" }));
    expect(companyLogoSrc({ name: "  " })).toBeNull();
  });
});
