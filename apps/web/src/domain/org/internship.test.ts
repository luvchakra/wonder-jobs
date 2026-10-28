import { describe, expect, it } from "vitest";
import { cleanInternship, internshipLine, monthlyStipend } from "./internship";

describe("internship terms (WJ-413)", () => {
  it("keeps only valid terms, and only for an internship", () => {
    expect(cleanInternship({ durationMonths: 6, startsOn: "2027-01-05" }, "internship")).toEqual({ durationMonths: 6, startsOn: "2027-01-05" });
    expect(cleanInternship({ durationMonths: 6 }, "full_time")).toBeUndefined();
    expect(cleanInternship({ durationMonths: 40, startsOn: "soon" }, "internship")).toBeUndefined();
    expect(cleanInternship({ durationMonths: 2.5, startsOn: "2027-02-01" }, "internship")).toEqual({ startsOn: "2027-02-01" });
  });
  it("shows a yearly stipend per month, and says when none is stated", () => {
    expect(monthlyStipend(180_000, 240_000, "INR")).toBe("₹15,000–₹20,000 a month");
    expect(monthlyStipend(null, 240_000, "INR")).toBe("₹20,000 a month");
    expect(monthlyStipend(null, null, "INR")).toBeNull();
    expect(internshipLine({ durationMonths: 6, startsOn: "2027-01-05" }, { salaryMin: 180_000, salaryMax: 180_000, currency: "INR" })).toBe("Internship · 6 months · starts 5 Jan 2027 · stipend ₹15,000 a month");
    expect(internshipLine(undefined, { currency: "INR" })).toBe("Internship · stipend not stated");
  });
});
