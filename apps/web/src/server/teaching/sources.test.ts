import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { BUILTIN_SOURCES, listSources, PARTNERSHIP_SOURCES } from "@/server/jobslake/registry";
import { INTERNSHIP_SOURCES } from "@/server/internships/sources";
import { runTeachingSource, TEACHING_SOURCES, teachingSourceAvailable } from "./sources";

const src = (id: string) => TEACHING_SOURCES.find((s) => s.id === id)!;
const needsSetup = (m: string) => Object.assign(new Error(m), { name: "NeedsSetupError" });

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

const himalayas = (title: string, guid: string) => ({ title, companyName: "Stride, Inc.", description: `${title}. Teach grade 9 physics online.`, excerpt: "", pubDate: Date.parse("2026-10-28T00:00:00Z") / 1000, applicationLink: `https://himalayas.app/jobs/${guid}`, guid, locationRestrictions: [] });

describe("Teaching's sources are its own dataset", () => {
  it("each is a Teaching source; Jobs and Internships list none of them, and Teaching lists none of theirs", async () => {
    for (const s of TEACHING_SOURCES) expect(s.module).toBe("teaching");
    const ids = TEACHING_SOURCES.map((s) => s.id);
    for (const m of ["jobs", "internships"] as const) {
      const theirs = (await listSources(m)).map((s) => s.id);
      for (const id of ids) expect(theirs, m).not.toContain(id);
    }
    const teaching = (await listSources("teaching")).map((s) => s.id);
    expect(teaching).toEqual(ids);
    for (const s of [...BUILTIN_SOURCES, ...PARTNERSHIP_SOURCES, ...INTERNSHIP_SOURCES]) expect(teaching).not.toContain(s.id);
  });

  it("Adzuna and Jooble need their keys (Needs setup without); Himalayas and WonderWorks schools need none", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "");
    vi.stubEnv("ADZUNA_APP_KEY", "");
    vi.stubEnv("JOOBLE_API_KEY", "");
    expect(teachingSourceAvailable(src("teach_adzuna_in"))).toBe(false);
    expect(teachingSourceAvailable(src("teach_jooble"))).toBe(false);
    expect(teachingSourceAvailable(src("teach_himalayas"))).toBe(true);
    expect(teachingSourceAvailable(src("teach_wonderstar"))).toBe(true);
    await expect(runTeachingSource(src("teach_adzuna_in"), { query: "physics", locations: [] }, needsSetup)).rejects.toMatchObject({ name: "NeedsSetupError", message: expect.stringContaining("Adzuna") });
    await expect(runTeachingSource(src("teach_jooble"), { query: "physics", locations: [] }, needsSetup)).rejects.toMatchObject({ name: "NeedsSetupError", message: expect.stringContaining("JOOBLE_API_KEY") });
  });

  it("asks Adzuna in its Teaching category and Jooble as a teaching search, keeping only teaching posts", async () => {
    vi.stubEnv("ADZUNA_APP_ID", "id");
    vi.stubEnv("ADZUNA_APP_KEY", "key");
    vi.stubEnv("JOOBLE_API_KEY", "jk");
    const calls = stubFetch((url) => {
      if (url.includes("adzuna"))
        return { results: [
          { id: "1", title: "PGT Physics Teacher", company: { display_name: "DPS Pune" }, location: { display_name: "Pune" }, description: "CBSE school, B.Ed required. Physics for classes 11 and 12.", redirect_url: "https://adzuna.in/1", created: "2026-10-28T00:00:00Z" },
          { id: "2", title: "Physics Sales Executive", company: { display_name: "EdTech" }, location: { display_name: "Pune" }, description: "Sell physics courses.", redirect_url: "https://adzuna.in/2", created: "2026-10-28T00:00:00Z" },
        ] };
      if (url.includes("jooble")) return { jobs: [{ id: 9, title: "Physics Tutor", company: "Home Tuitions", location: "Pune", snippet: "Physics tuition for grade 10.", link: "https://jooble.org/9", updated: "2026-10-28T00:00:00Z" }] };
      return undefined;
    });
    const az = await runTeachingSource(src("teach_adzuna_in"), { query: "physics", locations: ["Pune"] }, needsSetup);
    expect(az.jobs.map((j) => j.title)).toEqual(["PGT Physics Teacher"]);
    expect(calls.some((c) => c.url.includes("category=teaching-jobs"))).toBe(true);
    const jb = await runTeachingSource(src("teach_jooble"), { query: "physics", locations: ["Pune"] }, needsSetup);
    expect(jb.jobs.map((j) => j.title)).toEqual(["Physics Tutor"]);
    expect(JSON.parse(String(calls.find((c) => c.url.includes("jooble"))!.init!.body))).toMatchObject({ keywords: "physics teacher", location: "Pune" });
  });

  it("Himalayas is asked as a teaching search; a failed fetch throws (Unavailable), never answers empty", async () => {
    const calls = stubFetch((url) => (url.includes("page=1") ? { jobs: [himalayas("High School Physics Teacher", "a"), himalayas("Physics Content Marketer", "b")] } : { jobs: [] }));
    const r = await runTeachingSource(src("teach_himalayas"), { query: "physics", locations: [] }, needsSetup);
    expect(r.jobs.map((j) => j.title)).toEqual(["High School Physics Teacher"]);
    expect(calls[0].url).toContain("q=physics%20teacher");
    stubFetch(() => undefined);
    await expect(runTeachingSource(src("teach_himalayas"), { query: "chemistry", locations: [] }, needsSetup)).rejects.toThrow();
  });
});
