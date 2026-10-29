import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { normalizePosting } from "@/services/jobs/normalize";
import { BUILTIN_SOURCES, listSources, PARTNERSHIP_SOURCES } from "@/server/jobslake/registry";
import { credentialStatus } from "@/server/jobslake/credentials";
import { fetchHimalayasInternships, fetchJoobleInternships, fetchMuseInternships, fetchUsaJobsInternships, rawFromJooble, rawFromMuseInternship, rawFromUsaJobs, type UsaJobsItem } from "./providers";
import { INTERNSHIP_SOURCES, internshipSourceAvailable, runInternshipSource } from "./sources";

const NEW_IDS = ["intern_themuse", "intern_himalayas", "intern_arbeitnow", "intern_jobicy", "intern_usajobs", "intern_jooble"];
const src = (id: string) => INTERNSHIP_SOURCES.find((s) => s.id === id)!;
const needsSetup = (m: string) => Object.assign(new Error(m), { name: "NeedsSetupError" });

/** Answers each request with the body `route` gives for its URL (and records the requests). */
function stubFetch(route: (url: string, init?: RequestInit) => unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const body = route(url, init);
      return body === undefined ? new Response("nope", { status: 503 }) : new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const usaItem = (id: string, over: Partial<UsaJobsItem["MatchedObjectDescriptor"]> = {}): UsaJobsItem => ({
  MatchedObjectId: id,
  MatchedObjectDescriptor: {
    PositionTitle: "Student Trainee (Economics)",
    PositionURI: `https://www.usajobs.gov/job/${id}`,
    ApplyURI: [`https://www.usajobs.gov/job/${id}/apply`],
    PositionLocationDisplay: "Washington, District of Columbia",
    OrganizationName: "Bureau of Labor Statistics",
    DepartmentName: "Department of Labor",
    PositionOfferingType: [{ Name: "Internships" }],
    PositionSchedule: [{ Name: "Full-time" }],
    PositionRemuneration: [{ MinimumRange: "41000", MaximumRange: "52000", RateIntervalCode: "PA" }],
    PublicationStartDate: "2026-10-20T00:00:00Z",
    UserArea: { Details: { JobSummary: "Pathways internship in economic research." } },
    ...over,
  },
});

describe("Internships' new sources stay in Internships' dataset", () => {
  it("each is an Internships source, none is in Jobs' list, and Internships lists none of Jobs'", async () => {
    for (const id of NEW_IDS) expect(src(id)).toMatchObject({ module: "internships", jobTypes: ["internship"] });
    const jobs = (await listSources("jobs")).map((s) => s.id);
    for (const id of NEW_IDS) expect(jobs).not.toContain(id);
    const internships = (await listSources("internships")).map((s) => s.id);
    for (const s of [...BUILTIN_SOURCES, ...PARTNERSHIP_SOURCES]) expect(internships).not.toContain(s.id);
  });

  it("USAJOBS and Jooble need their keys (Needs setup without); the key-less ones are always available", async () => {
    vi.stubEnv("USAJOBS_API_KEY", "");
    vi.stubEnv("USAJOBS_EMAIL", "");
    vi.stubEnv("JOOBLE_API_KEY", "");
    expect(internshipSourceAvailable(src("intern_usajobs"))).toBe(false);
    expect(internshipSourceAvailable(src("intern_jooble"))).toBe(false);
    for (const id of ["intern_themuse", "intern_himalayas", "intern_arbeitnow", "intern_jobicy"]) expect(internshipSourceAvailable(src(id))).toBe(true);
    await expect(runInternshipSource(src("intern_usajobs"), { query: "economics", locations: [] }, "normal", needsSetup)).rejects.toMatchObject({ name: "NeedsSetupError", message: expect.stringContaining("USAJOBS_API_KEY") });
    await expect(runInternshipSource(src("intern_jooble"), { query: "economics", locations: [] }, "normal", needsSetup)).rejects.toMatchObject({ name: "NeedsSetupError", message: expect.stringContaining("JOOBLE_API_KEY") });
    expect(await credentialStatus("env:USAJOBS", { USAJOBS_API_KEY: "k" })).toMatchObject({ present: false });
    expect(await credentialStatus("env:USAJOBS", { USAJOBS_API_KEY: "k", USAJOBS_EMAIL: "a@b.c" })).toMatchObject({ present: true });
    expect(await credentialStatus("env:JOOBLE", { JOOBLE_API_KEY: "k" })).toMatchObject({ present: true });
  });

  it("a failed fetch throws (Unavailable), it never answers empty", async () => {
    stubFetch(() => undefined);
    await expect(runInternshipSource(src("intern_himalayas"), { query: "failing words", locations: [] }, "normal", needsSetup)).rejects.toThrow(/503/);
  });
});

describe("The Muse internships", () => {
  it("asks level=Internship, and marks what it gives as internships", async () => {
    const calls = stubFetch((u) => ({ results: u.includes("page=1") && u.includes("Flexible") ? [{ id: 7, name: "Intern - Commercial Sales", publication_date: "2026-10-27T00:00:00Z", locations: [{ name: "Flexible / Remote" }], levels: [{ name: "Internship" }], refs: { landing_page: "https://www.themuse.com/jobs/acme/intern-sales" }, company: { name: "Acme" } }] : [] }));
    const jobs = await fetchMuseInternships({ query: "sales", locations: ["Remote"] });
    expect(calls.every((c) => c.url.includes("level=Internship"))).toBe(true);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ title: "Intern - Commercial Sales", company: "Acme", jobType: "internship", jobTypeFrom: "source" });
    expect(normalizePosting("x", rawFromMuseInternship({ id: 1, name: "Analyst", publication_date: "2026-10-27", refs: { landing_page: "https://m/1" } })).jobType).toBe("internship");
  });
});

describe("Himalayas internships", () => {
  it("asks employment_type=Intern with the student's words", async () => {
    const calls = stubFetch((u) => ({ jobs: u.includes("page=1") ? [{ guid: "h1", title: "Marketing Intern", companyName: "Orbit", description: "Help the growth marketing team.", excerpt: "", employmentType: "Intern", pubDate: 1793232000, applicationLink: "https://orbit.example/apply/1", minSalary: 24000, maxSalary: 30000, currency: "USD" }] : [] }));
    const jobs = await fetchHimalayasInternships({ query: "growth marketing", locations: [] });
    expect(calls[0].url).toContain("employment_type=Intern");
    expect(calls[0].url).toContain("q=growth%20marketing");
    expect(jobs).toEqual([expect.objectContaining({ title: "Marketing Intern", jobType: "internship" })]);
  });
});

describe("USAJOBS student internships", () => {
  it("reads USAJOBS' own offering type, yearly pay only, and the apply link", () => {
    const job = normalizePosting("intern_usajobs", rawFromUsaJobs(usaItem("1")));
    expect(job).toMatchObject({ title: "Student Trainee (Economics)", company: "Bureau of Labor Statistics · Department of Labor", jobType: "internship", applyUrl: "https://www.usajobs.gov/job/1/apply" });
    expect(job).toMatchObject({ salaryMin: 41000, salaryMax: 52000, currency: "USD" });
    const hourly = rawFromUsaJobs(usaItem("2", { PositionRemuneration: [{ MinimumRange: "18", MaximumRange: "22", RateIntervalCode: "PH" }] }));
    expect([hourly.salaryMin, hourly.salaryMax, hourly.currency]).toEqual([null, null, null]);
    // A student posting that is neither offered nor titled as an internship isn't one.
    expect(normalizePosting("intern_usajobs", rawFromUsaJobs(usaItem("3", { PositionTitle: "Clerk", PositionOfferingType: [{ Name: "Permanent" }] }))).jobType).not.toBe("internship");
  });

  it("asks HiringPath=student with the key and registered email", async () => {
    vi.stubEnv("USAJOBS_API_KEY", "usa-key");
    vi.stubEnv("USAJOBS_EMAIL", "ops@example.com");
    const calls = stubFetch(() => ({ SearchResult: { SearchResultItems: [usaItem("4", { PositionTitle: "Economics Intern" }), usaItem("5", { PositionTitle: "Economist", PositionOfferingType: [{ Name: "Permanent" }] })] } }));
    const r = await runInternshipSource(src("intern_usajobs"), { query: "economics", locations: ["Washington"] }, "normal", needsSetup);
    expect(calls[0].url).toContain("HiringPath=student");
    expect(calls[0].url).toContain("LocationName=Washington");
    expect(calls[0].init?.headers).toMatchObject({ "Authorization-Key": "usa-key", "User-Agent": "ops@example.com" });
    expect(r.jobs.map((j) => j.title)).toEqual(["Economics Intern"]);
  });

  it("fetchUsaJobsInternships asks once per place searched", async () => {
    vi.stubEnv("USAJOBS_API_KEY", "usa-key");
    vi.stubEnv("USAJOBS_EMAIL", "ops@example.com");
    const calls = stubFetch(() => ({ SearchResult: { SearchResultItems: [] } }));
    await fetchUsaJobsInternships({ query: "biology", locations: ["Denver", "Boston"] });
    expect(calls.map((c) => new URL(c.url).searchParams.get("LocationName"))).toEqual(["Denver", "Boston"]);
  });
});

describe("Jooble internships", () => {
  it("parses a Jooble job, its own type deciding", () => {
    const raw = rawFromJooble({ id: 9, title: "<b>Data</b> Intern", location: "Pune, Maharashtra", snippet: "&nbsp;Work with the <b>data</b> team", salary: "₹15,000 per month", type: "Internship", link: "https://jooble.org/desc/9", company: "Nimbus", updated: "2026-10-26T10:00:00" });
    expect(raw).toMatchObject({ externalId: "jooble:9", title: "Data Intern", description: "Work with the data team", company: "Nimbus", salaryText: "₹15,000 per month" });
    expect(normalizePosting("intern_jooble", raw).jobType).toBe("internship");
  });

  it("POSTs the student's words as an internship search, keeping only internships", async () => {
    vi.stubEnv("JOOBLE_API_KEY", "jb-key");
    const calls = stubFetch(() => ({ jobs: [
      { id: 1, title: "Data Analyst Intern", location: "Pune", type: "Internship", link: "https://jooble.org/desc/1", company: "Nimbus" },
      { id: 2, title: "Data Analyst", location: "Pune", type: "Full-time", link: "https://jooble.org/desc/2", company: "Nimbus" },
    ] }));
    const r = await runInternshipSource(src("intern_jooble"), { query: "data analyst", locations: ["Pune"] }, "normal", needsSetup);
    expect(calls[0].url).toBe("https://jooble.org/api/jb-key");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ keywords: "data analyst intern", location: "Pune", page: "1" });
    expect(r.jobs.map((j) => j.title)).toEqual(["Data Analyst Intern"]);
    // Words that already ask for an internship are sent as typed.
    await fetchJoobleInternships({ query: "data analyst internship", locations: [] });
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ keywords: "data analyst internship", location: "", page: "1" });
  });
});

describe("Arbeitnow and Jobicy internships", () => {
  it("keep only postings their job types (or titles) call internships", async () => {
    stubFetch((u) =>
      u.includes("arbeitnow")
        ? { data: [
            { slug: "a1", company_name: "Berlin AG", title: "Marketing (m/w/d)", description: "Praktikum im Marketing", remote: false, url: "https://www.arbeitnow.com/jobs/a1", tags: [], job_types: ["Praktikum"], location: "Berlin", created_at: 1793232000 },
            { slug: "a2", company_name: "Berlin AG", title: "Marketing Manager", description: "Marketing lead", remote: false, url: "https://www.arbeitnow.com/jobs/a2", tags: [], job_types: ["Full Time"], location: "Berlin", created_at: 1793232000 },
          ] }
        : { jobs: [
            { id: 1, url: "https://jobicy.com/jobs/1", jobTitle: "Marketing Assistant", companyName: "Remote Co", jobIndustry: ["Marketing"], jobType: ["Internship"], jobGeo: "Anywhere", jobLevel: "Entry", jobDescription: "Marketing internship", pubDate: "2026-10-26" },
            { id: 2, url: "https://jobicy.com/jobs/2", jobTitle: "Marketing Lead", companyName: "Remote Co", jobIndustry: ["Marketing"], jobType: ["Full-Time"], jobGeo: "Anywhere", jobLevel: "Senior", jobDescription: "Marketing lead", pubDate: "2026-10-26" },
          ] },
    );
    const a = await runInternshipSource(src("intern_arbeitnow"), { query: "marketing", locations: [] }, "normal", needsSetup);
    expect(a.jobs.map((j) => j.title)).toEqual(["Marketing (m/w/d)"]);
    const j = await runInternshipSource(src("intern_jobicy"), { query: "marketing", locations: [] }, "normal", needsSetup);
    expect(j.jobs.map((x) => x.title)).toEqual(["Marketing Assistant"]);
  });
});
