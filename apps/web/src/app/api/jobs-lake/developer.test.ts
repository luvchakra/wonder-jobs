import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/domain/jobs/types";

/* Auth: a signed-in session the test controls. */
const session = vi.fn();
vi.mock("@/server/auth", async () => {
  const { NextResponse } = await import("next/server");
  class AuthRequiredError extends Error {}
  const getSession = () => session();
  const requireSession = async () => {
    try {
      return await getSession();
    } catch (e) {
      if (e instanceof AuthRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
      throw e;
    }
  };
  return { AuthRequiredError, getSession, requireSession };
});
vi.mock("@/lib/auth/config", () => ({ authConfigured: () => true }));
/* Connectors: deterministic, one job per source that's asked. */
const connector = vi.fn();
vi.mock("@/server/jobslake/registry", async (orig) => {
  const real = await orig<typeof import("@/server/jobslake/registry")>();
  return { ...real, runConnector: (...a: unknown[]) => connector(...a), isAvailable: async () => true };
});
vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));

import { __MemoryStore, __setJobsLakeStore } from "@/server/jobslake/store";
import { __setApiStore, MemoryApiStore } from "@/server/jobslake/apiStore";
import { hashKey } from "@/server/jobslake/developer";
import { utcDay } from "@/domain/jobslake/apiPlan";
import { GET as listKeys, POST as createKey } from "./keys/route";
import { DELETE as revokeKey } from "./keys/[id]/route";
import { POST as search } from "./v1/search/route";
import { POST as stream } from "./v1/search/stream/route";
import { GET as getOpp } from "./v1/opportunities/[id]/route";
import { GET as v1Sources } from "./v1/sources/route";
import { POST as telemetry } from "./v1/telemetry/route";
import { POST as mcp } from "./mcp/route";

const LONG = "We are hiring an experienced leader to build our identity platform. You will own strategy, roadmap and delivery across teams, partner with security engineering, and grow a world class organization serving millions of customers every single day.";
function job(sourceId: string, over: Partial<Job> = {}): Job {
  const host = sourceId === "greenhouse" ? "boards.greenhouse.io/acme" : `${sourceId}.example.com`;
  return { id: `${sourceId}_1`, sourceId, externalId: `${sourceId}:1`, title: "Senior Director, Identity Security", company: sourceId === "greenhouse" ? "Acme" : `Other ${sourceId}`, location: "Bengaluru, India", country: "IN", workMode: "hybrid", currency: "INR", postedAt: "2026-09-22T00:00:00Z", observedAt: "2026-09-24T00:00:00Z", description: LONG, requirements: [], niceToHave: [], skills: [], seniority: "director", industry: "Technology", applyUrl: `https://${host}/jobs/1`, applyPath: "employer_site", onEmployerSite: true, repostCount: 0, tags: [], ...over };
}

const TOKEN = "t".repeat(32);
const url = (p: string) => `https://wonderjobs.test/api/jobs-lake${p}`;
const post = (p: string, body?: unknown, headers: Record<string, string> = {}) => new Request(url(p), { method: "POST", headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const get = (p: string, headers: Record<string, string> = {}) => new Request(url(p), { headers });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
let run = 0;
const tid = (n: string) => `t-${run}-${n}`;
const as = (n: string) => session.mockResolvedValue({ userId: `u-${run}-${n}`, tenantId: tid(n), email: `${n}@example.com` });
const bearer = (key: string) => ({ authorization: `Bearer ${key}` });
const SEARCH = { query: { text: "identity security", locations: ["Bengaluru"] }, searchMode: "fast", limit: 50 };

let apis: MemoryApiStore;

async function newKey(owner: string, name = "My app"): Promise<{ key: string; id: string }> {
  as(owner);
  const r = await createKey(post("/keys", { name }));
  expect(r.status).toBe(201);
  const body = await r.json();
  return { key: body.key, id: body.apiKey.id };
}
const usedToday = (owner: string) => apis.usage(tid(owner), utcDay()).then((rows) => rows.reduce((s, r) => s + r.units, 0));

beforeEach(() => {
  run++;
  __setJobsLakeStore(new __MemoryStore());
  apis = new MemoryApiStore();
  __setApiStore(apis);
  session.mockReset();
  connector.mockReset();
  connector.mockImplementation(async (src: { id: string }) => ({ jobs: src.id === "greenhouse" || src.id === "remotive" ? [job(src.id)] : [], warnings: [] }));
  process.env.SECRET_ENCRYPTION_KEY = "test-key-test-key-test-key-test-key-0123";
  process.env.JOBSLAKE_MCP_TOKEN = TOKEN;
  process.env.JOBSLAKE_MCP_ENABLED = "1";
  process.env.JOBSLAKE_API_FREE_SEARCHES = "2";
});
afterEach(() => {
  __setJobsLakeStore(undefined);
  __setApiStore(undefined);
  for (const k of ["JOBSLAKE_MCP_TOKEN", "JOBSLAKE_MCP_ENABLED", "JOBSLAKE_API_FREE_SEARCHES", "JOBSLAKE_API_SOURCE_IDS"]) delete process.env[k];
});

describe("API keys: create, list, revoke — each owner only their own", () => {
  it("shows the key once, stores only its hash, and lists it masked", async () => {
    const { key, id } = await newKey("a");
    expect(key).toMatch(/^jl_live_[A-Za-z0-9_-]{43}$/);
    const stored = [...apis.keys.values()];
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(key);
    expect(stored[0].keyHash).toBe(hashKey(key));
    const listed = await (await listKeys()).json();
    expect(listed.keys).toEqual([expect.objectContaining({ id, name: "My app", prefix: key.slice(0, 12) })]);
    expect(JSON.stringify(listed)).not.toContain(key);
    expect(JSON.stringify(listed)).not.toContain(stored[0].keyHash);
  });

  it("owner B can't list or revoke owner A's key", async () => {
    const a = await newKey("a");
    as("b");
    expect((await (await listKeys()).json()).keys).toEqual([]);
    expect((await revokeKey(new Request(url(`/keys/${a.id}`), { method: "DELETE" }), ctx(a.id))).status).toBe(404);
    // Still works for A.
    expect((await search(post("/v1/search", SEARCH, bearer(a.key)))).status).toBe(200);
    as("a");
    expect((await revokeKey(new Request(url(`/keys/${a.id}`), { method: "DELETE" }), ctx(a.id))).status).toBe(200);
    // A revoked key no longer authenticates, on REST or MCP.
    expect((await search(post("/v1/search", SEARCH, bearer(a.key)))).status).toBe(401);
    expect((await mcp(post("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" }, bearer(a.key)))).status).toBe(401);
  });

  it("caps active keys at five and needs a session", async () => {
    for (let i = 0; i < 5; i++) await newKey("a", `k${i}`);
    as("a");
    expect((await createKey(post("/keys", { name: "sixth" }))).status).toBe(409);
    const { AuthRequiredError } = await import("@/server/auth");
    session.mockRejectedValue(new AuthRequiredError());
    expect((await listKeys()).status).toBe(401);
    expect((await createKey(post("/keys", { name: "x" }))).status).toBe(401);
  });
});

describe("developer access (REST)", () => {
  it("searches with Bearer or x-api-key, recorded as an api run, candidate-safe messages, one unit each", async () => {
    const { key } = await newKey("a");
    session.mockReset(); // no session: the key alone authenticates
    const r = await search(post("/v1/search", SEARCH, bearer(key)));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.results.length).toBeGreaterThan(0);
    const r2 = await search(post("/v1/search", SEARCH, { "x-api-key": key }));
    expect(r2.status).toBe(200);
    expect(await usedToday("a")).toBe(2);
  });

  it("refuses an unknown key without falling back to a session", async () => {
    as("a");
    expect((await search(post("/v1/search", SEARCH, bearer("jl_live_" + "x".repeat(43))))).status).toBe(401);
    expect((await search(post("/v1/search", SEARCH, { "x-api-key": "nope" }))).status).toBe(401);
  });

  it("never reaches platform endpoints or telemetry", async () => {
    const { key } = await newKey("a");
    const { AuthRequiredError } = await import("@/server/auth");
    session.mockRejectedValue(new AuthRequiredError());
    expect((await v1Sources(get("/v1/sources", bearer(key)))).status).toBe(401);
    expect((await telemetry(post("/v1/telemetry", { requestId: "req_abcdefgh", bySource: {} }, bearer(key)))).status).toBe(401);
  });

  it("402 QUOTA_EXCEEDED past the free allowance without pay-as-you-go; refused requests aren't counted", async () => {
    const { key } = await newKey("a");
    expect((await search(post("/v1/search", SEARCH, bearer(key)))).status).toBe(200);
    expect((await search(post("/v1/search", SEARCH, bearer(key)))).status).toBe(200);
    const over = await search(post("/v1/search", SEARCH, bearer(key)));
    expect(over.status).toBe(402);
    const err = (await over.json()).error;
    expect(err.code).toBe("QUOTA_EXCEEDED");
    expect(err.message).toContain("2 free");
    expect(await usedToday("a")).toBe(2);
    // The stream refuses the same way, with an HTTP status rather than a 200 stream.
    expect((await stream(post("/v1/search/stream", SEARCH, bearer(key)))).status).toBe(402);
    // Another account's allowance is its own.
    const b = await newKey("b");
    expect((await search(post("/v1/search", SEARCH, bearer(b.key)))).status).toBe(200);
  });

  it("allows usage past the allowance once pay-as-you-go is active", async () => {
    const { key } = await newKey("a");
    await apis.putBilling({ ownerId: tid("a"), stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", status: "active", updatedAt: new Date().toISOString() });
    for (let i = 0; i < 3; i++) expect((await search(post("/v1/search", SEARCH, bearer(key)))).status).toBe(200);
    expect(await usedToday("a")).toBe(3);
  });

  it("doesn't count invalid requests", async () => {
    const { key } = await newKey("a");
    expect((await search(post("/v1/search", { query: { locations: [] } }, bearer(key)))).status).toBe(400);
    expect((await search(new Request(url("/v1/search"), { method: "POST", headers: bearer(key), body: "not json" }))).status).toBe(400);
    expect((await search(post("/v1/search", { ...SEARCH, sourceIds: ["remotive"] }, bearer(key)))).status).toBe(400);
    expect(await usedToday("a")).toBe(0);
  });

  it("only asks, and only returns postings from, sources an API key may reach", async () => {
    const { key } = await newKey("a");
    const body = await (await search(post("/v1/search", { ...SEARCH, searchMode: "maximum_coverage" }, bearer(key)))).json();
    const asked = connector.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(asked).toContain("greenhouse");
    expect(asked).not.toContain("remotive");
    expect(body.sources.every((s: { sourceId: string }) => ["greenhouse", "lever", "ashby", "smartrecruiters", "jazzhr"].includes(s.sourceId))).toBe(true);
    for (const o of body.results) for (const r of o.sourceRecords) expect(r.sourceId).toBe("greenhouse");

    // A candidate search puts a Remotive posting in the warm pool; a key never gets it, not by search and not by id.
    as("c");
    const cand = await (await search(post("/v1/search", { ...SEARCH, searchMode: "maximum_coverage", sourceIds: ["remotive"] }))).json();
    const remotiveOpp = cand.results.find((o: { sourceRecords: { sourceId: string }[] }) => o.sourceRecords.some((r) => r.sourceId === "remotive"));
    expect(remotiveOpp).toBeDefined();
    session.mockReset();
    const again = await (await search(post("/v1/search", { ...SEARCH, searchMode: "maximum_coverage" }, bearer(key)))).json();
    expect(again.results.some((o: { id: string }) => o.id === remotiveOpp.id)).toBe(false);
    expect((await getOpp(get(`/v1/opportunities/${remotiveOpp.id}`, bearer(key)), ctx(remotiveOpp.id))).status).toBe(404);
    // Reading an allowed opportunity is free.
    const before = await usedToday("a");
    const gh = again.results[0];
    expect((await getOpp(get(`/v1/opportunities/${gh.id}`, bearer(key)), ctx(gh.id))).status).toBe(200);
    expect(await usedToday("a")).toBe(before);
  });

  it("JOBSLAKE_API_SOURCE_IDS replaces the default allowlist", async () => {
    process.env.JOBSLAKE_API_SOURCE_IDS = "remotive";
    const { key } = await newKey("a");
    const r = await search(post("/v1/search", { ...SEARCH, searchMode: "maximum_coverage" }, bearer(key)));
    expect(r.status).toBe(200);
    expect(connector.mock.calls.map((c) => (c[0] as { id: string }).id)).toEqual(["remotive"]);
  });
});

describe("developer access (MCP)", () => {
  const rpc = (method: string, params?: unknown, id = 1) => ({ jsonrpc: "2.0", id, method, params });

  it("accepts an API key, offers only the key's tools, and meters search_jobs like REST", async () => {
    const { key } = await newKey("a");
    session.mockReset();
    const list = await (await mcp(post("/mcp", rpc("tools/list"), bearer(key)))).json();
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(["search_jobs", "get_job", "refresh_job"]);
    const call = await (await mcp(post("/mcp", rpc("tools/call", { name: "search_jobs", arguments: SEARCH }), bearer(key)))).json();
    expect(call.result.isError).toBe(false);
    expect(await usedToday("a")).toBe(1);
    const platform = await (await mcp(post("/mcp", rpc("tools/call", { name: "get_coverage", arguments: {} }), bearer(key)))).json();
    expect(platform.error.code).toBe(-32602);
    // Over the allowance, the tool result carries the same QUOTA_EXCEEDED error REST returns.
    await mcp(post("/mcp", rpc("tools/call", { name: "search_jobs", arguments: SEARCH }), bearer(key)));
    const over = await (await mcp(post("/mcp", rpc("tools/call", { name: "search_jobs", arguments: SEARCH }), bearer(key)))).json();
    expect(over.result.isError).toBe(true);
    expect(over.result.structuredContent.error.code).toBe("QUOTA_EXCEEDED");
  });

  it("still takes the service token with every tool, and refuses no credentials", async () => {
    const list = await (await mcp(post("/mcp", rpc("tools/list"), bearer(TOKEN)))).json();
    expect(list.result.tools.map((t: { name: string }) => t.name)).toContain("get_coverage");
    expect((await mcp(post("/mcp", rpc("tools/list")))).status).toBe(401);
  });

  it("stays off without JOBSLAKE_MCP_ENABLED, key or not", async () => {
    const { key } = await newKey("a");
    delete process.env.JOBSLAKE_MCP_ENABLED;
    expect((await mcp(post("/mcp", rpc("tools/list"), bearer(key)))).status).toBe(404);
  });
});
