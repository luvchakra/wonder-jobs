import { describe, expect, it } from "vitest";
import { shareOf } from "./share";
import type { TeachingListing } from "./domain";

const base = {
  title: "Maths Teacher",
  company: "Chelmer Valley High School",
  companyDomain: "chelmervalley.essex.sch.uk",
  location: "Chelmsford, Essex, United Kingdom",
  description: "Teach maths to key stage 3 to 5. A friendly department.",
  sourceName: "Adzuna",
  postedAt: "2026-11-01T00:00:00Z",
  terms: { subject: "Maths", hours: "full_time", grades: ["secondary", "senior"] },
  termsFrom: "posting",
} as unknown as TeachingListing;

describe("Teaching share", () => {
  it("gives a public page for a school's own post and for an outside one", () => {
    const own = shareOf({ ...base, id: "ws_78hv3v", origin: "wonderstar", companyVerified: true } as TeachingListing);
    expect(own.url).toMatch(/\/s\/teaching\/ws_78hv3v$/);
    const outside = shareOf({ ...base, id: "opp_abc123", origin: "outside", applyUrl: "https://example.org/job/1" } as TeachingListing);
    expect(outside.url).toMatch(/\/s\/teaching\/opp_abc123$/);
    expect(outside.module).toBe("teaching");
    expect(outside.originalUrl).toBe("https://example.org/job/1");
    expect(own.originalUrl).toBeUndefined();
  });

  it("leads with the school (its logo) and carries the details the image shows", () => {
    const s = shareOf({ ...base, id: "opp_abc123", origin: "outside" } as TeachingListing);
    expect(s.facts?.[0]).toBe("Chelmer Valley High School");
    expect((s.lines ?? []).filter(Boolean).join("|")).toContain("Subject: Maths");
    expect(s.details).toContain("key stage 3");
  });
});
