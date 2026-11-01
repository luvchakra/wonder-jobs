import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { adzunaAsks, rawFromAdzunaTeaching, ADZUNA_COUNTRIES } from "./adzuna";
import { couldBeSweden, rawFromJobTech, withoutContactDetails } from "./jobtech";
import { runTeachingSource, TEACHING_SOURCES, teachingSourceAvailable } from "./sources";
import { isTeachingTitle } from "@/modules/teaching/domain";

const src = (id: string) => TEACHING_SOURCES.find((s) => s.id === id)!;
const needsSetup = (m: string) => Object.assign(new Error(m), { name: "NeedsSetupError", message: m });
const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

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

describe("Teaching's world sources are its own and honest about keys", () => {
  it("Adzuna and USAJOBS say Needs setup without their keys; Sweden's open feed needs none", async () => {
    for (const k of ["ADZUNA_APP_ID", "ADZUNA_APP_KEY", "USAJOBS_API_KEY", "USAJOBS_EMAIL"]) vi.stubEnv(k, "");
    for (const id of ["teach_adzuna_world", "teach_usajobs", "teach_jobtech"]) expect(src(id)).toMatchObject({ module: "teaching" });
    expect(teachingSourceAvailable(src("teach_adzuna_world"))).toBe(false);
    expect(teachingSourceAvailable(src("teach_usajobs"))).toBe(false);
    expect(teachingSourceAvailable(src("teach_jobtech"))).toBe(true);
    await expect(runTeachingSource(src("teach_adzuna_world"), { query: "physics", locations: [] }, needsSetup)).rejects.toMatchObject({ name: "NeedsSetupError", message: expect.stringContaining("Adzuna") });
    await expect(runTeachingSource(src("teach_usajobs"), { query: "physics", locations: [] }, needsSetup)).rejects.toMatchObject({ name: "NeedsSetupError", message: expect.stringContaining("USAJOBS_API_KEY") });
    expect(src("teach_adzuna_world").secretRef).toBe("env:ADZUNA");
    expect(src("teach_usajobs").secretRef).toBe("env:USAJOBS");
  });
});

describe("Adzuna, English-speaking countries", () => {
  it("asks the countries a search names, all of them when it names none, none when it names only places elsewhere", () => {
    expect(adzunaAsks({ locations: [] }).map((a) => a.country.code)).toEqual(ADZUNA_COUNTRIES.map((c) => c.code));
    expect(adzunaAsks({ locations: ["Chelmsford, UK"] })).toEqual([{ country: expect.objectContaining({ code: "gb" }), where: "Chelmsford, UK" }]);
    expect(adzunaAsks({ locations: ["Toronto", "Sydney"] }).map((a) => a.country.code)).toEqual(["ca", "au"]);
    expect(adzunaAsks({ locations: ["Pune"] })).toEqual([]);
    expect(adzunaAsks({ locations: ["remote"] }).length).toBe(7);
  });

  it("shows pay only when the posting states it, in its country's currency; Adzuna's prediction is never shown", () => {
    const gb = ADZUNA_COUNTRIES[0];
    const stated = rawFromAdzunaTeaching({ id: "1", title: "Physics Teacher", salary_min: 32000, salary_max: 45000, salary_is_predicted: "0", location: { display_name: "Chelmsford, Essex" } }, gb);
    expect(stated).toMatchObject({ salaryMin: 32000, salaryMax: 45000, currency: "GBP", location: "Chelmsford, Essex" });
    const predicted = rawFromAdzunaTeaching({ id: "2", title: "Physics Teacher", salary_min: 30000, salary_max: 30000, salary_is_predicted: "1" }, gb);
    expect(predicted).toMatchObject({ salaryMin: null, salaryMax: null, currency: null, location: "United Kingdom" });
  });

  it("asks each country's API once for the words as a teaching search, keeping only teaching posts", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "id");
    vi.stubEnv("ADZUNA_APP_KEY", "key");
    const calls = stubFetch((url) =>
      url.includes("/jobs/gb/")
        ? { results: [
            { id: "a", title: "Teacher of Physics", company: { display_name: "Chelmer Valley High School" }, location: { display_name: "Chelmsford, Essex" }, description: "Teach physics to key stage 4 and 5.", redirect_url: "https://www.adzuna.co.uk/jobs/details/a", created: ago(2), salary_min: 31000, salary_max: 43000, salary_is_predicted: "0" },
            { id: "b", title: "Physics Sales Executive", company: { display_name: "EdTech Ltd" }, location: { display_name: "London" }, description: "Sell physics software.", redirect_url: "https://www.adzuna.co.uk/jobs/details/b", created: ago(2), salary_min: 25000, salary_max: 25000, salary_is_predicted: "1" },
          ] }
        : { results: [] },
    );
    const r = await runTeachingSource(src("teach_adzuna_world"), { query: "physics", locations: ["Chelmsford, UK"] }, needsSetup);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/jobs/gb/search/1");
    expect(calls[0].url).toContain("what=physics%20teacher");
    expect(calls[0].url).toContain("where=Chelmsford%2C%20UK");
    expect(r.jobs.map((j) => j.title)).toEqual(["Teacher of Physics"]);
    expect(r.jobs[0]).toMatchObject({ currency: "GBP", salaryMin: 31000 });
    const all = await runTeachingSource(src("teach_adzuna_world"), { query: "physics", locations: [] }, needsSetup);
    expect(calls.slice(1).map((c) => /jobs\/(\w+)\//.exec(c.url)![1])).toEqual(["gb", "us", "ca", "au", "nz", "za", "sg"]);
    expect(all.jobs).toHaveLength(1);
  });
});

describe("USAJOBS teaching and education jobs", () => {
  it("sends the key and the registered email, asks for the words as a teaching search, keeps only teaching posts", async () => {
    vi.stubEnv("USAJOBS_API_KEY", "k");
    vi.stubEnv("USAJOBS_EMAIL", "ops@wonderapps.biz");
    const item = (id: string, title: string) => ({ MatchedObjectId: id, MatchedObjectDescriptor: { PositionTitle: title, PositionURI: `https://www.usajobs.gov/job/${id}`, ApplyURI: [`https://www.usajobs.gov/job/${id}/apply`], PositionLocationDisplay: "Fort Hall, Idaho", OrganizationName: "Bureau of Indian Education", DepartmentName: "Department of the Interior", PublicationStartDate: ago(3), UserArea: { Details: { JobSummary: "Teach grades 6 to 8 at a BIE school." } } } });
    const calls = stubFetch(() => ({ SearchResult: { SearchResultItems: [item("1", "Teacher (Middle School Science)"), item("2", "Management Analyst")] } }));
    const r = await runTeachingSource(src("teach_usajobs"), { query: "science", locations: [] }, needsSetup);
    expect(calls[0].url).toContain("data.usajobs.gov/api/search");
    expect(calls[0].url).toContain("Keyword=science%20teacher");
    expect(calls[0].init?.headers).toMatchObject({ "Authorization-Key": "k", "User-Agent": "ops@wonderapps.biz" });
    expect(r.jobs.map((j) => j.title)).toEqual(["Teacher (Middle School Science)"]);
  });
});

describe("Sweden's public employment service (CC0)", () => {
  const hit = { id: "31660376", headline: "Teacher, Science, Biology, Chemistry, Physics", webpage_url: "https://arbetsformedlingen.se/platsbanken/annonser/31660376", publication_date: "2026-10-29T11:14:00", employer: { name: "Internationella Engelska Skolan i Sverige AB", url: "https://www.engelska.se" }, workplace_address: { municipality: "Norrtälje", region: "Stockholms län", country: "Sverige" }, working_hours_type: { label: "Heltid" }, occupation: { label: "Lärare i grundskolan, årskurs 7-9" }, description: { text: "Teach science in English. Questions? Call Peter on +46 8 123 456 78 or email peter-john.fyles@engelska.se. We offer a good team." } };

  it("keeps a posting without its contact person's details, with the school's website and the ad's own page", () => {
    expect(withoutContactDetails("Call +46 8 123 456 78 or mail a.b@x.se today. Apply by 2026-11-30 (ref 31660376).")).toBe("Call or mail today. Apply by 2026-11-30 (ref 31660376).");
    const raw = rawFromJobTech(hit);
    expect(raw).toMatchObject({ externalId: "jobtech:31660376", company: "Internationella Engelska Skolan i Sverige AB", companyDomain: "https://www.engelska.se", location: "Norrtälje, Stockholms län, Sverige", applyUrl: hit.webpage_url, jobType: ["full_time"] });
    expect(raw.description).not.toMatch(/@|\+46/);
  });

  it("asks the education field once, with the words; a search for a place elsewhere asks nothing", async () => {
    const calls = stubFetch(() => ({ hits: [hit, { id: "9", headline: "Doktorand i medicinsk strålningsfysik", webpage_url: "https://arbetsformedlingen.se/platsbanken/annonser/9", employer: { name: "Uppsala universitet" }, description: { text: "PhD" } }] }));
    const r = await runTeachingSource(src("teach_jobtech"), { query: "physics", locations: [] }, needsSetup);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("jobsearch.api.jobtechdev.se/search");
    expect(calls[0].url).toContain("occupation-field=MVqp_eS8_kDZ");
    expect(calls[0].url).toContain("q=physics");
    expect(r.jobs.map((j) => j.title)).toEqual(["Teacher, Science, Biology, Chemistry, Physics"]);
    expect(r.jobs[0].companyDomain).toBe("engelska.se");
    expect(couldBeSweden({ locations: ["Pune"] })).toBe(false);
    expect(couldBeSweden({ locations: ["Stockholm"] })).toBe(true);
    const none = await runTeachingSource(src("teach_jobtech"), { query: "physics", locations: ["Pune"] }, needsSetup);
    expect(none.jobs).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("a failed fetch throws (Unavailable), never answers empty; Swedish titles for teachers count as teaching", async () => {
    stubFetch(() => undefined);
    await expect(runTeachingSource(src("teach_jobtech"), { query: "english", locations: [] }, needsSetup)).rejects.toThrow();
    for (const t of ["Förskollärare", "Lärare i matematik", "Speciallärare", "Lektor i fysik"]) expect(isTeachingTitle(t), t).toBe(true);
    expect(isTeachingTitle("Doktorand i medicinsk strålningsfysik")).toBe(false);
  });
});
