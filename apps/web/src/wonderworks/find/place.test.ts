import { describe, expect, it } from "vitest";
import { shortPlace } from "./place";

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

describe("shortPlace with a long list in brackets", () => {
  it("keeps the first two and counts the rest", async () => {
    const { shortPlace } = await import("./place");
    expect(shortPlace("Remote (Afghanistan, Albania, Algeria, Andorra, Angola)")).toBe("Remote (Afghanistan, Albania +3)");
    expect(shortPlace("Remote (India, Nepal)")).toBe("Remote (India, Nepal)");
  });
});
