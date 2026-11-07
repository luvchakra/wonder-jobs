import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async () => ({ pushed: 0, emailed: false })) }));
vi.mock("@/server/audit", () => ({ recordServerAudit: vi.fn(async () => undefined) }));
const rows = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("../gateway/listings", () => ({ gatewayListings: vi.fn(async (_m: string, i: { offset?: number }) => ({ configured: true, results: (i.offset ?? 0) === 0 ? rows.list : [], sources: [] })) }));

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { __MemoryStore, __setJobsLakeStore } from "@/server/jobslake/store";
import { forgetGatewayOutside } from "./outside";
import { saveProfile } from "./profiles";
import { searchCofounders } from "./search";

const me: Session = { userId: "u-me", tenantId: "u-me", email: "me@example.com" };
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const gw = (over: Record<string, unknown>) => ({ module: "cofounders", sourceId: "src_1", sourceMethod: "json_api", organization: "", location: "", observedAt: day(1), expiresAt: day(-20), remote: false, status: "active", attributes: {}, ...over });

beforeEach(() => {
  resetTablesForTests();
  __setJobsLakeStore(new __MemoryStore());
  forgetGatewayOutside();
  rows.list = [
    gw({ id: "cofounders_p1", sourceName: "Hacker News", title: "Looking for a technical co-founder in fintech", description: "Payments for small shops.", canonicalUrl: "https://news.ycombinator.com/item?id=1", publishedAt: day(4), attributes: { handle: "raj" } }),
    gw({ id: "cofounders_p2", sourceName: "Hacker News", title: "Looking for a co-founder in fintech (old)", description: "Old post.", canonicalUrl: "https://news.ycombinator.com/item?id=2", publishedAt: day(200), attributes: { handle: "old" } }),
    gw({ id: "cofounders_y1", sourceName: "Y Combinator", title: "Ledgerly", description: "Fintech infrastructure for small shops.", location: "Bengaluru, India", canonicalUrl: "https://www.ycombinator.com/companies/ledgerly", publishedAt: null, attributes: { batch: "Summer 2026", teamSize: 4, oneLiner: "Fintech ledgers" } }),
  ];
});
afterEach(() => __setJobsLakeStore(undefined));

describe("Co-founders Find with outside sources", () => {
  it("finds a recent post and a startup by the searcher's words, each linking to where it was published, never a post older than 60 days", async () => {
    const r = await searchCofounders(me, { query: "fintech", places: [] });
    const byKind = Object.fromEntries(r.results.map((l) => [l.kind, l]));
    expect(byKind.post).toMatchObject({ id: "cofounders_p1", url: "https://news.ycombinator.com/item?id=1", terms: { handle: "raj" }, sourceName: "Hacker News", sourceId: "cof_outside" });
    expect(byKind.startup).toMatchObject({ id: "cofounders_y1", title: "Ledgerly", location: "Bengaluru, India", terms: { batch: "Summer 2026", teamSize: 4 }, url: "https://www.ycombinator.com/companies/ledgerly" });
    expect(r.results.map((l) => l.id)).not.toContain("cofounders_p2");
  });

  it("shows each source and what it gave: the gateway's count, and Needs setup for Reddit and Product Hunt until their keys exist", async () => {
    const r = await searchCofounders(me, { query: "fintech", places: [] });
    const line = (id: string) => r.sources.find((s) => s.id === id);
    expect(line("cof_outside")).toMatchObject({ state: "ok", count: 2 });
    expect(line("cof_reddit")).toMatchObject({ count: 0 });
    expect(["needs_setup", "skipped"]).toContain(line("cof_reddit")!.state);
    expect(["needs_setup", "skipped"]).toContain(line("cof_producthunt")!.state);
    expect(r.sources.find((s) => s.id === "cof_wonderworks")).toMatchObject({ count: 0 });
  });

  it("keeps people and posts apart: a person who is open appears as a person, a post never as one", async () => {
    await saveProfile({ userId: "u-a", tenantId: "u-a", email: "a@example.com" }, { name: "Asha", headline: "Fintech backend engineer", role: "Tech", skills: ["Engineering"], commitment: "Full time", ideaState: "open", open: true });
    const r = await searchCofounders(me, { query: "fintech", places: [] });
    expect(r.results.filter((l) => l.kind === "person")).toHaveLength(1);
    expect(r.results.filter((l) => l.kind === "post")).toHaveLength(1);
    expect(JSON.stringify(r.results.filter((l) => l.kind === "post" || l.kind === "startup"))).not.toMatch(/Asha|u-a|a@example/);
  });
});
