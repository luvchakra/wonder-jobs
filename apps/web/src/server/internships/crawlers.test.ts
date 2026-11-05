import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { normalizePosting } from "@/services/jobs/normalize";
import { PLATFORM_KEYS } from "@/server/jobslake/platformKeys";
import { rawFromReliefWeb, type ReliefWebJob } from "./providers";
import { INTERNSHIP_SOURCES, internshipSourceAvailable, runInternshipSource } from "./sources";

/** Internships' crawlers and ReliefWeb (WJ-582): Idealist and WayUp as paused gateway crawls, ReliefWeb behind its app name. */
const dir = join(__dirname, "../../../../data-gateway/sources");
const read = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8"));
const needsSetup = (m: string) => Object.assign(new Error(m), { name: "NeedsSetupError" });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Idealist and WayUp internships, paused gateway crawls", () => {
  it.each([["idealist-internships.json", ["US", "global"]], ["wayup-internships.json", ["US"]]])("%s is a valid Internships source, paused, terms pending, polite", async (f, geography) => {
    const d = read(f);
    const { validateSource } = (await import("../../../../data-gateway/src/core.mjs")) as unknown as { validateSource: (s: unknown) => { enabled: boolean; geography?: string[] } };
    expect(validateSource(d)).toMatchObject({ enabled: false, geography });
    expect(d).toMatchObject({ kind: "crawl", discover: "sitemap", modules: ["internships"], externalRedistributionAllowed: false });
    expect(d.permissionEvidence).toMatch(/^terms pending:/);
    expect(d.permissionEvidence.length).toBeLessThan(500);
    expect(d.crawlDelayMs).toBeGreaterThanOrEqual(2000);
    expect(d.minIntervalMinutes).toBeGreaterThanOrEqual(240);
  });

  it("reads only internship pages", async () => {
    const { crawlTargets } = (await import("../../../../data-gateway/src/crawl.mjs")) as unknown as { crawlTargets: (u: string[], s: unknown, r: unknown) => string[] };
    const wayup = ["https://www.wayup.com/i-Aerospace-Defense-j-EE-Computer-Engineer-Intern-General-Dynamics-958088938532322/", "https://www.wayup.com/i-Defense-and-Space-j-2027-Associate-Systems-Engineer-Sykesville-MD-Northrop-Grumman-170693863428596/", "https://www.wayup.com/s/internships/"];
    expect(crawlTargets(wayup, read("wayup-internships.json"), [])).toEqual([wayup[0]]);
    const idealist = ["https://www.idealist.org/en/nonprofit-internship/bee458e5-communication-intern-agrigento", "https://www.idealist.org/en/nonprofit-job/abc-director", "https://www.idealist.org/en/careers/"];
    expect(crawlTargets(idealist, read("idealist-internships.json"), [])).toEqual([idealist[0]]);
  });
});

const rw = (id: number, over: Partial<ReliefWebJob["fields"]> = {}): ReliefWebJob => ({
  id,
  fields: { title: "Communications Intern", url_alias: `https://reliefweb.int/job/${id}/communications-intern`, body: "Support the communications team.", country: [{ name: "Kenya" }], city: [{ name: "Nairobi" }], source: [{ name: "UNICEF", homepage: "https://www.unicef.org" }], type: [{ name: "Internship" }], date: { created: "2026-11-01T00:00:00+00:00", closing: "2026-11-30T00:00:00+00:00" }, ...over },
});

describe("ReliefWeb internships", () => {
  it("parses a job: organisation, place, its public page, and the internship type it was asked for", () => {
    const job = normalizePosting("intern_reliefweb", rawFromReliefWeb(rw(1)));
    expect(job).toMatchObject({ title: "Communications Intern", company: "UNICEF", jobType: "internship", applyUrl: "https://reliefweb.int/job/1/communications-intern" });
    expect(job.location).toContain("Nairobi");
    expect(rawFromReliefWeb(rw(2)).companyDomain).toBe("unicef.org");
  });

  it("needs its app name (Needs setup without), set on the platform", async () => {
    vi.stubEnv("RELIEFWEB_APPNAME", "");
    const s = INTERNSHIP_SOURCES.find((x) => x.id === "intern_reliefweb")!;
    expect(internshipSourceAvailable(s)).toBe(false);
    await expect(runInternshipSource(s, { query: "communications", locations: [] }, "normal", needsSetup)).rejects.toMatchObject({ name: "NeedsSetupError", message: expect.stringContaining("RELIEFWEB_APPNAME") });
    expect(PLATFORM_KEYS.find((k) => k.name === "RELIEFWEB_APPNAME")).toMatchObject({ free: true, signup: expect.stringContaining("reliefweb.int") });
  });

  it("asks ReliefWeb's Internship type with the student's words", async () => {
    vi.stubEnv("RELIEFWEB_APPNAME", "wonderworks-test");
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ data: [rw(3, { title: "Communications Intern, Nairobi" })] }), { status: 200 }); }));
    const r = await runInternshipSource(INTERNSHIP_SOURCES.find((x) => x.id === "intern_reliefweb")!, { query: "communications", locations: [] }, "normal", needsSetup);
    expect(calls[0].url).toContain("appname=wonderworks-test");
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.query.value).toBe("communications");
    expect(body.filter.conditions).toEqual(expect.arrayContaining([{ field: "type.name", value: "Internship" }]));
    expect(r.jobs.map((j) => j.title)).toEqual(["Communications Intern, Nairobi"]);
  });
});
