import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { outside } from "./search";

const opp = (employer: CanonicalOpportunity["employer"]) =>
  ({ id: "opp_1", title: "Teacher of Physics", description: "Teach physics, key stage 4 and 5.", employer, locations: ["Chelmsford, East of England, United Kingdom"], workplaceType: "onsite", compensation: undefined, canonicalApplyUrl: "https://teaching-vacancies.service.gov.uk/jobs/1", postedAt: "2026-10-30T00:00:00Z", sourceRecords: [{ sourceId: "gw", sourceName: "UK Teaching Vacancies", canonical: true }] }) as unknown as CanonicalOpportunity;

describe("an outside opening carries its school's website domain, so its logo can be found", () => {
  it("from the source's own employer domain; none stays none", () => {
    expect(outside(opp({ name: "Chelmer Valley High School", domain: "chelmervalley.essex.sch.uk" }))).toMatchObject({ company: "Chelmer Valley High School", companyDomain: "chelmervalley.essex.sch.uk", location: "Chelmsford, East of England, United Kingdom" });
    expect("companyDomain" in outside(opp({ name: "Some School" }))).toBe(false);
  });
});
