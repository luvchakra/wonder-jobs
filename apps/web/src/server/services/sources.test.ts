import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { BUILTIN_SOURCES, listSources, PARTNERSHIP_SOURCES } from "@/server/jobslake/registry";
import { INTERNSHIP_SOURCES } from "@/server/internships/sources";
import { TEACHING_SOURCES } from "@/server/teaching/sources";
import { resetTablesForTests, table } from "@/server/db/table";
import { readProTags, termsFromPro } from "@/modules/services/domain";
import { FREELANCER_EXPERTS, fetchFreelancerExperts, rawFromFreelancerUser, runServicesSource, SERVICES_SOURCES, servicesSourceAvailable, WONDERSTAR_SERVICES, type FreelancerUser } from "./sources";
import { openServicePosts } from "./listings";

afterEach(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => resetTablesForTests());

const pro: FreelancerUser = {
  id: 23830177,
  username: "Designersclub3",
  display_name: "Skyapps",
  public_name: "Skyapps",
  tagline: null,
  profile_description: "App developer. WordPress and Shopify builds with clean UI.",
  hourly_rate: 25,
  closed: false,
  role: "freelancer",
  is_profile_visible: true,
  registration_date: 1487933093,
  primary_currency: { code: "USD" },
  location: { country: { name: "Pakistan" }, city: "Badin" },
  jobs: [{ name: "PHP" }, { name: "WordPress" }, { name: "Website Design" }],
  reputation: { entire_history: { overall: 4.986178141720165, reviews: 101, complete: 115, on_time: 0.9993984339773712 } },
};

describe("Talent & Services' sources are its own dataset", () => {
  it("each is a Talent & Services source; no other module lists them and this one lists none of theirs", async () => {
    for (const s of SERVICES_SOURCES) expect(s.module).toBe("services");
    const ids = SERVICES_SOURCES.map((s) => s.id);
    for (const m of ["jobs", "internships", "teaching"] as const) {
      const theirs = (await listSources(m)).map((s) => s.id);
      for (const id of ids) expect(theirs, m).not.toContain(id);
    }
    const mine = (await listSources("services")).map((s) => s.id);
    expect(mine).toEqual(ids);
    for (const s of [...BUILTIN_SOURCES, ...PARTNERSHIP_SOURCES, ...INTERNSHIP_SOURCES, ...TEACHING_SOURCES]) expect(mine).not.toContain(s.id);
  });

  it("needs no credential, uses only official APIs, and never scrapes", () => {
    for (const s of SERVICES_SOURCES) {
      expect(servicesSourceAvailable(s)).toBe(true);
      expect(s.accessStrategy).toBe("official_api");
    }
  });
});

describe("Freelancer.com experts", () => {
  it("reads only what the directory reports: skills, rate in the pro's own currency, rating, reviews, jobs finished, on-time share", () => {
    const raw = rawFromFreelancerUser(pro)!;
    expect(raw).toMatchObject({ externalId: "23830177", title: "PHP, WordPress, Website Design", company: "Skyapps", remote: true, applyUrl: "https://www.freelancer.com/u/Designersclub3", employerSite: false });
    expect(raw.location).toBe("Remote");
    const t = termsFromPro(readProTags(raw.tags!));
    expect(t).toMatchObject({ lane: "remote", category: "Development", priceKind: "hourly", priceMin: 25, currency: "USD", rating: 4.99, reviews: 101, completed: 115, onTimePct: 100, country: "Pakistan" });
  });

  it("skips closed accounts, clients, hidden profiles and pros with nothing to show", () => {
    expect(rawFromFreelancerUser({ ...pro, closed: true })).toBeNull();
    expect(rawFromFreelancerUser({ ...pro, role: "employer" })).toBeNull();
    expect(rawFromFreelancerUser({ ...pro, is_profile_visible: false })).toBeNull();
    expect(rawFromFreelancerUser({ ...pro, jobs: [], profile_description: "" })).toBeNull();
    // No rate or reputation reported: none is written.
    const bare = rawFromFreelancerUser({ ...pro, hourly_rate: null, reputation: null })!;
    expect(bare.tags!.some((x) => x.startsWith("rate:") || x.startsWith("rating:"))).toBe(false);
  });

  it("asks the directory for the client's words, and a failed call is an error, not an empty answer", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (calls.push(url), new Response(JSON.stringify({ result: { users: [pro, { ...pro, id: 2, closed: true }] } }), { status: 200 }))));
    const jobs = await fetchFreelancerExperts({ query: "wordpress developer", locations: ["Pune"] });
    expect(calls[0]).toContain("https://www.freelancer.com/api/users/0.1/users/directory/?query=wordpress%20developer");
    // A remote pro isn't filtered out by the client's city.
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ company: "Skyapps", workMode: "remote" });
    expect(await fetchFreelancerExperts({ query: "  ", locations: [] })).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    await expect(runServicesSource(SERVICES_SOURCES.find((s) => s.id === FREELANCER_EXPERTS)!, { query: "logo", locations: [] })).rejects.toThrow(/503/);
  });
});

describe("WonderWorks pros", () => {
  it("are module-keyed rows: only open 'services' listings are read, never another module's or a draft", async () => {
    const at = new Date().toISOString();
    const row = (id: string, module: string, status: string) => ({ id, module, org_id: "org1", title: `T ${id}`, description: "d", location: "Pune", work_mode: "onsite", skills: [], attrs: { category: "Plumbing", priceKind: "visit", priceMin: 299 }, status, created_by: "u1", created_at: at, updated_at: at });
    await table("hiring_orgs").insert({ id: "org1", name: "Pune Plumbers", website: null, verified: false } as never);
    for (const r of [row("a", "services", "open"), row("b", "services", "draft"), row("c", "teaching", "open"), row("d", "services", "closed")]) await table("listings").insert(r as never);
    const posts = await openServicePosts();
    expect(posts.map((p) => p.posting.id)).toEqual(["a"]);
    expect(posts[0]).toMatchObject({ org: { name: "Pune Plumbers", verified: false }, posting: { terms: { lane: "local", category: "Plumbing", priceKind: "visit", priceMin: 299 } } });
    const jobs = await runServicesSource(SERVICES_SOURCES.find((s) => s.id === WONDERSTAR_SERVICES)!, { query: "plumber", locations: [] });
    expect(jobs.jobs.map((j) => j.externalId)).toEqual(["a"]);
  });
});
