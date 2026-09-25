import { describe, expect, it } from "vitest";
import type { Job } from "@/domain/jobs/types";
import { canonicalize, locationFamily, normalizeUrl, type Observation } from "./canonical";
import { checkDestination, isBlockedAddress } from "./ssrf";
import { detectSource } from "./detect";
import { applyMapping, toIsoDate, validateMapping, type ResponseMapping } from "./mapping";
import { deriveAlerts, summarizeHealth, type SourceRun } from "./health";
import { planSearch, type PlannableSource } from "./planner";
import { PROTOCOL_VERSION, validateOpportunity, type JobSourceDescriptor } from "./protocol";

const NOW = Date.parse("2026-09-24T08:00:00Z");
const LONG = "We are hiring an experienced leader to build our identity platform. You will own strategy, roadmap and delivery across teams, partner with security engineering, and grow a world class organization serving millions of customers every single day across many regions and products.";

function job(over: Partial<Job> = {}): Job {
  return {
    id: "x_1",
    sourceId: "x",
    externalId: "1",
    title: "Senior Director, Identity Security",
    company: "Acme",
    location: "Bengaluru, India",
    country: "IN",
    workMode: "hybrid",
    currency: "INR",
    postedAt: "2026-09-22T00:00:00Z",
    observedAt: "2026-09-24T07:00:00Z",
    description: LONG,
    requirements: [],
    niceToHave: [],
    skills: ["IAM"],
    seniority: "director",
    industry: "Technology",
    applyUrl: "https://boards.greenhouse.io/acme/jobs/1",
    applyPath: "employer_site",
    onEmployerSite: true,
    repostCount: 0,
    tags: [],
    ...over,
  };
}
const src = (id: string, category: JobSourceDescriptor["category"], accessStrategy: JobSourceDescriptor["accessStrategy"] = "official_api"): JobSourceDescriptor => ({ id, name: id, provider: id, category, accessStrategy, protocolVersion: PROTOCOL_VERSION });
const ats = src("greenhouse", "ats");
const agg = src("adzuna", "aggregator");

describe("canonicalize — dedupe and provenance", () => {
  it("merges the same posting seen on an ATS and an aggregator into one opportunity", () => {
    const obs: Observation[] = [
      { source: agg, job: job({ id: "adzuna_9", sourceId: "adzuna", externalId: "9", applyUrl: "https://www.adzuna.in/details/9?utm_source=x", onEmployerSite: false, applyPath: "platform", salaryMin: 5_000_000, salaryMax: 7_000_000, title: "Sr. Director, Identity Security" }) },
      { source: ats, job: job({ id: "careers_1" }) },
    ];
    const r = canonicalize(obs, NOW);
    expect(r.opportunities).toHaveLength(1);
    expect(r.duplicates).toBe(1);
    const o = r.opportunities[0];
    // The employer/ATS record is canonical, and its fields win.
    expect(o.sourceRecords[0]).toMatchObject({ sourceId: "greenhouse", canonical: true, legacyJobId: "careers_1" });
    expect(o.canonicalApplyUrl).toBe("https://boards.greenhouse.io/acme/jobs/1");
    expect(o.title).toBe("Senior Director, Identity Security");
    expect(o.provenance.find((p) => p.field === "title")).toMatchObject({ sourceId: "greenhouse", confidence: "high" });
    // The aggregator fills a gap the ATS left (salary) — and says so, with low confidence.
    expect(o.compensation).toMatchObject({ min: 5_000_000, max: 7_000_000 });
    expect(o.provenance.find((p) => p.field === "compensation")).toMatchObject({ sourceId: "adzuna", confidence: "low" });
    expect(o.quality).toMatchObject({ employerVerified: true, sourceCount: 2, compensationDisclosed: true });
    expect(validateOpportunity(o)).toEqual([]);
  });

  it("a weaker source never overwrites a field a stronger one supplied", () => {
    const r = canonicalize([
      { source: ats, job: job({ id: "careers_1", location: "Bengaluru, India" }) },
      { source: agg, job: job({ id: "adzuna_1", sourceId: "adzuna", location: "Bengaluru, India", description: `${LONG} Extra aggregator text.`, applyUrl: "https://boards.greenhouse.io/acme/jobs/1" }) },
    ]);
    expect(r.opportunities).toHaveLength(1);
    expect(r.opportunities[0].description).toBe(LONG);
  });

  it("merges the same role across remote spellings but keeps different cities apart", () => {
    const r = canonicalize([
      { source: agg, job: job({ id: "a", location: "Remote", applyUrl: "https://a.example/1" }) },
      { source: agg, job: job({ id: "b", location: "Remote (Worldwide)", applyUrl: "https://b.example/2" }) },
      { source: ats, job: job({ id: "c", location: "Dublin, Ireland", applyUrl: "https://boards.greenhouse.io/acme/jobs/7" }) },
    ]);
    expect(r.opportunities).toHaveLength(2);
    expect(locationFamily("Bengaluru, Karnataka, India")).toBe("bengaluru");
    expect(locationFamily("Remote - EMEA")).toBe("remote");
  });

  it("never merges two postings from the same source — the same title opened twice is two jobs", () => {
    const r = canonicalize([
      { source: ats, job: job({ id: "c1", externalId: "gh:acme:1", applyUrl: "https://boards.greenhouse.io/acme/jobs/1" }) },
      { source: ats, job: job({ id: "c2", externalId: "gh:acme:2", applyUrl: "https://boards.greenhouse.io/acme/jobs/2" }) },
      // An aggregator copy of posting 1 still merges with it.
      { source: agg, job: job({ id: "a1", sourceId: "adzuna", externalId: "9", applyUrl: "https://boards.greenhouse.io/acme/jobs/1" }) },
    ]);
    expect(r.opportunities).toHaveLength(2);
    expect(r.opportunities.map((o) => o.sourceRecords.map((x) => x.sourceJobId).sort())).toEqual([["9", "gh:acme:1"], ["gh:acme:2"]]);
  });

  it("does not merge different jobs that merely share an employer", () => {
    const r = canonicalize([
      { source: ats, job: job({ id: "1" }) },
      { source: ats, job: job({ id: "2", title: "Product Designer", applyUrl: "https://boards.greenhouse.io/acme/jobs/2", description: "Design things for people. ".repeat(20) }) },
    ]);
    expect(r.opportunities).toHaveLength(2);
  });

  it("normalizes apply URLs: tracking params, trailing /apply and www don't split a posting", () => {
    expect(normalizeUrl("https://www.jobs.lever.co/acme/abc/apply?lever-source=x")).toBe(normalizeUrl("https://jobs.lever.co/acme/abc"));
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
  });

  it("the protocol validator rejects a record without employer identity or a valid URL", () => {
    const o = canonicalize([{ source: agg, job: job({ company: "Unknown company", applyUrl: "not a url" }) }]).opportunities[0];
    const fields = validateOpportunity(o).map((i) => i.field);
    expect(fields).toContain("employer.name");
    expect(fields).toContain("canonicalApplyUrl");
  });
});

describe("SSRF protection", () => {
  it.each([
    ["http://example.com/jobs", "Only https"],
    ["https://localhost/jobs", "internal"],
    ["https://api.internal/jobs", "internal"],
    ["https://metadata.google.internal/computeMetadata/v1/", "internal"],
    ["https://169.254.169.254/latest/meta-data", "private"],
    ["https://10.0.0.5/x", "private"],
    ["https://[::1]/x", "private"],
    ["https://2130706433/x", "private"], // 127.0.0.1 as a decimal — the URL parser normalizes it
    ["https://jobs/x", "Single-label"],
    ["https://user:pass@example.com/x", "credentials"],
    ["https://example.com:8443/x", "port"],
    ["https://8.8.8.8/x", "hostname"],
  ])("rejects %s", (url, why) => {
    const r = checkDestination(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(new RegExp(why, "i"));
  });

  it("accepts a normal public https endpoint", () => {
    expect(checkDestination("https://boards-api.greenhouse.io/v1/boards/stripe/jobs").ok).toBe(true);
  });

  it("blocks private, loopback, link-local and mapped addresses after DNS resolution", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "100.64.0.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::a00:1"]) expect(isBlockedAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "104.18.0.1", "2606:4700::1111"]) expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe("detectSource", () => {
  it("recognizes ATS boards from board and posting URLs", () => {
    expect(detectSource("https://boards.greenhouse.io/stripe")).toMatchObject({ kind: "ats_board", platform: "greenhouse", slug: "stripe" });
    expect(detectSource("https://job-boards.greenhouse.io/figma/jobs/123")).toMatchObject({ platform: "greenhouse", slug: "figma" });
    expect(detectSource("jobs.lever.co/spotify/abc-123")).toMatchObject({ platform: "lever", slug: "spotify" });
    expect(detectSource("https://jobs.ashbyhq.com/notion")).toMatchObject({ platform: "ashby", slug: "notion" });
    expect(detectSource("https://jobs.smartrecruiters.com/BoschGroup")).toMatchObject({ platform: "smartrecruiters", slug: "BoschGroup" });
    expect(detectSource("https://apply.workable.com/huggingface/")).toMatchObject({ platform: "workable", slug: "huggingface" });
  });

  it("never offers a partnership-only portal as connectable", () => {
    for (const u of ["https://www.linkedin.com/jobs/view/1", "https://in.indeed.com/jobs?q=x", "https://www.naukri.com/iam-jobs", "https://www.foundit.in/"]) expect(detectSource(u).kind).toBe("partnership");
  });

  it("says when a platform is known but not yet supported, and falls back to custom otherwise", () => {
    expect(detectSource("https://acme.teamtailor.com/jobs")).toMatchObject({ kind: "unsupported_ats", provider: "Teamtailor" });
    expect(detectSource("https://careers.acme.com")).toMatchObject({ kind: "custom" });
    expect(detectSource("https://boards.greenhouse.io/")).toMatchObject({ kind: "invalid" });
  });
});

describe("response mapping", () => {
  const response = { data: { results: [{ id: 7, name: "Staff Engineer", org: { title: "Acme" }, where: "Remote", body: "Build.", link: "https://acme.example/jobs/7", created: 1758700000 }] } };
  const mapping: ResponseMapping = { itemsPath: "data.results", fields: { sourceJobId: "id", title: "name", employer: "org.title", location: "where", description: "body", applyUrl: "link", postedAt: "created" } };

  it("maps nested fields and validates a complete mapping", () => {
    const r = applyMapping(response, mapping);
    expect(r.items[0]).toMatchObject({ sourceJobId: "7", title: "Staff Engineer", employer: "Acme", applyUrl: "https://acme.example/jobs/7" });
    expect(toIsoDate(r.items[0].postedAt)).toMatch(/^2025-/);
    expect(validateMapping(mapping, r).ok).toBe(true);
  });

  it("rejects a mapping that leaves a required field unmapped", () => {
    const partial: ResponseMapping = { ...mapping, fields: { ...mapping.fields, applyUrl: undefined } };
    const v = validateMapping(partial, applyMapping(response, partial));
    expect(v.ok).toBe(false);
    expect(v.checks.find((c) => c.label === "Required fields mapped")?.detail).toMatch(/applyUrl/);
  });

  it("says plainly when the items path isn't a list", () => {
    const r = applyMapping(response, { ...mapping, itemsPath: "data" });
    expect(r.issues[0]).toMatch(/isn't a list/);
    expect(validateMapping(mapping, r).ok).toBe(false);
  });
});

describe("health and alerts — only from real runs", () => {
  const run = (i: number, over: Partial<SourceRun> = {}): SourceRun => ({ id: `r${i}`, sourceId: "s", trigger: "search", startedAt: new Date(NOW - i * 60_000).toISOString(), durationMs: 300, outcome: "ok", retrieved: 40, valid: 40, duplicates: 2, ...over });

  it("reports no data instead of inventing a percentage", () => {
    const h = summarizeHealth("s", []);
    expect(h).toMatchObject({ state: "no_data", successRate: null, p50LatencyMs: null });
  });

  it("computes success rate and latency, and marks degraded and down honestly", () => {
    expect(summarizeHealth("s", [run(0), run(1), run(2)])).toMatchObject({ state: "healthy", successRate: 1, p50LatencyMs: 300 });
    expect(summarizeHealth("s", [run(0), run(1, { outcome: "timeout" }), ...[2, 3, 4, 5, 6, 7, 8, 9].map((i) => run(i))]).state).toBe("healthy");
    expect(summarizeHealth("s", [run(0), run(1, { outcome: "timeout" }), run(2), run(3, { outcome: "unavailable" })]).state).toBe("degraded");
    expect(summarizeHealth("s", [run(0, { outcome: "unavailable" }), run(1, { outcome: "timeout" }), run(2)]).state).toBe("down");
  });

  it("raises repeated-failure and yield-drop alerts only when the runs show it", () => {
    expect(deriveAlerts("s", "S", [run(0), run(1)])).toEqual([]);
    const failing = deriveAlerts("s", "S", [run(0, { outcome: "timeout", message: "timed out" }), run(1, { outcome: "timeout" }), run(2, { outcome: "unavailable" }), run(3)]);
    expect(failing.map((a) => a.kind)).toContain("repeated_failures");
    const dropped = deriveAlerts("s", "S", [run(0, { retrieved: 0, valid: 0 }), run(1), run(2), run(3), run(4)]);
    expect(dropped.map((a) => a.kind)).toContain("yield_dropped");
  });
});

describe("source planner", () => {
  const S = (id: string, geography: string[], over: Partial<PlannableSource> = {}): PlannableSource => ({ id, name: id, status: "active", available: true, geography, ...over });
  const sources = [S("gh", ["global"]), S("lv", ["global"]), S("ab", ["global"]), S("adz", ["IN"]), S("rok", ["remote"]), S("de", ["DE"]), S("paused", ["global"], { status: "paused" }), S("nokey", ["IN"], { available: false })];
  const req = (mode: "fast" | "balanced" | "maximum_coverage", locations = ["Bengaluru"]) => ({ searchMode: mode, query: { text: "iam", locations } });

  it("fast mode uses the strongest few in one wave; maximum coverage adds a discovery wave", () => {
    const fast = planSearch(req("fast"), sources, {});
    expect(fast.waves).toHaveLength(1);
    expect(fast.waves[0]).toHaveLength(4);
    expect(fast.depth).toBe("shallow");
    const max = planSearch(req("maximum_coverage"), sources, {});
    expect(max.waves.at(-1)!.map((p) => p.id)).toEqual(["de"]);
    expect(max.depth).toBe("deep");
    expect(max.useWarmPool).toBe(false);
  });

  it("never plans paused sources or sources without credentials, and says why", () => {
    const p = planSearch(req("balanced"), sources, {});
    const planned = p.waves.flat().map((x) => x.id);
    expect(planned).not.toContain("paused");
    expect(planned).not.toContain("nokey");
    expect(p.skipped.find((s) => s.id === "nokey")?.reason).toMatch(/credentials/);
    expect(p.skipped.find((s) => s.id === "de")?.reason).toMatch(/Outside your locations/);
  });

  it("includes remote boards for any location (remote roles are reachable from anywhere), and respects the candidate's own source choices", () => {
    expect(planSearch(req("balanced", ["Bengaluru"]), sources, {}).waves.flat().map((x) => x.id)).toContain("rok");
    expect(planSearch({ ...req("balanced"), sourceIds: ["gh"] }, sources, {}).waves.flat().map((x) => x.id)).toEqual(["gh"]);
  });
});

describe("warm pool + live results (WJ-JL-038)", () => {
  it("coexist: live wins, warm fills in, the same posting never appears twice", async () => {
    const { mergeWithWarm } = await import("./canonical");
    const live = canonicalize([{ source: ats, job: job({ id: "careers_1" }) }]).opportunities;
    const warmSame = canonicalize([{ source: agg, job: job({ id: "adzuna_1", title: "Staff Engineer", applyUrl: "https://boards.greenhouse.io/acme/jobs/1" }) }]).opportunities;
    const warmNew = canonicalize([{ source: ats, job: job({ id: "careers_2", title: "Product Designer", applyUrl: "https://boards.greenhouse.io/acme/jobs/2", description: "Design things for people. ".repeat(20) }) }]).opportunities;
    const r = mergeWithWarm(live, [...warmSame, ...warmNew]);
    expect(r).toMatchObject({ live: 1, warm: 1 });
    expect(r.results.map((o) => o.title)).toEqual(["Senior Director, Identity Security", "Product Designer"]);
  });
});
