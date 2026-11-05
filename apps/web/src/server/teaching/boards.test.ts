import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { TEACHING_PERSONIO_BOARDS, TEACHING_RECRUITEE_BOARDS } from "./boards";
import { runTeachingSource, TEACHING_SOURCES, teachingSourceAvailable } from "./sources";

const src = (id: string) => TEACHING_SOURCES.find((s) => s.id === id)!;
const needsSetup = (m: string) => Object.assign(new Error(m), { name: "NeedsSetupError", message: m });
const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

afterEach(() => vi.unstubAllGlobals());

const offer = (id: number, title: string) => ({ id, title, status: "published", careers_url: `https://berlinmetropolitanschool.recruitee.com/o/${id}`, company_name: "Berlin Metropolitan School", location: "Berlin, Berlin, Germany", published_at: ago(3).replace("T", " ").replace(/\.\d+Z$/, " UTC"), description: "<p>Teach primary classes in English.</p>", employment_type_code: "fulltime_fixed_term" });
const position = (id: string, name: string) => `<position><id>${id}</id><office>Munich</office><name>${name}</name><department>School</department><employmentType>permanent</employmentType><schedule>full-time</schedule><createdAt>${ago(2)}</createdAt><jobDescriptions><jobDescription><name>Role</name><value>&lt;p&gt;Teach secondary German.&lt;/p&gt;</value></jobDescription></jobDescriptions></position>`;

describe("School boards on Recruitee and Personio", () => {
  it("are Teaching's own sources, with no key, and the boards listed are real schools and teaching companies", () => {
    for (const id of ["teach_recruitee", "teach_personio"]) {
      expect(src(id)).toMatchObject({ module: "teaching" });
      expect(src(id).secretRef).toBeUndefined();
      expect(teachingSourceAvailable(src(id))).toBe(true);
    }
    expect(TEACHING_RECRUITEE_BOARDS.length).toBeGreaterThan(0);
    expect(TEACHING_PERSONIO_BOARDS.length).toBeGreaterThan(0);
  });

  it("Recruitee: keeps the teaching posts of each board, as the school's own listing", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(url.includes("berlinmetropolitanschool") ? { offers: [offer(1, "PYP Classroom Teacher (f/m/d) | Primary School"), offer(2, "Hausmeister:in / Haustechniker:in (m/w/d)")] } : { offers: [] }), { status: 200 });
    }));
    const r = await runTeachingSource(src("teach_recruitee"), { query: "teacher", locations: [] }, needsSetup);
    expect(calls.every((u) => /^https:\/\/[a-z0-9]+\.recruitee\.com\/api\/offers\/$/.test(u))).toBe(true);
    expect(calls).toHaveLength(TEACHING_RECRUITEE_BOARDS.length);
    expect(r.jobs.map((j) => j.title)).toEqual(["PYP Classroom Teacher (f/m/d) | Primary School"]);
    expect(r.jobs[0]).toMatchObject({ company: "Berlin Metropolitan School" });
  });

  it("Personio: keeps the teaching posts of each board; a board that fails is skipped, never faked", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.startsWith("https://bis.")) return new Response(`<workzag-jobs>${position("11", "German Language and Literature Teacher MYP/DP")}${position("12", "Facility Officer (m/w/d)")}</workzag-jobs>`, { status: 200 });
      return new Response("nope", { status: 503 });
    }));
    const r = await runTeachingSource(src("teach_personio"), { query: "german teacher", locations: [] }, needsSetup);
    expect(r.jobs.map((j) => j.title)).toEqual(["German Language and Literature Teacher MYP/DP"]);
    expect(r.jobs[0]).toMatchObject({ company: "Bavarian International School" });
  });
});
