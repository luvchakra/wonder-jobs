import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/domain/jobs/types";

const connector = vi.fn();
const dnsLookup = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...a: unknown[]) => dnsLookup(...a) }));
vi.mock("./registry", async (orig) => {
  const real = await orig<typeof import("./registry")>();
  return { ...real, runConnector: (...a: unknown[]) => connector(...a), isAvailable: async () => true };
});

import { __MemoryStore, __setJobsLakeStore, jobsLakeStore } from "./store";
import { publicStatus, search, testSource } from "./core";
import { BUILTIN_SOURCES } from "./registry";
import { NeedsSetupError } from "./registry";
import { maskCredential, saveCredential, credentialStatus, readCredential } from "./credentials";
import { safeFetch, DestinationBlockedError } from "./safeFetch";
import { parseFeed, parseJobPostingLd, fetchMcp } from "./custom";

const LONG = "We are hiring an experienced leader to build our identity platform. You will own strategy, roadmap and delivery across teams, partner with security engineering, and grow a world class organization serving millions of customers every single day.";
function job(over: Partial<Job>): Job {
  return { id: "careers_1", sourceId: "careers", externalId: "gh:acme:1", title: "Senior Director, Identity Security", company: "Acme", location: "Bengaluru, India", country: "IN", workMode: "hybrid", currency: "INR", postedAt: "2026-09-22T00:00:00Z", observedAt: new Date().toISOString(), description: LONG, requirements: [], niceToHave: [], skills: [], seniority: "director", industry: "Technology", applyUrl: "https://boards.greenhouse.io/acme/jobs/1", applyPath: "employer_site", onEmployerSite: true, repostCount: 0, tags: [], ...over };
}

const req = (over: Record<string, unknown> = {}) => ({ query: { text: "identity security", locations: [] as string[] }, searchMode: "balanced" as const, limit: 100, ...over });

beforeEach(() => {
  __setJobsLakeStore(new __MemoryStore());
  connector.mockReset();
  process.env.SECRET_ENCRYPTION_KEY = "test-key-test-key-test-key-test-key-0123";
});
afterEach(() => __setJobsLakeStore(undefined));

describe("JobsLake core search", () => {
  it("WJ-JL-035: a failing source doesn't fail the others; the failure is reported and recorded", async () => {
    connector.mockImplementation(async (src: { id: string }) => {
      if (src.id === "greenhouse") return { jobs: [job({})], warnings: [] };
      if (src.id === "jobicy") throw new Error("jobicy.com responded 503");
      if (src.id === "adzuna_in") throw new NeedsSetupError("needs creds");
      return { jobs: [], warnings: [] };
    });
    const events: string[] = [];
    const { response } = await search(req(), { trigger: "search", emit: (e) => events.push(e.type) });
    expect(response.results).toHaveLength(1);
    expect(response.sources.find((s) => s.sourceId === "jobicy")).toMatchObject({ outcome: "unavailable", message: "jobicy.com responded 503" });
    expect(response.metadata.sourcesFailed).toBeGreaterThanOrEqual(1);
    expect(events[0]).toBe("search_started");
    expect(events.at(-1)).toBe("search_completed");
    expect(events).toContain("source_completed");
    const runs = await jobsLakeStore().listRuns();
    expect(runs.find((r) => r.sourceId === "jobicy")).toMatchObject({ outcome: "unavailable", errorCode: "SOURCE_UNAVAILABLE" });
    // The candidate-facing copy of a status never carries the raw upstream message.
    expect(publicStatus(response.sources.find((s) => s.sourceId === "jobicy")!).message).toBe("Temporarily unavailable");
  });

  it("a failed warm-pool or run-history write is logged, never a failed search — the live results still arrive", async () => {
    const broken = new __MemoryStore();
    broken.upsertOpportunities = async () => {
      throw new Error("JobsLake could not update the warm pool: ON CONFLICT DO UPDATE command cannot affect row a second time");
    };
    broken.recordRuns = async () => {
      throw new Error("JobsLake could not record runs: timeout");
    };
    __setJobsLakeStore(broken);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    connector.mockImplementation(async (src: { id: string }) => (src.id === "greenhouse" ? { jobs: [job({})], warnings: [] } : { jobs: [], warnings: [] }));
    const events: string[] = [];
    const { response } = await search(req(), { trigger: "search", emit: (e) => events.push(e.type) });
    expect(response.results).toHaveLength(1);
    expect(events.at(-1)).toBe("search_completed");
    expect(log.mock.calls.map((c) => String(c[0]))).toEqual(expect.arrayContaining([expect.stringContaining("could not update the warm pool"), expect.stringContaining("could not record runs")]));
    log.mockRestore();
  });

  it("WJ-JL-036/037: the employer's record wins an aggregator conflict, and every source is kept as provenance", async () => {
    connector.mockImplementation(async (src: { id: string }) => {
      if (src.id === "greenhouse") return { jobs: [job({ title: "Senior Director, Identity Security" })], warnings: [] };
      if (src.id === "remoteok") return { jobs: [job({ id: "remoteok_9", sourceId: "remoteok", externalId: "9", title: "Sr Director Identity Security (Remote-friendly!)", applyUrl: "https://boards.greenhouse.io/acme/jobs/1?utm_source=remoteok", onEmployerSite: false, applyPath: "platform" })], warnings: [] };
      return { jobs: [], warnings: [] };
    });
    const { response } = await search(req({ query: { text: "identity security", locations: ["Remote"] } }), { trigger: "search" });
    expect(response.results).toHaveLength(1);
    const o = response.results[0];
    expect(o.title).toBe("Senior Director, Identity Security");
    expect(o.sourceRecords.map((r) => [r.sourceId, r.canonical])).toEqual([
      ["greenhouse", true],
      ["remoteok", false],
    ]);
    expect(o.sourceRecords[0].legacyJobId).toBe("careers_1");
    expect(o.provenance.find((p) => p.field === "title")?.sourceId).toBe("greenhouse");
    expect(response.metadata).toMatchObject({ duplicates: 1, unique: 1 });
  });

  it("WJ-JL-039: search modes change which sources are asked and how deeply", async () => {
    connector.mockResolvedValue({ jobs: [], warnings: [] });
    await search(req({ searchMode: "fast" }), { trigger: "search" });
    const fastCalls = connector.mock.calls.map((c) => c[2]);
    expect(fastCalls.every((d) => d === "shallow")).toBe(true);
    expect(connector.mock.calls.length).toBeLessThanOrEqual(4);
    connector.mockClear();
    await search(req({ searchMode: "maximum_coverage" }), { trigger: "search" });
    expect(connector.mock.calls.every((c) => c[2] === "deep")).toBe(true);
    expect(connector.mock.calls.length).toBeGreaterThan(4);
  });

  it("respects the candidate's own source choices (legacy ids map onto JobsLake sources)", async () => {
    connector.mockResolvedValue({ jobs: [], warnings: [] });
    await search(req({ sourceIds: ["careers"] }), { trigger: "search" });
    expect(connector.mock.calls.map((c) => c[0].id).sort()).toEqual(["ashby", "greenhouse", "lever"]);
  });

  it("partnership sources are never searched", async () => {
    connector.mockResolvedValue({ jobs: [], warnings: [] });
    const { plan } = await search(req({ searchMode: "maximum_coverage" }), { trigger: "search" });
    expect(plan.waves.flat().some((p) => p.id.startsWith("partner_"))).toBe(false);
    expect(plan.skipped.find((s) => s.id === "partner_linkedin")?.reason).toBe("Status is Do not use");
  });

  it("a test run only reports checks that actually ran, and records the run", async () => {
    connector.mockResolvedValue({ jobs: [job({}), job({ id: "careers_2", externalId: "gh:acme:2", title: "Product Designer", applyUrl: "https://boards.greenhouse.io/acme/jobs/2" })], warnings: [] });
    const r = await testSource(BUILTIN_SOURCES[0], "admin@example.com");
    expect(r.ok).toBe(true);
    expect(r.discovered).toBe(2);
    expect(r.checks.map((c) => c.label)).toEqual(["Connection", "Jobs returned", "Protocol v1 validation", "Apply URLs"]);
    expect((await jobsLakeStore().listAudit())[0]).toMatchObject({ action: "source.test_passed", sourceId: "greenhouse", actor: "admin@example.com" });
  });

  it("a few invalid records are left out, not fatal; a source whose records mostly fail can't pass", async () => {
    const good = (n: number) => job({ id: `careers_${n}`, externalId: `gh:acme:${n}`, title: `Role number ${n}`, applyUrl: `https://boards.greenhouse.io/acme/jobs/${n}` });
    connector.mockResolvedValueOnce({ jobs: [...Array.from({ length: 19 }, (_, i) => good(i)), job({ id: "careers_x", externalId: "gh:acme:x", title: "No description", description: "", applyUrl: "https://boards.greenhouse.io/acme/jobs/x" })], warnings: [] });
    const few = await testSource(BUILTIN_SOURCES[0], "admin@example.com");
    expect(few.ok).toBe(true);
    expect(few.valid).toBe(19);
    expect(few.checks.find((c) => c.label === "Protocol v1 validation")?.detail).toMatch(/19 of 20 valid; 1 left out \(description missing\)/);

    connector.mockResolvedValueOnce({ jobs: Array.from({ length: 10 }, (_, i) => job({ id: `careers_${i}`, externalId: `gh:acme:${i}`, title: `Role ${i}`, description: i < 5 ? "" : LONG, applyUrl: `https://boards.greenhouse.io/acme/jobs/${i}` })), warnings: [] });
    const many = await testSource(BUILTIN_SOURCES[0], "admin@example.com");
    expect(many.ok).toBe(false);
    expect(many.checks.find((c) => c.label === "Protocol v1 validation")?.detail).toMatch(/at least 90% must be valid/);
  });

  it("a failing test says why and can't pass", async () => {
    connector.mockRejectedValue(new NeedsSetupError("The API credential is missing."));
    const r = await testSource(BUILTIN_SOURCES[0], "admin@example.com");
    expect(r).toMatchObject({ ok: false, error: "The API credential is missing." });
    expect(r.checks[0]).toMatchObject({ label: "Authentication", ok: false });
  });
});

describe("credentials (WJ-JL-026/027)", () => {
  it("are stored encrypted, masked on read, and decrypt only inside the server", async () => {
    const ref = await saveCredential("sk_live_abcdefghijklmnop1234");
    const stored = await jobsLakeStore().getCredential(ref);
    expect(stored!.ciphertext).not.toContain("abcdefghijklmnop");
    expect(stored!.masked).toBe("••••••••1234");
    expect(JSON.stringify(await credentialStatus(ref))).not.toContain("abcdefghijklmnop");
    expect(await readCredential(ref)).toBe("sk_live_abcdefghijklmnop1234");
    expect(maskCredential("short1")).toBe("••••••••");
  });
});

describe("safeFetch (WJ-JL-025)", () => {
  it("refuses a public hostname that resolves to a private address", async () => {
    dnsLookup.mockResolvedValue([{ address: "10.0.0.7", family: 4 }]);
    await expect(safeFetch("https://rebind.example.com/jobs")).rejects.toThrow(/private or reserved/);
  });

  it("refuses blocked destinations before any request is made", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(safeFetch("https://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(DestinationBlockedError);
    await expect(safeFetch("https://localhost/x")).rejects.toBeInstanceOf(DestinationBlockedError);
    await expect(safeFetch("http://example.com/x")).rejects.toBeInstanceOf(DestinationBlockedError);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("custom source parsers", () => {
  it("reads RSS items", () => {
    const xml = `<rss><channel><item><title><![CDATA[Staff Engineer]]></title><link>https://acme.example/jobs/1</link><description>Build it.</description><pubDate>Mon, 22 Sep 2026 10:00:00 GMT</pubDate><guid>1</guid></item></channel></rss>`;
    expect(parseFeed(xml, "Acme")[0]).toMatchObject({ title: "Staff Engineer", company: "Acme", applyUrl: "https://acme.example/jobs/1", externalId: "1" });
  });

  it("reads schema.org JobPosting JSON-LD, including @graph", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"JobPosting","title":"IAM Lead","hiringOrganization":{"name":"Acme"},"jobLocation":{"address":{"addressLocality":"Mumbai","addressCountry":"IN"}},"datePosted":"2026-09-20","description":"<p>Own IAM</p>","url":"https://acme.example/jobs/iam"}]}</script>`;
    expect(parseJobPostingLd(html, "https://acme.example/careers")[0]).toMatchObject({ title: "IAM Lead", company: "Acme", location: "Mumbai, IN", applyUrl: "https://acme.example/jobs/iam" });
  });

  it("calls an MCP tool over Streamable HTTP and maps its JSON result", async () => {
    const calls: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_u, init) => {
      const body = JSON.parse(String((init as RequestInit).body));
      calls.push(body.method);
      const headers = new Headers({ "content-type": "application/json", "mcp-session-id": "s1" });
      if (body.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26" } }), { headers });
      if (body.method === "tools/call") return new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: JSON.stringify({ jobs: [{ id: "a", t: "IAM Lead", c: "Acme", l: "Remote", d: "Own IAM", u: "https://acme.example/j/a", p: "2026-09-20" }] }) }] } }), { headers });
      return new Response("", { status: 202, headers });
    });
    dnsLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const r = await fetchMcp({ endpoint: "https://mcp.acme.example/mcp", toolName: "search_jobs", queryArgument: "query", mapping: { itemsPath: "jobs", fields: { sourceJobId: "id", title: "t", employer: "c", location: "l", description: "d", applyUrl: "u", postedAt: "p" } } }, { query: "iam", locations: [] });
    expect(calls).toEqual(["initialize", "notifications/initialized", "tools/call"]);
    expect(r.raws[0]).toMatchObject({ title: "IAM Lead", company: "Acme", applyUrl: "https://acme.example/j/a" });
    fetchMock.mockRestore();
  });
});
