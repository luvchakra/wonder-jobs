import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { isRecruiteeIntern, PERSONIO_INTERN_TYPES } from "./providers";
import { INTERNSHIP_SOURCES, runInternshipSource } from "./sources";

/** Personio and Recruitee career sites for Internships (WJ-584), through WorksLake's shared connectors. */
const needsSetup = (m: string) => Object.assign(new Error(m), { name: "NeedsSetupError" });
const src = (id: string) => INTERNSHIP_SOURCES.find((s) => s.id === id)!;

const position = (id: string, name: string, employmentType: string) =>
  `<position><id>${id}</id><name>${name}</name><office>Berlin</office><department>Ops</department><employmentType>${employmentType}</employmentType><seniority>entry-level</seniority><schedule>full-time</schedule><keywords></keywords><createdAt>2026-11-01T10:00:00+00:00</createdAt><jobDescriptions><jobDescription><name>About</name><value>Join us in Berlin.</value></jobDescription></jobDescriptions></position>`;

afterEach(() => vi.unstubAllGlobals());

describe("Personio career sites, intern roles only", () => {
  it("keeps internships, working-student roles and traineeships, each marked an internship", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      String(url).includes("1komma5grad")
        ? new Response(`<?xml version="1.0"?><workzag-jobs>${position("1", "Operations Intern", "intern")}${position("2", "Werkstudent Operations", "working_student")}${position("3", "Operations Manager", "permanent")}</workzag-jobs>`, { status: 200 })
        : new Response("<workzag-jobs></workzag-jobs>", { status: 200 }),
    ));
    const r = await runInternshipSource(src("intern_personio"), { query: "operations", locations: [] }, "normal", needsSetup);
    expect(r.jobs.map((j) => j.title).sort()).toEqual(["Operations Intern", "Werkstudent Operations"]);
    expect(r.jobs.every((j) => j.jobType === "internship")).toBe(true);
    expect([...PERSONIO_INTERN_TYPES]).toEqual(["intern", "working_student", "trainee"]);
  });
});

describe("Recruitee career sites, intern roles only", () => {
  it("keeps only offers Recruitee types as internships or traineeships", async () => {
    expect(isRecruiteeIntern({ employment_type_code: "internship" })).toBe(true);
    expect(isRecruiteeIntern({ employment_type_code: "fulltime_permanent" })).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      new Response(JSON.stringify({ offers: String(url).includes("bunq") ? [
        { id: 1, title: "Product Intern", status: "published", careers_url: "https://bunq.recruitee.com/o/product-intern", employment_type_code: "internship", city: "Amsterdam", country: "Netherlands", description: "Product work", published_at: "2026-11-01" },
        { id: 2, title: "Product Manager", status: "published", careers_url: "https://bunq.recruitee.com/o/product-manager", employment_type_code: "fulltime_permanent", city: "Amsterdam", country: "Netherlands", description: "Product work", published_at: "2026-11-01" },
      ] : [] }), { status: 200 }),
    ));
    const r = await runInternshipSource(src("intern_recruitee"), { query: "product", locations: [] }, "normal", needsSetup);
    expect(r.jobs.map((j) => j.title)).toEqual(["Product Intern"]);
  });
});
