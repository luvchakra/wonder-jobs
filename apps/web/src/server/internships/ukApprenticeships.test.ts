import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { normalizePosting } from "@/services/jobs/normalize";
import { PLATFORM_KEYS } from "@/server/jobslake/platformKeys";
import { rawFromUkApprenticeship, type UkApprenticeship } from "./providers";
import { INTERNSHIP_SOURCES, internshipSourceAvailable, runInternshipSource } from "./sources";

/** Find an apprenticeship (UK), the DfE Display Advert API v2 (WJ-583). Shapes from its published OpenAPI description. */
const needsSetup = (m: string) => Object.assign(new Error(m), { name: "NeedsSetupError" });
const src = () => INTERNSHIP_SOURCES.find((s) => s.id === "intern_uk_apprenticeships")!;

const vacancy = (ref: string, over: Partial<UkApprenticeship> = {}): UkApprenticeship => ({
  title: "Software Developer Apprentice",
  description: "Join our engineering team.",
  postedDate: "2026-11-04T09:00:00Z",
  closingDate: "2026-12-01T00:00:00Z",
  wage: { wageType: "Custom", wageAmount: 400, wageUnit: "Weekly" },
  expectedDuration: "24 months",
  addresses: [{ addressLine1: "1 High Street", addressLine3: "Leeds", addressLine4: "West Yorkshire", postcode: "LS1 4AP" }],
  employerName: "Acme Ltd",
  employerWebsiteUrl: "https://www.acme.co.uk",
  course: { title: "Software developer (level 4)", level: 4, route: "Digital" },
  apprenticeshipLevel: "Higher",
  vacancyUrl: `https://www.findapprenticeship.service.gov.uk/apprenticeship/${ref}`,
  vacancyReference: ref,
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Find an apprenticeship (UK)", () => {
  it("parses a vacancy: employer, town and outward postcode, the stated wage a year, and the apprenticeship type", () => {
    const job = normalizePosting("intern_uk_apprenticeships", rawFromUkApprenticeship(vacancy("VAC1000001")));
    expect(job).toMatchObject({ title: "Software Developer Apprentice", company: "Acme Ltd", jobType: "internship", salaryMin: 20800, salaryMax: 20800, currency: "GBP", applyUrl: "https://www.findapprenticeship.service.gov.uk/apprenticeship/VAC1000001" });
    expect(job.location).toBe("Leeds, West Yorkshire, LS1");
    expect(rawFromUkApprenticeship(vacancy("VAC2")).companyDomain).toBe("acme.co.uk");
  });

  it("shows no pay for a minimum-wage band or competitive salary, and never reads the employer contact", () => {
    const band = rawFromUkApprenticeship(vacancy("VAC3", { wage: { wageType: "ApprenticeshipMinimum", wageAmount: 0, wageUnit: "Unspecified" } }));
    expect([band.salaryMin, band.currency]).toEqual([null, null]);
    const withContact = { ...vacancy("VAC4"), employerContactName: "Jo Bloggs", employerContactEmail: "jo@acme.co.uk", employerContactPhone: "0113 000 0000" } as UkApprenticeship;
    expect(JSON.stringify(rawFromUkApprenticeship(withContact))).not.toMatch(/Jo Bloggs|jo@acme|0113/);
    expect(rawFromUkApprenticeship(vacancy("VAC5", { isNationalVacancy: true })).location).toBe("England (recruiting nationally)");
  });

  it("needs its free key (Needs setup without), set on the platform", async () => {
    vi.stubEnv("FIND_APPRENTICESHIP_API_KEY", "");
    expect(internshipSourceAvailable(src())).toBe(false);
    await expect(runInternshipSource(src(), { query: "software", locations: [] }, "normal", needsSetup)).rejects.toMatchObject({ name: "NeedsSetupError", message: expect.stringContaining("FIND_APPRENTICESHIP_API_KEY") });
    expect(PLATFORM_KEYS.find((k) => k.name === "FIND_APPRENTICESHIP_API_KEY")).toMatchObject({ free: true, signup: expect.stringContaining("developer.apprenticeships.education.gov.uk") });
  });

  it("asks v2 for the newest vacancies with the key, and the student's words decide", async () => {
    vi.stubEnv("FIND_APPRENTICESHIP_API_KEY", "uk-key");
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ vacancies: url.includes("PageNumber=1") ? [vacancy("VAC6"), vacancy("VAC7", { title: "Business Administration Apprentice", course: { title: "Business administrator (level 3)" } })] : [] }), { status: 200 });
    }));
    const r = await runInternshipSource(src(), { query: "software developer", locations: [] }, "normal", needsSetup);
    expect(calls[0].url).toContain("/vacancies/vacancy?Sort=AgeDesc&PageSize=100");
    expect(calls[0].init?.headers).toMatchObject({ "Ocp-Apim-Subscription-Key": "uk-key", "X-Version": "2" });
    expect(r.jobs.map((j) => j.title)).toEqual(["Software Developer Apprentice"]);
  });
});
