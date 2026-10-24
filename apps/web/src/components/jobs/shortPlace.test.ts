import { describe, expect, it } from "vitest";
import { shortPlace } from "./JobCard";

describe("a job card's place line", () => {
  it("shows the first place and how many more, without the work-mode words sources mix in", () => {
    expect(shortPlace("San Francisco, CA • New York, NY • United States")).toBe("San Francisco, CA +2");
    expect(shortPlace("San Francisco · Remote · Hybrid")).toBe("San Francisco");
    expect(shortPlace("North America · Remote · Remote")).toBe("North America");
    expect(shortPlace("Remote · Remote")).toBe("Remote");
    expect(shortPlace("San Diego (Mira Mesa / 4S Ranch), CA, United States")).toBe("San Diego (Mira Mesa / 4S Ranch), CA, United States");
    expect(shortPlace("Bengaluru, India")).toBe("Bengaluru, India");
  });
});
