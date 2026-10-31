import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async () => ({ pushed: 0, emailed: false })) }));
vi.mock("@/server/audit", () => ({ recordServerAudit: vi.fn(async () => undefined) }));

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { __MemoryStore, __setJobsLakeStore } from "@/server/jobslake/store";
import { listSources, BUILTIN_SOURCES } from "@/server/jobslake/registry";
import { block } from "./connections";
import { saveProfile, setOpen, myProfile } from "./profiles";
import { searchCofounders } from "./search";
import { COFOUNDERS_SOURCES, runCofoundersSource } from "./sources";
import { closeTeam, createTeam } from "./teams";

const who = (n: string): Session => ({ userId: `u-${n}`, tenantId: `u-${n}`, email: `${n}@example.com` });
const [asha, ravi, meera] = ["asha", "ravi", "meera"].map(who);
const P = (extra: Record<string, unknown> = {}) => ({ name: "Private Name", headline: "Fintech backend engineer", role: "Tech", skills: ["Engineering", "Payments"], commitment: "Full time", ideaState: "open", about: "A very private story about payments", open: true, ...extra });

beforeEach(() => {
  resetTablesForTests();
  __setJobsLakeStore(new __MemoryStore());
});
afterEach(() => __setJobsLakeStore(undefined));

describe("the Co-founders WorksLake dataset", () => {
  it("is its own: its source feeds only Co-founders, and Jobs lists none of it", async () => {
    for (const s of COFOUNDERS_SOURCES) expect(s.module).toBe("cofounders");
    expect((await listSources("cofounders")).map((s) => s.id)).toEqual(COFOUNDERS_SOURCES.map((s) => s.id));
    expect((await listSources("jobs")).map((s) => s.id)).toEqual(expect.not.arrayContaining(COFOUNDERS_SOURCES.map((s) => s.id)));
    expect(BUILTIN_SOURCES.some((s) => s.module === "cofounders")).toBe(false);
  });

  it("what it carries is only the public fields", async () => {
    await saveProfile(asha, P());
    const { jobs } = await runCofoundersSource(COFOUNDERS_SOURCES[0], { query: "fintech", locations: [] });
    expect(jobs).toHaveLength(1);
    expect(JSON.stringify(jobs)).not.toMatch(/Private Name|private story|u-asha/);
  });
});

describe("Co-founders Find", () => {
  it("lists matching open people and teams with the provenance line; reads each result fresh, never someone who closed", async () => {
    await saveProfile(asha, P());
    await saveProfile(ravi, P({ headline: "Fintech designer", role: "Business", skills: ["Design"] }));
    await saveProfile(meera, P());
    await createTeam(ravi, { name: "Fintech Chaser", idea: "Invoices that chase themselves", stage: "Idea", openRoles: [{ role: "Tech", skills: ["Engineering"] }], open: true });
    const first = await searchCofounders(meera, { query: "fintech", places: [] });
    expect(first.results.map((r) => r.title).sort()).toEqual(["Fintech Chaser", "Fintech backend engineer", "Fintech designer"].sort());
    expect(first.sources).toEqual([expect.objectContaining({ id: "cof_wonderworks", state: "ok", count: 3 })]);
    expect(JSON.stringify(first)).not.toMatch(/Private Name|private story|u-/);
    // Ravi closes his listing: the cached WorksLake answer can't bring it back.
    await setOpen(ravi, false);
    expect((await searchCofounders(meera, { query: "fintech", places: [] })).results.map((r) => r.title).sort()).toEqual(["Fintech Chaser", "Fintech backend engineer"]);
  });

  it("never lists the searcher to themselves or their own team; hides blocked people both ways and a closed team", async () => {
    await saveProfile(asha, P());
    await saveProfile(ravi, P({ headline: "Fintech designer" }));
    const { id: teamId } = await createTeam(ravi, { name: "Fintech Chaser", idea: "Invoices that chase themselves", stage: "Idea", openRoles: [{ role: "Tech", skills: [] }], open: true });
    expect((await searchCofounders(ravi, { query: "fintech", places: [] })).results.map((r) => r.title)).toEqual(["Fintech backend engineer"]);
    await block(asha, "person", (await myProfile(ravi))!.publicId);
    expect((await searchCofounders(asha, { query: "fintech", places: [] })).results).toEqual([]);
    expect((await searchCofounders(ravi, { query: "fintech", places: [] })).results).toEqual([]);
    await closeTeam(ravi, teamId);
    expect((await searchCofounders(meera, { query: "fintech", places: [] })).results.map((r) => r.title)).not.toContain("Fintech Chaser");
  });
});
