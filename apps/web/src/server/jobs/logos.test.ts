import { afterEach, describe, expect, it, vi } from "vitest";
import { rawFromHimalayas, SOURCE_FETCHERS } from "./providers";
import { rawFromTheirStack, type TheirStackJob } from "./theirstack";
import { rawFromJSearch } from "./jsearch";
import { normalizePosting } from "@/services/jobs/normalize";

// WJ-554: each Jobs source that sends the organisation's own logo passes it on as `companyLogo` (WJ-763), so the
// shared company directory can keep it. Only the employer's logo, never a board's.
afterEach(() => vi.unstubAllGlobals());

const reply = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
const LOGO = "https://cdn.example.com/acme.png";

describe("organisation logos from Jobs sources", () => {
  it("Himalayas, TheirStack and JSearch pass the employer's logo on", () => {
    expect(rawFromHimalayas({ title: "Designer", companyName: "Acme", companyLogo: LOGO, description: "d", excerpt: "", pubDate: 1792345168, applicationLink: "https://himalayas.app/companies/acme/jobs/designer", guid: "g1" }).companyLogo).toBe(LOGO);
    const ts = { id: 1, job_title: "Designer", url: "https://acme.example/jobs/1", final_url: "https://acme.example/jobs/1", company_object: { name: "Acme", domain: "acme.example", logo: LOGO } } as unknown as TheirStackJob;
    expect(rawFromTheirStack(ts)?.companyLogo).toBe(LOGO);
    expect(rawFromJSearch({ job_id: "x", job_title: "Designer", employer_name: "Acme", employer_logo: LOGO, job_publisher: "LinkedIn", job_apply_link: "https://www.linkedin.com/jobs/view/1" })?.companyLogo).toBe(LOGO);
    expect(rawFromJSearch({ job_id: "y", job_title: "Designer", employer_name: "Acme", job_publisher: "LinkedIn", job_apply_link: "https://www.linkedin.com/jobs/view/2" })).not.toHaveProperty("companyLogo");
  });

  it("the logo reaches the posting only when it's an https image URL", () => {
    const base = { externalId: "1", title: "Designer", company: "Acme", location: "Remote", description: "d", applyUrl: "https://acme.example/jobs/1", employerSite: true };
    expect(normalizePosting("remotive", { ...base, companyLogo: LOGO }).companyLogo).toBe(LOGO);
    expect(normalizePosting("remotive", { ...base, companyLogo: "http://insecure.example/a.png" }).companyLogo).toBeUndefined();
  });

  it("Remotive, Jobicy and Remote OK pass their company logo on, and Remote OK's empty one is dropped", async () => {
    vi.stubGlobal("fetch", reply({ jobs: [{ id: 7, url: "https://remotive.com/remote-jobs/design/designer-7", title: "Product Designer", company_name: "Acme", company_logo_url: "https://remotive.com/job/7/logo", category: "Design", tags: [], job_type: "full_time", publication_date: "2026-11-05T10:00:00", candidate_required_location: "Worldwide", salary: "", description: "Design" }] }));
    const [remotive] = await SOURCE_FETCHERS.remotive.fetch({ query: "product designer", locations: [] });
    expect(remotive.companyLogo).toBe("https://remotive.com/job/7/logo");

    vi.stubGlobal("fetch", reply({ jobs: [{ id: 8, url: "https://jobicy.com/jobs/8", jobTitle: "Product Designer", companyName: "Acme", companyLogo: LOGO, jobIndustry: ["Design"], jobType: ["full-time"], jobGeo: "Anywhere", jobLevel: "Any", jobDescription: "Design", pubDate: "2026-11-05 10:00:00" }] }));
    const [jobicy] = await SOURCE_FETCHERS.jobicy.fetch({ query: "product designer", locations: [] });
    expect(jobicy.companyLogo).toBe(LOGO);

    const ok = (id: string, logo: string) => ({ id, slug: id, date: "2026-11-05T10:00:00+00:00", company: "Acme", company_logo: logo, logo, position: "Product Designer", tags: [], description: "Design", location: "Worldwide", url: `https://remoteok.com/remote-jobs/${id}` });
    vi.stubGlobal("fetch", reply([{ legal: "terms" }, ok("9", LOGO), ok("10", "")]));
    const remoteok = await SOURCE_FETCHERS.remoteok.fetch({ query: "product designer", locations: [] });
    expect(remoteok.map((j) => j.companyLogo ?? null).sort()).toEqual([LOGO, null]);
  });
});
