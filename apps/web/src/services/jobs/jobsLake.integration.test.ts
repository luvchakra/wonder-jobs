import { useJobsStore } from "@/store/jobs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/domain/jobs/types";
import { StopSignal, type StageContext } from "@/domain/workflow/engine";
import type { Evidence, RunConfig } from "@/domain/workflow/types";
import { canonicalize } from "@/domain/jobslake/canonical";
import { PROTOCOL_VERSION, type SearchEvent, type SearchResponse } from "@/domain/jobslake/protocol";
import { contributionBySource, sourceEvidence, toCanonicalJob } from "@/domain/jobslake/wonderjobs";

// The browser search stage runs signed in, against a stubbed network.
vi.mock("@/lib/mode", () => ({ getClientMode: () => ({ mode: "user", userId: "u1" }), storageKeyFor: (n: string) => n }));

import { searchJobsStream } from "./jobsLakeClient";
import { setJobsLakeCapability } from "./jobsLakeMode";
import { createExecutors } from "@/services/workflow/executors";

const LONG = "We are hiring an experienced leader to build our identity platform. You will own strategy, roadmap and delivery across teams, partner with security engineering, and grow a world class organization serving millions of customers every single day.";
function job(over: Partial<Job> = {}): Job {
  return { id: "careers_1", sourceId: "careers", externalId: "gh:acme:1", title: "Senior Director, Identity Security", company: "Acme", location: "Bengaluru, India", country: "IN", workMode: "hybrid", currency: "INR", postedAt: "2026-09-22T00:00:00Z", observedAt: "2026-09-24T00:00:00Z", description: LONG, requirements: [], niceToHave: [], skills: ["IAM"], seniority: "director", industry: "Technology", applyUrl: "https://boards.greenhouse.io/acme/jobs/1", applyPath: "employer_site", onEmployerSite: true, repostCount: 0, tags: [], ...over };
}
const greenhouse = { id: "greenhouse", name: "Greenhouse", provider: "Greenhouse", category: "ats" as const, accessStrategy: "official_api" as const, protocolVersion: PROTOCOL_VERSION };
const remoteok = { id: "remoteok", name: "Remote OK", provider: "Remote OK", category: "aggregator" as const, accessStrategy: "official_api" as const, protocolVersion: PROTOCOL_VERSION };

function crossPosted() {
  return canonicalize([
    { source: greenhouse, job: job() },
    { source: remoteok, job: job({ id: "remoteok_9", sourceId: "remoteok", externalId: "9", applyUrl: "https://boards.greenhouse.io/acme/jobs/1?utm_source=remoteok", onEmployerSite: false }) },
  ]).opportunities;
}

function response(): SearchResponse {
  const results = crossPosted();
  return {
    requestId: "req_abcdef01",
    protocolVersion: PROTOCOL_VERSION,
    searchMode: "balanced",
    results,
    sources: [
      { sourceId: "greenhouse", sourceName: "Greenhouse", outcome: "ok", retrieved: 1, durationMs: 300 },
      { sourceId: "remoteok", sourceName: "Remote OK", outcome: "ok", retrieved: 1, durationMs: 200 },
      { sourceId: "adzuna_in", sourceName: "Adzuna India", outcome: "needs_setup", retrieved: 0, durationMs: 1, message: "Needs setup" },
    ],
    metadata: { retrieved: 2, normalized: 2, duplicates: 1, unique: 1, sourcesPlanned: 3, sourcesSucceeded: 2, sourcesFailed: 1, warm: 0, live: 1 },
  };
}

/** NDJSON body split at awkward places, as a real network would deliver it. */
function ndjson(events: SearchEvent[], chunk = 37) {
  const text = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < text.length; i += chunk) c.enqueue(enc.encode(text.slice(i, i + chunk)));
      c.close();
    },
  });
}

function events(r: SearchResponse): SearchEvent[] {
  return [
    { type: "search_started", requestId: r.requestId, plannedSources: r.sources.map((s) => ({ id: s.sourceId, name: s.sourceName })), searchMode: "balanced" },
    ...r.sources.flatMap((s): SearchEvent[] => [{ type: "source_started", sourceId: s.sourceId, sourceName: s.sourceName }, { type: "source_completed", status: s }]),
    { type: "dedupe_progress", unique: 1, duplicates: 1 },
    { type: "search_completed", response: r },
  ];
}

afterEach(() => vi.restoreAllMocks());

describe("CanonicalOpportunity → WonderJobs job", () => {
  it("keeps the WonderJobs id of the canonical posting and every sighting", () => {
    const j = toCanonicalJob(crossPosted()[0]);
    expect(j.id).toBe("careers_1");
    expect(j.sourceIds).toEqual(["careers", "remoteok"]);
    expect(j.duplicateOf).toEqual(["remoteok_9"]);
    expect(j.lake?.sightings.map((s) => [s.sourceName, s.canonical, s.employerSource])).toEqual([
      ["Greenhouse", true, true],
      ["Remote OK", false, false],
    ]);
    expect(j.lake?.fieldSources.find((f) => f.field === "title")?.sourceName).toBe("Greenhouse");
  });

  it("reports source outcomes as evidence without inventing any, and skips planned-out sources", () => {
    expect(sourceEvidence({ sourceId: "x", sourceName: "X", outcome: "timeout", retrieved: 0, durationMs: 9000 })).toEqual({ label: "X", value: "Didn't respond in time", tone: "danger" });
    expect(sourceEvidence({ sourceId: "x", sourceName: "X", outcome: "skipped", retrieved: 0, durationMs: 0 })).toBeNull();
  });

  it("contribution telemetry is counts per source, nothing else", () => {
    const j = toCanonicalJob(crossPosted()[0]);
    expect(contributionBySource([j], { careers_1: "strong" })).toEqual({ greenhouse: { relevant: 1, strong: 1 }, remoteok: { relevant: 1, strong: 1 } });
  });
});

describe("streaming client", () => {
  it("parses events split across chunks and resolves with the final response", async () => {
    const r = response();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(ndjson(events(r)), { headers: { "content-type": "application/x-ndjson" } }));
    const seen: string[] = [];
    const out = await searchJobsStream({ query: { text: "identity", locations: [] }, searchMode: "balanced", limit: 10 }, (e) => void seen.push(e.type));
    expect(out.requestId).toBe(r.requestId);
    expect(seen[0]).toBe("search_started");
    expect(seen.at(-1)).toBe("search_completed");
  });

  it("an error event or a cut-off stream is an error, not an empty result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(ndjson([{ type: "error", error: { code: "INTERNAL", message: "boom", retryable: true } }])));
    await expect(searchJobsStream({ query: { text: "x", locations: [] }, searchMode: "fast", limit: 1 }, () => undefined)).rejects.toThrow("boom");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(ndjson(events(response()).slice(0, 3))));
    await expect(searchJobsStream({ query: { text: "x", locations: [] }, searchMode: "fast", limit: 1 }, () => undefined)).rejects.toThrow(/ended early/);
  });
});

describe("search stage (signed in)", () => {
  const config = { sourceIds: ["careers", "remoteok", "adzuna_in"], searchCriteria: { query: "identity security", locations: ["Bengaluru"], workModes: [] } } as unknown as RunConfig;
  function ctx() {
    const evidence: Evidence[] = [];
    const warnings: string[] = [];
    const c = {
      run: { id: `run-${Math.random()}`, config },
      setProgress: () => undefined,
      setCounts: () => undefined,
      addEvidence: (e: Evidence) => void evidence.push(e),
      warn: (m: string) => void warnings.push(m),
      checkpoint: async () => undefined,
      stopSignal: new AbortController().signal,
      sleep: async () => undefined,
      get: () => undefined,
      fail: (e: { message: string }) => {
        throw new Error(e.message);
      },
    } as unknown as StageContext;
    return { c, evidence, warnings };
  }
  const executors = createExecutors({ ai: () => ({}) as never });

  beforeEach(() => {
    setJobsLakeCapability({ search: true, streaming: true });
    // This deployment has no Adzuna credentials, so it is never asked for, even when the run names it.
    useJobsStore.getState().setSourceAvailability({ adzuna_in: false });
  });

  it("searches through the JobsLake stream and dedupe keeps JobsLake's merge", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/search/stream")) return new Response(ndjson(events(response())));
      return new Response("{}");
    });
    const { c, evidence, warnings } = ctx();
    const out = await executors.search(c);
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/search/stream"))!;
    const body = JSON.parse(String((call[1] as RequestInit).body));
    // Only sources that are on and searchable here (Adzuna has no credentials), and only search terms, broader phrasings of them and places.
    // (The AI phrasing route answered nothing usable here, so the rules picked the phrasing.)
    expect(body).toEqual({ query: { text: "identity security", locations: ["Bengaluru"], variants: ["identity"] }, sourceIds: ["careers", "remoteok"], searchMode: "balanced", limit: 500 });
    expect(out.data).toMatchObject({ jobIds: ["careers_1"], searchedWith: "JobsLake", requestId: "req_abcdef01" });
    expect(evidence.map((e) => `${e.label}: ${e.value}`)).toEqual(["Searched with: JobsLake · 3 sources planned", "Also searched: “identity”", "Greenhouse: 1 jobs", "Remote OK: 1 jobs", "Adzuna India: Needs setup", "Sources searched: 2 of 3 answered"]);
    expect(warnings).toEqual(["Adzuna India isn't configured on this deployment yet, so it was skipped."]);

    const d = await executors.dedupe(c);
    expect(d.counts).toEqual({ unique: 1, duplicates: 1 });
  });

  it("lists and scores the jobs each source finds before the search ends", async () => {
    useJobsStore.setState({ jobs: {}, order: [], matches: {}, closed: {}, searchedFor: "", beforeWords: undefined });
    const r = response();
    const all = events(r);
    // The jobs arrive mid-stream; the search stage lists them itself (the rank stage would otherwise be first to).
    const stream = [...all.slice(0, 3), { type: "results_preview", results: r.results } as SearchEvent, ...all.slice(3)];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => (String(url).endsWith("/search/stream") ? new Response(ndjson(stream)) : new Response("{}")));
    const { c } = ctx();
    await executors.search(c);
    const st = useJobsStore.getState();
    expect(st.order).toEqual(["careers_1"]);
    expect(st.matches.careers_1).toBeDefined();
    expect(st.jobs.careers_1.lake?.sightings).toHaveLength(2);
  });

  it("Stop ends a search still waiting on JobsLake at once, and nothing else is searched", async () => {
    // JobsLake that hasn't answered yet: the request hangs until it is aborted.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (!String(url).endsWith("/search/stream")) return new Response("{}");
      return new Promise<Response>((_, reject) => (init?.signal as AbortSignal).addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    });
    const stop = new AbortController();
    const { c, evidence } = ctx();
    const stopping = Object.assign(c, { stopSignal: stop.signal, checkpoint: async () => { if (stop.signal.aborted) throw new StopSignal(); } }) as StageContext;
    const searching = executors.search(stopping);
    await vi.waitFor(() => expect(fetchSpy.mock.calls.some(([u]) => String(u).endsWith("/search/stream"))).toBe(true));
    stop.abort();
    await expect(searching).rejects.toBeInstanceOf(StopSignal);
    // Stopped is not "JobsLake didn't answer", and no source is searched instead.
    expect(evidence.some((e) => e.label === "JobsLake")).toBe(false);
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).endsWith("/search/stream") || String(u).endsWith("/search"))).toHaveLength(1);
  });

  it("never searches a source directly: when JobsLake fails the search fails and says so", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ error: { code: "INTERNAL", message: "down", retryable: true } }), { status: 500 }));
    const { c, evidence } = ctx();
    await expect(executors.search(c)).rejects.toThrow(/JobsLake didn't answer/);
    expect(evidence[0]).toEqual({ label: "JobsLake", value: "Didn't answer", tone: "warning" });
    // Only JobsLake (and the AI phrasing helper) is called — never a job source or the old direct endpoint.
    expect(fetchSpy.mock.calls.map(([url]) => String(url)).filter((u) => !u.includes("/api/jobs-lake/") && !u.startsWith("/api/ai/"))).toEqual([]);
  });

  it("a disabled JobsLake means no search, said plainly, and no source is asked directly", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ error: { code: "FEATURE_DISABLED", message: "off", retryable: false } }), { status: 404 }));
    const { c, evidence } = ctx();
    await expect(executors.search(c)).rejects.toThrow(/JobsLake didn't answer/);
    expect(evidence[0]).toEqual({ label: "JobsLake", value: "Off", tone: "warning" });
    // Only JobsLake (and the AI phrasing helper) is called — never a job source or the old direct endpoint.
    expect(fetchSpy.mock.calls.map(([url]) => String(url)).filter((u) => !u.includes("/api/jobs-lake/") && !u.startsWith("/api/ai/"))).toEqual([]);
  });
});
