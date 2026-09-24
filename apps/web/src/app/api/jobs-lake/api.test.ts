import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/domain/jobs/types";

/* Auth: a signed-in session whose email the test controls; real auth "configured". */
const session = vi.fn();
vi.mock("@/server/auth", () => {
  class AuthRequiredError extends Error {}
  return { AuthRequiredError, getSession: () => session() };
});
vi.mock("@/lib/auth/config", () => ({ authConfigured: () => true }));
/* Connectors: deterministic, so REST and MCP can be compared; DNS: public addresses only. */
const connector = vi.fn();
vi.mock("@/server/jobslake/registry", async (orig) => {
  const real = await orig<typeof import("@/server/jobslake/registry")>();
  return { ...real, runConnector: (...a: unknown[]) => connector(...a), isAvailable: async () => true };
});
vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));

import { __MemoryStore, __setJobsLakeStore, jobsLakeStore } from "@/server/jobslake/store";
import { NeedsSetupError } from "@/server/jobslake/registry";
import { POST as search } from "./v1/search/route";
import { POST as stream } from "./v1/search/stream/route";
import { GET as v1Sources } from "./v1/sources/route";
import { GET as protocol } from "./v1/protocol/route";
import { POST as mcp } from "./mcp/route";
import { GET as listSources, POST as createSource } from "./admin/sources/route";
import { DELETE as deleteSource, GET as getSource, PATCH as patchSource } from "./admin/sources/[id]/route";
import { POST as testSource } from "./admin/sources/[id]/test/route";
import { POST as activate } from "./admin/sources/[id]/activate/route";
import { PUT as putCredential } from "./admin/sources/[id]/credential/route";
import { POST as detect } from "./admin/detect/route";
import { POST as playground } from "./admin/playground/route";
import { GET as overview } from "./admin/overview/route";

const LONG = "We are hiring an experienced leader to build our identity platform. You will own strategy, roadmap and delivery across teams, partner with security engineering, and grow a world class organization serving millions of customers every single day.";
function job(over: Partial<Job> = {}): Job {
  return { id: "careers_1", sourceId: "careers", externalId: "gh:acme:1", title: "Senior Director, Identity Security", company: "Acme", location: "Bengaluru, India", country: "IN", workMode: "hybrid", currency: "INR", postedAt: "2026-09-22T00:00:00Z", observedAt: "2026-09-24T00:00:00Z", description: LONG, requirements: [], niceToHave: [], skills: [], seniority: "director", industry: "Technology", applyUrl: "https://boards.greenhouse.io/acme/jobs/1", applyPath: "employer_site", onEmployerSite: true, repostCount: 0, tags: [], ...over };
}

const ADMIN = "ops@wonderjobs.test";
const TOKEN = "t".repeat(32);
const SECRET = "sk_live_THIS_IS_THE_SECRET_9876";
const url = (p: string) => `https://wonderjobs.test/api/jobs-lake${p}`;
const post = (p: string, body?: unknown, headers: Record<string, string> = {}) => new Request(url(p), { method: "POST", headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const asAdmin = () => session.mockResolvedValue({ userId: "u-admin", tenantId: "t-admin", email: ADMIN });
const asCandidate = (n = 1) => session.mockResolvedValue({ userId: `u-${n}`, tenantId: `t-${n}`, email: `candidate${n}@example.com` });
const SEARCH = { query: { text: "identity security", locations: ["Bengaluru"] }, searchMode: "fast", limit: 50 };

const JSON_API = {
  name: "Acme Jobs API",
  config: { kind: "json_api", api: { endpoint: "https://api.acme.example/jobs", queryParam: "q", credentialHeader: "Authorization", credentialPrefix: "Bearer ", mapping: { itemsPath: "jobs", fields: { sourceJobId: "id", title: "title", employer: "company", location: "location", description: "body", applyUrl: "url", postedAt: "posted" } } } },
  credential: SECRET,
};

beforeEach(() => {
  __setJobsLakeStore(new __MemoryStore());
  session.mockReset();
  connector.mockReset();
  connector.mockImplementation(async (src: { id: string }) => (src.id === "greenhouse" ? { jobs: [job()], warnings: [] } : { jobs: [], warnings: [] }));
  process.env.SECRET_ENCRYPTION_KEY = "test-key-test-key-test-key-test-key-0123";
  process.env.JOBSLAKE_ADMIN_EMAILS = ADMIN;
  process.env.JOBSLAKE_MCP_TOKEN = TOKEN;
  process.env.JOBSLAKE_MCP_ENABLED = "1";
});
afterEach(() => {
  __setJobsLakeStore(undefined);
  for (const k of ["JOBSLAKE_ADMIN_EMAILS", "JOBSLAKE_MCP_TOKEN", "JOBSLAKE_MCP_ENABLED", "JOBSLAKE_ADMIN_ENABLED", "JOBSLAKE_SEARCH_ENABLED", "JOBSLAKE_ENABLED"]) delete process.env[k];
});

describe("admin access (WJ-JL-001/002)", () => {
  it("refuses a signed-out caller", async () => {
    const { AuthRequiredError } = await import("@/server/auth");
    session.mockRejectedValue(new AuthRequiredError());
    expect((await listSources()).status).toBe(401);
  });

  it("refuses a signed-in candidate who isn't on the allowlist", async () => {
    asCandidate();
    const r = await listSources();
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe("FORBIDDEN");
  });

  it("fails closed when no admin allowlist is configured", async () => {
    delete process.env.JOBSLAKE_ADMIN_EMAILS;
    asAdmin();
    expect((await listSources()).status).toBe(403);
  });

  it("is off entirely when the admin flag is off", async () => {
    process.env.JOBSLAKE_ADMIN_ENABLED = "0";
    asAdmin();
    expect((await listSources()).status).toBe(404);
  });

  it("lets an allowlisted admin in, and lists partnership sources as Do not use", async () => {
    asAdmin();
    const r = await listSources();
    expect(r.status).toBe(200);
    const { sources } = await r.json();
    expect(sources.find((s: { id: string }) => s.id === "partner_linkedin")).toMatchObject({ status: "do_not_use", statusLabel: "Do not use" });
    expect(sources.find((s: { id: string }) => s.id === "greenhouse")).toMatchObject({ status: "active", accessLabel: "API", health: null });
  });

  it("platform endpoints need an admin or the service token — a candidate can't read them", async () => {
    asCandidate();
    expect((await v1Sources(new Request(url("/v1/sources")))).status).toBe(403);
    expect((await v1Sources(new Request(url("/v1/sources"), { headers: { authorization: `Bearer ${TOKEN}` } }))).status).toBe(200);
    expect((await v1Sources(new Request(url("/v1/sources"), { headers: { authorization: `Bearer ${"x".repeat(32)}` } }))).status).toBe(403);
  });
});

describe("credentials never leave the server (WJ-JL-026/027)", () => {
  it("isn't in the create, read, list, credential or audit responses", async () => {
    asAdmin();
    const created = await createSource(post("/admin/sources", JSON_API));
    expect(created.status).toBe(201);
    const createdText = await created.text();
    const id = JSON.parse(createdText).source.id as string;
    const bodies = [
      createdText,
      await (await getSource(new Request(url(`/admin/sources/${id}`)), ctx(id))).text(),
      await (await listSources()).text(),
      await (await putCredential(new Request(url(`/admin/sources/${id}/credential`), { method: "PUT", body: JSON.stringify({ secret: "sk_live_ROTATED_SECRET_1111" }) }), ctx(id))).text(),
      JSON.stringify(await jobsLakeStore().listAudit()),
    ];
    for (const b of bodies) {
      expect(b).not.toContain("THIS_IS_THE_SECRET");
      expect(b).not.toContain("ROTATED_SECRET");
      expect(b).not.toContain("secretRef");
    }
    expect(JSON.parse(bodies[3]).credential.masked).toBe("••••••••1111");
  });
});

describe("SSRF protection on admin input (WJ-JL-025)", () => {
  it.each([
    ["cloud metadata", "https://169.254.169.254/latest/meta-data"],
    ["localhost", "https://localhost/jobs"],
    ["plain http", "http://api.acme.example/jobs"],
    ["private IP", "https://10.0.0.5/jobs"],
  ])("refuses a %s endpoint before storing anything", async (_label, endpoint) => {
    asAdmin();
    const r = await createSource(post("/admin/sources", { ...JSON_API, credential: undefined, config: { ...JSON_API.config, api: { ...JSON_API.config.api, endpoint } } }));
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe("DESTINATION_BLOCKED");
    expect(await jobsLakeStore().listSources()).toHaveLength(0);
  });

  it("detect refuses an internal destination", async () => {
    asAdmin();
    const r = await detect(post("/admin/detect", { url: "https://metadata.google.internal/computeMetadata" }));
    expect(r.status).toBe(400);
  });

  it("detect recognizes an ATS board and a partnership portal", async () => {
    asAdmin();
    expect((await (await detect(post("/admin/detect", { url: "https://jobs.lever.co/spotify" }))).json())).toMatchObject({ kind: "ats_board", platform: "lever", slug: "spotify" });
    expect((await (await detect(post("/admin/detect", { url: "https://www.linkedin.com/jobs" }))).json())).toMatchObject({ kind: "partnership", provider: "LinkedIn" });
  });
});

describe("activation needs a real passing test (WJ-JL-008..012)", () => {
  const board = { name: "Spotify careers", config: { kind: "ats_board", platform: "lever", slug: "spotify", company: "Spotify" } };

  it("a new source starts as a Draft and can't be activated untested", async () => {
    asAdmin();
    const { source } = await (await createSource(post("/admin/sources", board))).json();
    expect(source).toMatchObject({ id: "ats_lever_spotify", status: "draft", legacySourceId: "careers" });
    const r = await activate(post(`/admin/sources/${source.id}/activate`), ctx(source.id));
    expect(r.status).toBe(409);
  });

  it("a failing test blocks activation, a passing one allows it", async () => {
    asAdmin();
    const { source } = await (await createSource(post("/admin/sources", board))).json();
    connector.mockRejectedValueOnce(new Error("api.lever.co responded 404"));
    const failed = await (await testSource(post(`/admin/sources/${source.id}/test`), ctx(source.id))).json();
    expect(failed).toMatchObject({ ok: false, error: "api.lever.co responded 404" });
    expect((await activate(post(`/admin/sources/${source.id}/activate`), ctx(source.id))).status).toBe(409);

    connector.mockResolvedValueOnce({ jobs: [job({ company: "Spotify", applyUrl: "https://jobs.lever.co/spotify/1" })], warnings: [] });
    const passed = await (await testSource(post(`/admin/sources/${source.id}/test`), ctx(source.id))).json();
    expect(passed.ok).toBe(true);
    const act = await activate(post(`/admin/sources/${source.id}/activate`), ctx(source.id));
    expect(act.status).toBe(200);
    expect((await act.json()).source.status).toBe("active");
  });

  it("partnership sources can never be activated", async () => {
    asAdmin();
    const r = await activate(post("/admin/sources/partner_linkedin/activate"), ctx("partner_linkedin"));
    expect(r.status).toBe(403);
  });

  it("a scraper without established permission is registered as Do not use", async () => {
    asAdmin();
    const r = await createSource(post("/admin/sources", { name: "Some portal", config: { kind: "scraper", governance: { permission: "not_established", termsReviewed: false, robotsReviewed: false, crawlDelaySec: 10, maxConcurrency: 1, failureThreshold: 3, retentionDays: 30, attribution: "", canonicalSourceUrl: "https://portal.example/jobs" } } }));
    expect((await r.json()).source).toMatchObject({ status: "do_not_use", accessStrategy: "scraper" });
  });

  it("built-ins can be paused but not deleted; a changed config goes back to Draft", async () => {
    asAdmin();
    expect((await deleteSource(new Request(url("/admin/sources/greenhouse")), ctx("greenhouse"))).status).toBe(403);
    const paused = await patchSource(new Request(url("/admin/sources/greenhouse"), { method: "PATCH", body: JSON.stringify({ status: "paused" }) }), ctx("greenhouse"));
    expect((await paused.json()).source.status).toBe("paused");
    const { source } = await (await createSource(post("/admin/sources", board))).json();
    await testSource(post(`/admin/sources/${source.id}/test`), ctx(source.id));
    const changed = await patchSource(new Request(url(`/admin/sources/${source.id}`), { method: "PATCH", body: JSON.stringify({ config: { ...board.config, company: "Spotify AB" } }) }), ctx(source.id));
    expect((await changed.json()).source).toMatchObject({ status: "draft" });
  });
});

describe("audit trail (WJ-JL-030)", () => {
  it("records who did what for every administrative change", async () => {
    asAdmin();
    const { source } = await (await createSource(post("/admin/sources", JSON_API))).json();
    connector.mockResolvedValueOnce({ jobs: [job({ applyUrl: "https://acme.example/j/1" })], warnings: [] });
    await testSource(post(`/admin/sources/${source.id}/test`), ctx(source.id));
    await activate(post(`/admin/sources/${source.id}/activate`), ctx(source.id));
    await putCredential(new Request(url(`/admin/sources/${source.id}/credential`), { method: "PUT", body: JSON.stringify({ secret: "sk_live_ROTATED_SECRET_1111" }) }), ctx(source.id));
    await patchSource(new Request(url(`/admin/sources/${source.id}`), { method: "PATCH", body: JSON.stringify({ status: "paused" }) }), ctx(source.id));
    await playground(post("/admin/playground", SEARCH));
    await deleteSource(new Request(url(`/admin/sources/${source.id}`)), ctx(source.id));
    const actions = (await jobsLakeStore().listAudit()).map((e) => e.action).reverse();
    expect(actions).toEqual(["source.created", "source.test_passed", "source.activated", "credential.replaced", "source.paused", "playground.search", "source.deleted"]);
    expect((await jobsLakeStore().listAudit()).every((e) => e.actor === ADMIN)).toBe(true);
  });
});

describe("v1 search (WJ-JL-031..034)", () => {
  it("needs a session or the service token", async () => {
    const { AuthRequiredError } = await import("@/server/auth");
    session.mockRejectedValue(new AuthRequiredError());
    expect((await search(post("/v1/search", SEARCH))).status).toBe(401);
  });

  it("rejects a search with nothing to search for — no invented default", async () => {
    asCandidate();
    const r = await search(post("/v1/search", { query: { locations: ["Remote"] } }));
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe("INVALID_REQUEST");
  });

  it("returns canonical opportunities; a candidate sees category-level source messages only", async () => {
    asCandidate();
    connector.mockImplementation(async (src: { id: string }) => {
      if (src.id === "greenhouse") return { jobs: [job()], warnings: [] };
      throw new Error("internal-host.acme:8443 ECONNREFUSED");
    });
    const r = await search(post("/v1/search", SEARCH));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.results[0]).toMatchObject({ title: "Senior Director, Identity Security", protocolVersion: "1.0" });
    expect(body.results[0].sourceRecords[0]).toMatchObject({ sourceId: "greenhouse", legacyJobId: "careers_1" });
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    expect(body.sources.find((s: { outcome: string }) => s.outcome === "unavailable")?.message).toBe("Temporarily unavailable");
  });

  it("is switched off by its flag", async () => {
    process.env.JOBSLAKE_SEARCH_ENABLED = "0";
    asCandidate();
    const r = await search(post("/v1/search", SEARCH));
    expect(r.status).toBe(404);
    expect((await r.json()).error.code).toBe("FEATURE_DISABLED");
  });

  it("streams real events, ending with the full response", async () => {
    asCandidate(2);
    connector.mockImplementation(async (src: { id: string }) => {
      if (src.id === "greenhouse") return { jobs: [job()], warnings: [] };
      throw new NeedsSetupError("Needs credentials");
    });
    const r = await stream(post("/v1/search/stream", SEARCH));
    expect(r.headers.get("content-type")).toContain("ndjson");
    const events = (await r.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(events[0].type).toBe("search_started");
    expect(events.at(-1).type).toBe("search_completed");
    expect(events.filter((e) => e.type === "source_completed").length).toBe(events[0].plannedSources.length);
    expect(events.at(-1).response.results).toHaveLength(1);
  });
});

describe("MCP adapter (WJ-JL-029)", () => {
  const rpc = (method: string, params?: unknown, id: number | undefined = 1) => post("/mcp", { jsonrpc: "2.0", id, method, params }, { authorization: `Bearer ${TOKEN}` });

  it("is off by default and needs the service token", async () => {
    delete process.env.JOBSLAKE_MCP_ENABLED;
    expect((await mcp(rpc("tools/list"))).status).toBe(404);
    process.env.JOBSLAKE_MCP_ENABLED = "1";
    expect((await mcp(post("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" }))).status).toBe(401);
  });

  it("lists the spec's tools", async () => {
    const r = await (await mcp(rpc("tools/list"))).json();
    expect(r.result.tools.map((t: { name: string }) => t.name)).toEqual(["search_jobs", "get_job", "refresh_job", "search_sources", "get_source_health", "get_coverage"]);
  });

  it("search_jobs returns exactly what REST returns for the same request", async () => {
    const rest = await (await search(post("/v1/search", SEARCH, { authorization: `Bearer ${TOKEN}` }))).json();
    const viaMcp = (await (await mcp(rpc("tools/call", { name: "search_jobs", arguments: SEARCH }))).json()).result;
    expect(viaMcp.isError).toBe(false);
    // The first search records runs, and the planner orders sources by that health — so compare
    // sources as a set. Timings and request ids are per-call by design.
    const strip = (r: { requestId?: string; sources: { sourceId: string; durationMs: number }[] }) => ({ ...r, requestId: undefined, sources: r.sources.map((s) => ({ ...s, durationMs: 0 })).sort((a, b) => a.sourceId.localeCompare(b.sourceId)) });
    expect(strip(viaMcp.structuredContent)).toEqual(strip(rest));
    expect(JSON.parse(viaMcp.content[0].text).results).toEqual(rest.results);
  });

  it("returns protocol errors as tool errors", async () => {
    const r = (await (await mcp(rpc("tools/call", { name: "get_job", arguments: { id: "opp_missing" } }))).json()).result;
    expect(r.isError).toBe(true);
    expect(r.structuredContent.error.code).toBe("NOT_FOUND");
  });

  it("acknowledges notifications without a body", async () => {
    expect((await mcp(post("/mcp", { jsonrpc: "2.0", method: "notifications/initialized" }, { authorization: `Bearer ${TOKEN}` }))).status).toBe(202);
  });
});

describe("overview + protocol", () => {
  it("overview counts only what happened — nothing before any run", async () => {
    asAdmin();
    const o = await (await overview()).json();
    expect(o.runs24h).toEqual({ total: 0, failed: 0, retrieved: 0, valid: 0 });
    expect(o.pool).toEqual({ opportunities: 0, employerVerified: null, multiSource: null });
    expect(o.health.noData).toBe(o.sources.active);
    expect(o.store.durable).toBe(false);
  });

  it("protocol is public and carries no data", async () => {
    const p = await (await protocol()).json();
    expect(p.version).toBe("1.0");
    expect(p.mcp.tools).toHaveLength(6);
  });
});
