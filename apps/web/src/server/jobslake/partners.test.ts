import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));

import { checkPartnerConnection, partnerReadiness, PARTNER_PRESETS, PARTNER_STATUS_REASON, type PartnerConnection } from "@/domain/jobslake/partners";
import { detectSource } from "@/domain/jobslake/detect";
import { __clearTokenCache, fetchPartner, oauth2Token, parseFeed } from "./custom";
import { activateSource, setSourceCredential, testSourceById, updateSource } from "./admin";
import { search } from "./core";
import { getSource, isAvailable, listSources, PARTNERSHIP_SOURCES } from "./registry";
import { __MemoryStore, __setJobsLakeStore, jobsLakeStore } from "./store";

const ADMIN = "ops@wonderjobs.test";
const SECRET = "partner_secret_DO_NOT_LEAK_4242";
const LONG = "We are hiring an experienced leader to build our identity platform. You will own strategy, roadmap and delivery across teams, partner with security engineering, and grow a world class organization serving millions of customers every single day.";
const MAPPING = { itemsPath: "data.jobs", fields: { sourceJobId: "id", title: "title", employer: "company", location: "city", description: "body", applyUrl: "link", postedAt: "posted" } };
const OAUTH = { type: "oauth2" as const, tokenUrl: "https://auth.partner.example/oauth/token", clientId: "wonderjobs" };
const CONN: PartnerConnection = { format: "json_api", endpoint: "https://api.partner.example/v1/jobs", queryParam: "q", locationParam: "loc", auth: OAUTH, mapping: MAPPING };
const crit = { query: "identity security", locations: ["Bengaluru"] };

const posting = (n: number) => ({ id: `n${n}`, title: n === 1 ? "Senior Director, Identity Security" : `Identity Security Engineer ${n}`, company: "Acme", city: "Bengaluru, India", body: LONG, link: `https://acme.example/jobs/${n}`, posted: new Date(Date.now() - 2 * 86_400_000).toISOString() });

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
let calls: Call[] = [];
let tokenSeq = 0;
let tokenTtl: number | undefined = 3600;
/** A partner: an OAuth token endpoint and a JSON jobs API that only accepts the current token. */
function partnerServer(over: { api?: (c: Call) => Response | undefined; token?: (c: Call) => Response | undefined } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (u, init) => {
    const i = (init ?? {}) as RequestInit;
    const c: Call = { url: String(u), method: i.method ?? "GET", headers: Object.fromEntries(Object.entries((i.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])), body: typeof i.body === "string" ? i.body : undefined };
    calls.push(c);
    if (c.url.startsWith(OAUTH.tokenUrl)) {
      const custom = over.token?.(c);
      if (custom) return custom;
      tokenSeq++;
      return new Response(JSON.stringify({ access_token: `tok_${tokenSeq}`, token_type: "Bearer", ...(tokenTtl ? { expires_in: tokenTtl } : {}) }), { headers: { "content-type": "application/json" } });
    }
    if (c.url.startsWith("https://api.partner.example/")) {
      const custom = over.api?.(c);
      if (custom) return custom;
      if (c.headers.authorization !== `Bearer tok_${tokenSeq}`) return new Response("{}", { status: 401 });
      return new Response(JSON.stringify({ data: { jobs: [posting(1), posting(2)] } }), { headers: { "content-type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  });
}

beforeEach(() => {
  __setJobsLakeStore(new __MemoryStore());
  __clearTokenCache();
  calls = [];
  tokenSeq = 0;
  tokenTtl = 3600;
  process.env.SECRET_ENCRYPTION_KEY = "test-key-test-key-test-key-test-key-0123";
});
afterEach(() => {
  vi.restoreAllMocks();
  __setJobsLakeStore(undefined);
});

describe("partner presets", () => {
  it("pre-fill only what's publicly known — never an endpoint or a field name", () => {
    expect(PARTNER_PRESETS.map((p) => p.id)).toEqual(["linkedin", "indeed", "naukri", "foundit", "timesjobs"]);
    expect(Object.fromEntries(PARTNER_PRESETS.map((p) => [p.id, p.geography]))).toEqual({ linkedin: ["global"], indeed: ["global"], naukri: ["IN"], foundit: ["IN"], timesjobs: ["IN"] });
    for (const p of PARTNER_PRESETS) expect(Object.keys(p).sort()).toEqual(expect.not.arrayContaining(["endpoint", "tokenUrl", "mapping", "queryParam", "connection"]));
    for (const s of PARTNERSHIP_SOURCES) expect(s.config).not.toHaveProperty("connection");
    for (const s of PARTNERSHIP_SOURCES) expect(s).toMatchObject({ status: "do_not_use", statusReason: PARTNER_STATUS_REASON, accessStrategy: "partner_api", config: { kind: "partnership" } });
    expect(detectSource("https://www.naukri.com/jobs").kind).toBe("partnership");
  });
});

describe("partner connection validation", () => {
  it("accepts a well-formed connection", () => {
    expect(checkPartnerConnection(CONN)).toEqual([]);
    expect(checkPartnerConnection({ format: "feed", endpoint: "https://feeds.partner.example/jobs.xml", auth: { type: "query", param: "api_key" } })).toEqual([]);
  });

  it("refuses http, internal and IP destinations for the endpoint and the token URL", () => {
    expect(checkPartnerConnection({ ...CONN, endpoint: "http://api.partner.example/jobs" })[0]).toMatchObject({ field: "endpoint" });
    expect(checkPartnerConnection({ ...CONN, endpoint: "https://169.254.169.254/latest" })[0]).toMatchObject({ field: "endpoint" });
    expect(checkPartnerConnection({ ...CONN, auth: { ...OAUTH, tokenUrl: "https://localhost/token" } })[0]).toMatchObject({ field: "auth.tokenUrl" });
  });

  it("needs a mapping for JSON, a usable header, and distinct parameters", () => {
    expect(checkPartnerConnection({ ...CONN, mapping: undefined })[0]).toMatchObject({ field: "mapping" });
    expect(checkPartnerConnection({ ...CONN, auth: { type: "header", header: "Host" } })[0]).toMatchObject({ field: "auth.header" });
    expect(checkPartnerConnection({ ...CONN, auth: { type: "query", param: "q" } })[0]).toMatchObject({ field: "auth.param" });
    expect(checkPartnerConnection({ ...CONN, locationParam: "q" })[0]).toMatchObject({ field: "locationParam" });
  });

  it("the admin API stores a valid connection and refuses a bad one, without touching name or geography", async () => {
    const bad = await updateSource("partner_naukri", { config: { kind: "partnership", connection: { ...CONN, endpoint: "http://api.partner.example/jobs" } } }, ADMIN);
    expect(bad).toMatchObject({ ok: false, status: 400, error: { code: "DESTINATION_BLOCKED" } });
    const shape = await updateSource("partner_naukri", { config: { kind: "partnership", connection: { ...CONN, auth: { type: "oauth2", tokenUrl: OAUTH.tokenUrl } } } }, ADMIN);
    expect(shape).toMatchObject({ ok: false, status: 400 });
    expect(await updateSource("partner_naukri", { name: "Renamed" }, ADMIN)).toMatchObject({ ok: false, status: 403 });
    const good = await updateSource("partner_naukri", { config: { kind: "partnership", connection: CONN } }, ADMIN);
    expect(good.ok).toBe(true);
    const src = await getSource("partner_naukri");
    expect(src).toMatchObject({ name: "Naukri", geography: ["IN"], status: "do_not_use", statusReason: PARTNER_STATUS_REASON, config: { kind: "partnership", partner: "naukri", connection: CONN } });
    // Configured but no credential yet: still can't be queried.
    expect(await isAvailable(src!)).toBe(false);
    const audit = (await jobsLakeStore().listAudit())[0];
    expect(audit).toMatchObject({ action: "source.updated", actor: ADMIN, detail: { format: "json_api", auth: "oauth2", host: "api.partner.example" } });
  });
});

describe("OAuth 2.0 client credentials", () => {
  it("fetches a token once and reuses it across requests", async () => {
    partnerServer();
    const a = await fetchPartner(CONN, crit, SECRET);
    const b = await fetchPartner(CONN, crit, SECRET);
    expect(a.raws).toHaveLength(2);
    expect(b.raws).toHaveLength(2);
    const tokenCalls = calls.filter((c) => c.url === OAUTH.tokenUrl);
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]).toMatchObject({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`wonderjobs:${SECRET}`).toString("base64")}` } });
    expect(tokenCalls[0].body).toBe("grant_type=client_credentials");
    const api = calls.filter((c) => c.url.startsWith("https://api.partner.example/"));
    expect(api.every((c) => c.headers.authorization === "Bearer tok_1")).toBe(true);
    expect(new URL(api[0].url).searchParams.get("q")).toBe("identity security");
    expect(new URL(api[0].url).searchParams.get("loc")).toBe("Bengaluru");
  });

  it("concurrent requests share one token request", async () => {
    partnerServer();
    const [t1, t2] = await Promise.all([oauth2Token(OAUTH, SECRET), oauth2Token(OAUTH, SECRET)]);
    expect([t1, t2]).toEqual(["tok_1", "tok_1"]);
    expect(calls.filter((c) => c.url === OAUTH.tokenUrl)).toHaveLength(1);
  });

  it("refreshes the token when it expires", async () => {
    partnerServer();
    const t0 = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(t0);
    expect(await oauth2Token(OAUTH, SECRET)).toBe("tok_1");
    now.mockReturnValue(t0 + 30 * 60_000);
    expect(await oauth2Token(OAUTH, SECRET)).toBe("tok_1");
    now.mockReturnValue(t0 + 3600_000 - 30_000); // inside the renewal margin
    expect(await oauth2Token(OAUTH, SECRET)).toBe("tok_2");
    expect(calls.filter((c) => c.url === OAUTH.tokenUrl)).toHaveLength(2);
  });

  it("a token the partner refuses is renewed once; a replaced client secret never reuses the old token", async () => {
    partnerServer();
    await fetchPartner(CONN, crit, SECRET);
    tokenSeq++; // the partner revokes tok_1: only tok_2 is accepted now
    const r = await fetchPartner(CONN, crit, SECRET);
    expect(r.raws).toHaveLength(2);
    expect(calls.filter((c) => c.url === OAUTH.tokenUrl)).toHaveLength(2);
    expect(await oauth2Token(OAUTH, "a_different_secret_1234")).not.toBe(await oauth2Token(OAUTH, SECRET));
  });

  it("supports client_secret_post and a scope", async () => {
    partnerServer();
    await oauth2Token({ ...OAUTH, scope: "jobs.read", clientAuth: "body" }, SECRET);
    const body = new URLSearchParams(calls[0].body);
    expect(Object.fromEntries(body)).toEqual({ grant_type: "client_credentials", scope: "jobs.read", client_id: "wonderjobs", client_secret: SECRET });
    expect(calls[0].headers.authorization).toBeUndefined();
  });

  it("never puts the secret in an error — even when the token endpoint echoes it", async () => {
    partnerServer({ token: (c) => new Response(JSON.stringify({ error: "invalid_client", received: c.body }), { status: 401 }) });
    const e = await fetchPartner(CONN, crit, SECRET).catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe("The token endpoint rejected the client credentials (401)");
    expect(e.code).toBe("SOURCE_NEEDS_SETUP");
    expect(JSON.stringify({ m: e.message, s: e.stack })).not.toContain(SECRET);
  });

  it("the token request never follows a redirect (the client secret only goes to the configured URL)", async () => {
    partnerServer({ token: () => new Response("", { status: 302, headers: { location: "https://elsewhere.example/steal" } }) });
    await expect(oauth2Token(OAUTH, SECRET)).rejects.toThrow(/redirect/i);
    expect(calls.some((c) => c.url.startsWith("https://elsewhere.example"))).toBe(false);
  });
});

describe("other partner auth and delivery formats", () => {
  it("API key header, bearer and key-in-URL put the secret exactly where configured", async () => {
    partnerServer({ api: () => new Response(JSON.stringify({ data: { jobs: [posting(1)] } })) });
    await fetchPartner({ ...CONN, auth: { type: "header", header: "X-Api-Key", prefix: "Key " } }, crit, SECRET);
    await fetchPartner({ ...CONN, auth: { type: "bearer" } }, crit, SECRET);
    await fetchPartner({ ...CONN, auth: { type: "query", param: "api_key" } }, crit, SECRET);
    const [h, b, q] = calls;
    expect(h.headers["x-api-key"]).toBe(`Key ${SECRET}`);
    expect(b.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(new URL(q.url).searchParams.get("api_key")).toBe(SECRET);
    expect(q.headers.authorization).toBeUndefined();
  });

  it("a credential header is never forwarded to another origin on a redirect", async () => {
    partnerServer({ api: () => new Response("", { status: 302, headers: { location: "https://cdn.other.example/jobs.json" } }) });
    await fetchPartner({ ...CONN, auth: { type: "bearer" } }, crit, SECRET).catch(() => undefined);
    const hop = calls.find((c) => c.url.startsWith("https://cdn.other.example/"));
    expect(hop).toBeTruthy();
    expect(hop!.headers.authorization).toBeUndefined();
  });

  it("a missing credential is Needs setup, not a request", async () => {
    partnerServer();
    await expect(fetchPartner(CONN, crit, undefined)).rejects.toMatchObject({ code: "SOURCE_NEEDS_SETUP" });
    expect(calls).toHaveLength(0);
  });

  it("scrubs a key in the URL out of a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => {
      throw new Error(`connect failed for ${String(u)}`);
    });
    const e = await fetchPartner({ ...CONN, endpoint: "https://k.example/j", auth: { type: "query", param: "k" } }, { query: "", locations: [] }, "abcd1234secret").catch((x) => x);
    expect(e.message).toMatch(/could not be reached/);
    expect(e.message).not.toContain("abcd1234secret");
  });

  it("reads an XML job feed (<job> elements) and an authenticated full feed is filtered locally", async () => {
    const xml = `<?xml version="1.0"?><source><job><title><![CDATA[Identity Security Lead]]></title><url>https://acme.example/jobs/9</url><company>Acme</company><city>Pune</city><country>IN</country><date>2026-10-01</date><referencenumber>R9</referencenumber><description>${LONG}</description></job><job><title>Pastry Chef</title><url>https://cafe.example/jobs/1</url><company>Cafe</company><city>Pune</city><date>2026-10-01</date><description>Bake.</description></job></source>`;
    expect(parseFeed(xml)[0]).toMatchObject({ externalId: "R9", title: "Identity Security Lead", company: "Acme", location: "Pune, IN", applyUrl: "https://acme.example/jobs/9" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u, init) => {
      calls.push({ url: String(u), method: "GET", headers: (init?.headers ?? {}) as Record<string, string> });
      return new Response(xml, { headers: { "content-type": "application/xml" } });
    });
    const r = await fetchPartner({ format: "feed", endpoint: "https://feeds.partner.example/all.xml", auth: { type: "bearer" } }, crit, SECRET);
    expect(r.raws).toHaveLength(2); // the connector returns the whole feed…
    expect(new URL(calls[0].url).search).toBe(""); // …asked for with no search parameters
    const { finish } = await import("@/server/jobs/providers");
    expect(finish("partner_foundit", r.raws, { query: "identity security", locations: [] }).map((j) => j.title)).toEqual(["Identity Security Lead"]); // …and local matching filters it
  });
});

describe("activation is governed (WJ-256)", () => {
  async function configure(id = "partner_naukri") {
    await updateSource(id, { config: { kind: "partnership", connection: CONN } }, ADMIN);
  }

  it("an unconfigured partner can't be tested or activated", async () => {
    expect(await testSourceById("partner_linkedin", ADMIN)).toMatchObject({ ok: false, status: 409, error: { code: "SOURCE_NEEDS_SETUP" } });
    expect(await activateSource("partner_linkedin", ADMIN, { agreementConfirmed: true })).toMatchObject({ ok: false, status: 403 });
  });

  it("needs a credential, a passing test AND the agreement; each refusal leaves it Do not use", async () => {
    await configure();
    expect(await activateSource("partner_naukri", ADMIN, { agreementConfirmed: true })).toMatchObject({ ok: false, status: 403, error: { message: "Store the partner's credential first." } });
    await setSourceCredential("partner_naukri", SECRET, ADMIN);
    expect(await activateSource("partner_naukri", ADMIN, { agreementConfirmed: true })).toMatchObject({ ok: false, status: 409, error: { code: "VALIDATION_FAILED" } }); // never tested

    // A failing test (the partner rejects the client credentials) can't activate it.
    const fetchMock = partnerServer({ token: () => new Response("{}", { status: 401 }) });
    const failed = await testSourceById("partner_naukri", ADMIN);
    expect(failed).toMatchObject({ ok: true, value: { ok: false, error: "The token endpoint rejected the client credentials (401)" } });
    expect(await activateSource("partner_naukri", ADMIN, { agreementConfirmed: true })).toMatchObject({ ok: false, status: 409 });
    fetchMock.mockRestore();

    // A passing test, but no agreement ticked: still refused.
    partnerServer();
    const passed = await testSourceById("partner_naukri", ADMIN);
    expect(passed).toMatchObject({ ok: true, value: { ok: true, discovered: 2 } });
    expect((await getSource("partner_naukri"))!.status).toBe("do_not_use");
    expect(await activateSource("partner_naukri", ADMIN)).toMatchObject({ ok: false, status: 403 });
    expect(await activateSource("partner_naukri", ADMIN, { agreementConfirmed: false })).toMatchObject({ ok: false, status: 403 });
    expect((await getSource("partner_naukri"))!.status).toBe("do_not_use");
    expect((await jobsLakeStore().listAudit()).some((a) => a.action === "source.activated")).toBe(false);

    // Everything in place: active, with who/when recorded and audited.
    const ok = await activateSource("partner_naukri", "lead@wonderjobs.test", { agreementConfirmed: true, agreementReference: "MSA-2026-17" });
    expect(ok.ok).toBe(true);
    const src = (await getSource("partner_naukri"))!;
    expect(src).toMatchObject({ status: "active", agreement: { confirmedBy: "lead@wonderjobs.test", reference: "MSA-2026-17" } });
    expect(Date.parse(src.agreement!.confirmedAt)).toBeGreaterThan(Date.now() - 60_000);
    const audit = await jobsLakeStore().listAudit();
    expect(audit.slice(0, 2).map((a) => [a.action, a.actor])).toEqual([
      ["source.activated", "lead@wonderjobs.test"],
      ["partner.agreement_confirmed", "lead@wonderjobs.test"],
    ]);
    expect(audit[1].detail).toEqual({ reference: "MSA-2026-17" });
    expect(JSON.stringify(audit)).not.toContain(SECRET);
    expect(JSON.stringify(await jobsLakeStore().listSources())).not.toContain(SECRET);

    // Changing the connection puts it straight back to Do not use, untested.
    await updateSource("partner_naukri", { config: { kind: "partnership", connection: { ...CONN, queryParam: "keywords" } } }, ADMIN);
    expect(await getSource("partner_naukri")).toMatchObject({ status: "do_not_use", statusReason: PARTNER_STATUS_REASON, lastTest: undefined });
  });

  it("fails closed: a stored 'active' partner without an agreement record is Do not use", async () => {
    const rec = PARTNERSHIP_SOURCES.find((s) => s.id === "partner_indeed")!;
    await jobsLakeStore().putSource({ ...rec, status: "active", config: { kind: "partnership", partner: "indeed", connection: CONN } });
    expect((await listSources()).find((s) => s.id === "partner_indeed")).toMatchObject({ status: "do_not_use", statusReason: PARTNER_STATUS_REASON });
  });

  it("readiness says what's left, in order", () => {
    expect(partnerReadiness({ credentialPresent: false, active: false }).next).toBe("connection");
    expect(partnerReadiness({ connection: CONN, credentialPresent: false, active: false }).next).toBe("credential");
    expect(partnerReadiness({ connection: CONN, credentialPresent: true, active: false }).next).toBe("test");
    expect(partnerReadiness({ connection: CONN, credentialPresent: true, lastTest: { ok: true, at: new Date().toISOString() }, active: false }).next).toBe("agreement");
    expect(partnerReadiness({ connection: CONN, credentialPresent: true, agreement: { confirmedBy: ADMIN, confirmedAt: new Date().toISOString() }, active: true }).next).toBeNull();
  });
});

describe("a configured partner source is searched like any other source", () => {
  it("runs through core.search with its jobs, provenance and per-source status", async () => {
    await updateSource("partner_naukri", { config: { kind: "partnership", connection: CONN } }, ADMIN);
    await setSourceCredential("partner_naukri", SECRET, ADMIN);
    partnerServer();
    await testSourceById("partner_naukri", ADMIN);
    expect((await activateSource("partner_naukri", ADMIN, { agreementConfirmed: true })).ok).toBe(true);

    // Only the partner: every built-in belongs to a candidate source id this request didn't choose.
    const { response, plan } = await search({ query: { text: "identity security", locations: ["Bengaluru"] }, sourceIds: ["partner_naukri"], searchMode: "balanced", limit: 50, cache: "refresh" }, { trigger: "search" });
    expect(plan.waves.flat().map((p) => p.id)).toEqual(["partner_naukri"]);
    expect(response.sources).toEqual([expect.objectContaining({ sourceId: "partner_naukri", sourceName: "Naukri", outcome: "ok", retrieved: 2 })]);
    expect(response.results.map((o) => o.title).sort()).toEqual(["Identity Security Engineer 2", "Senior Director, Identity Security"]);
    const rec = response.results[0].sourceRecords[0];
    expect(rec).toMatchObject({ sourceId: "partner_naukri", accessStrategy: "partner_api", category: "portal" });
    expect(response.results[0].canonicalApplyUrl).toMatch(/^https:\/\/acme\.example\/jobs\//);
    const api = calls.filter((c) => c.url.startsWith("https://api.partner.example/"));
    expect(new URL(api.at(-1)!.url).searchParams.get("q")).toBe("identity security");
  });

  it("an unactivated partner is never searched, even when configured", async () => {
    await updateSource("partner_naukri", { config: { kind: "partnership", connection: CONN } }, ADMIN);
    await setSourceCredential("partner_naukri", SECRET, ADMIN);
    partnerServer();
    const { plan } = await search({ query: { text: "identity security", locations: [] }, sourceIds: ["partner_naukri"], searchMode: "maximum_coverage", limit: 50 }, { trigger: "search" });
    expect(plan.waves.flat()).toHaveLength(0);
    expect(plan.skipped.find((s) => s.id === "partner_naukri")?.reason).toBe("Status is Do not use");
    expect(calls.some((c) => c.url.includes("partner.example"))).toBe(false);
  });
});
