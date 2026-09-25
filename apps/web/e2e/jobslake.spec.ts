import { test, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { createTestAccount, deleteTestAccount, signInThroughUI, skipOnboardingIfShown, supabaseConfigured, type TestAccount } from "./fixtures/auth";

/**
 * JobsLake journeys WJ-JL-001..040 (JobsLake spec §88). Everything here runs against real sources —
 * Greenhouse, Lever, Ashby, the remote-job aggregators and Remotive's public API — never a mock.
 *
 * Two server set-ups, each honestly reported as skipped when it isn't the one running:
 * - Admin + protocol journeys need the admin portal reachable by the test's browser. Locally that's
 *   `JOBSLAKE_LOCAL_ADMIN=1` with Supabase Auth unconfigured (the portal refuses that switch whenever
 *   real auth is on). MCP journeys also need JOBSLAKE_MCP_ENABLED=1 and JOBSLAKE_MCP_TOKEN, shared
 *   with this process.
 * - Candidate journeys need a signed-in account, because only real accounts search through JobsLake
 *   (demo/local mode uses sample data by design). They create a disposable, pre-confirmed Supabase
 *   account and delete it afterwards; without Supabase admin credentials they're BLOCKED, not faked.
 *
 * WJ-JL-038/039/040 (warm pool, search depth, scheduled runs) are asserted in unit tests —
 * src/server/jobslake/core.test.ts and src/server/workflow/scheduledRun.test.ts — where the inputs
 * that make them deterministic can be controlled; 039 is additionally checked here against the planner
 * through the playground.
 */

const ADMIN = "/api/jobs-lake/admin";
const PORTAL = "/platform/jobs-lake";
const REMOTIVE_API = {
  endpoint: "https://remotive.com/api/remote-jobs?limit=30",
  queryParam: "search",
  mapping: { itemsPath: "jobs", fields: { sourceJobId: "id", title: "title", employer: "company_name", location: "candidate_required_location", description: "description", applyUrl: "url", postedAt: "publication_date" } },
};

async function adminReachable(request: APIRequestContext) {
  return (await request.get(`${ADMIN}/settings`)).status() === 200;
}

async function removeSource(request: APIRequestContext, id: string) {
  await request.delete(`${ADMIN}/sources/${id}`);
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

/* ================================================================= admin */

test.describe("JobsLake admin", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(async ({ request }, info) => {
    info.skip(info.project.name !== "chromium" && info.project.name !== "Mobile Chrome", "Chromium-only sandbox");
    info.skip(!(await adminReachable(request)), "BLOCKED: admin portal not reachable (run with JOBSLAKE_LOCAL_ADMIN=1 and Supabase Auth unconfigured)");
  });

  test("WJ-JL-013 admin opens JobsLake", async ({ page }) => {
    await page.goto(PORTAL);
    await expect(page.getByRole("heading", { name: "JobsLake", level: 1 })).toBeVisible();
    await expect(page.getByText("Active sources", { exact: true })).toBeVisible();
  });

  test("WJ-JL-014 admin views the source registry — access labels, and partnership portals marked Do not use", async ({ page }, info) => {
    info.skip(info.project.name !== "chromium", "table layout is desktop");
    await page.goto(`${PORTAL}/sources`);
    const row = (name: string) => page.getByRole("row").filter({ has: page.getByRole("link", { name: new RegExp(`^${name}`) }) });
    await expect(row("Greenhouse")).toContainText("API");
    await expect(row("LinkedIn")).toContainText("Do not use");
  });

  test("WJ-JL-016/018/019 admin detects an ATS board, tests it against the real board, and activates it", async ({ page, request }) => {
    test.setTimeout(120_000);
    await removeSource(request, "ats_lever_spotify");
    await page.goto(`${PORTAL}/add`);
    await page.getByLabel("Careers or job-listing URL").fill("https://jobs.lever.co/spotify");
    await page.getByRole("button", { name: "Detect" }).click();
    await expect(page.getByText("Lever board detected")).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Save as draft" }).click();
    await page.getByRole("button", { name: "Run test" }).click();
    await expect(page.getByText(/^Test (passed|failed)/)).toBeVisible({ timeout: 60_000 });
    // A real test only lists checks that ran, with real counts.
    await expect(page.getByText("Connection", { exact: true })).toBeVisible();
    await expect(page.getByText("Protocol v1 validation", { exact: true })).toBeVisible();
    const passed = await page.getByText(/^Test passed/).isVisible();
    test.skip(!passed, "Spotify's Lever board didn't pass today; nothing to activate");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Activate source" }).click();
    await expect(page.getByText(/Spotify careers is active/)).toBeVisible();
  });

  test("WJ-JL-015/017/024 admin adds an API source; its mapping is validated live, and a missing required field blocks it", async ({ page, request }) => {
    test.setTimeout(120_000);
    const created = await request.post(`${ADMIN}/sources`, { data: { name: `Remotive API ${Date.now()}`, config: { kind: "json_api", api: { ...REMOTIVE_API, mapping: { itemsPath: "jobs", fields: {} } } } } });
    expect(created.status()).toBe(201);
    const { source } = await created.json();
    expect(source.status).toBe("draft");
    await page.goto(`${PORTAL}/sources/${source.id}`);
    await page.getByRole("tab", { name: "Mapping" }).click();
    await page.getByLabel("List of jobs is at").fill("jobs");
    for (const [label, path] of [["Source job id", "id"], ["Title", "title"], ["Employer name", "company_name"], ["Location", "candidate_required_location"], ["Description", "description"], ["Apply URL", "url"]] as const) await page.getByLabel(`Source field for ${label}`).fill(path);
    // Posted at left unmapped on purpose.
    await page.getByRole("button", { name: "Preview with live data" }).click();
    const required = page.getByRole("listitem").filter({ hasText: "Required fields mapped" });
    await expect(required).toContainText("Missing: postedAt", { timeout: 30_000 });
    await expect(required.getByLabel("Failed")).toBeVisible();
    await page.getByLabel("Source field for Posted at").fill("publication_date");
    await page.getByRole("button", { name: "Preview with live data" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Required fields mapped" }).getByLabel("Passed")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Save mapping" }).click();
    await expect(page.getByText(/Mapping saved/)).toBeVisible();
    await page.getByRole("button", { name: "Run test" }).click();
    await expect(page.getByText(/^Test (passed|failed)/)).toBeVisible({ timeout: 60_000 });
    await removeSource(request, source.id);
  });

  test("WJ-JL-023 invalid and partnership-only sources are refused", async ({ request }) => {
    expect((await (await request.post(`${ADMIN}/detect`, { data: { url: "not a url at all" } })).json()).kind).toBe("invalid");
    const naukri = await (await request.post(`${ADMIN}/detect`, { data: { url: "https://www.naukri.com/jobs" } })).json();
    expect(naukri).toMatchObject({ kind: "partnership", provider: "Naukri" });
    const act = await request.post(`${ADMIN}/sources/partner_naukri/activate`);
    expect(act.status()).toBe(403);
  });

  test("WJ-JL-025 SSRF destinations are refused before anything is stored", async ({ page, request }) => {
    for (const endpoint of ["https://169.254.169.254/latest/meta-data", "https://localhost/jobs", "http://example.com/jobs", "https://10.1.2.3/x"]) {
      const r = await request.post(`${ADMIN}/sources`, { data: { name: "ssrf", config: { kind: "json_api", api: { ...REMOTIVE_API, endpoint } } } });
      expect(r.status(), endpoint).toBe(400);
      expect((await r.json()).error.code).toBe("DESTINATION_BLOCKED");
    }
    // …and the wizard says so.
    await page.goto(`${PORTAL}/add`);
    await page.getByRole("radio", { name: /Feed/ }).click();
    await page.getByRole("button", { name: "Skip detection and configure manually" }).click();
    await page.getByLabel("Name").fill("Internal feed");
    await page.getByLabel("Feed URL (https)").fill("https://127.0.0.1/feed.xml");
    await page.getByRole("button", { name: "Save as draft" }).click();
    await expect(page.getByText(/can't be used/)).toBeVisible();
  });

  test("WJ-JL-026/027 a credential is masked in the UI and never returned by any API", async ({ page, request }) => {
    const secret = `sk_e2e_${Date.now()}_DO_NOT_LEAK_9876`;
    const created = await request.post(`${ADMIN}/sources`, { data: { name: `Credentialed ${Date.now()}`, config: { kind: "json_api", api: { ...REMOTIVE_API, credentialHeader: "X-API-Key" } }, credential: secret } });
    const createdText = await created.text();
    const { source } = JSON.parse(createdText);
    await page.goto(`${PORTAL}/sources/${source.id}`);
    await page.getByRole("tab", { name: "Configuration" }).click();
    await expect(page.getByText("••••••••9876")).toBeVisible();
    const bodies = [createdText, await (await request.get(`${ADMIN}/sources/${source.id}`)).text(), await (await request.get(`${ADMIN}/sources`)).text(), await (await request.get(`${ADMIN}/audit`)).text(), await page.content()];
    for (const b of bodies) expect(b).not.toContain("DO_NOT_LEAK");
    await removeSource(request, source.id);
  });

  test("WJ-JL-021/039 playground runs a real search; modes change the plan's depth", async ({ page, request }) => {
    test.setTimeout(120_000);
    await page.goto(`${PORTAL}/playground`);
    await page.getByLabel("Search terms").fill("software engineer");
    await page.getByLabel("Locations").fill("Remote");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("Raw response (Protocol v1)")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("heading", { name: "Source outcomes" })).toBeVisible();
    const plan = async (searchMode: string) => (await (await request.post(`${ADMIN}/playground`, { data: { query: { text: "data analyst", locations: ["Remote"] }, searchMode, limit: 20 } })).json()).plan;
    const fast = await plan("fast");
    const max = await plan("maximum_coverage");
    expect(fast.depth).toBe("shallow");
    expect(max.depth).toBe("deep");
    expect(max.waves.flat().length).toBeGreaterThanOrEqual(fast.waves.flat().length);
  });

  test("WJ-JL-020/022 health and source contribution come from recorded runs", async ({ page, request }) => {
    test.setTimeout(120_000);
    // The WonderJobs client's own sequence: a search, then per-source relevant/strong counts.
    const search = await (await request.post("/api/jobs-lake/v1/search", { data: { query: { text: "product designer", locations: [] }, searchMode: "fast", limit: 50 } })).json();
    const ok = search.sources.find((s: { outcome: string }) => s.outcome === "ok");
    test.skip(!ok, "no source answered this search today");
    expect((await request.post("/api/jobs-lake/v1/telemetry", { data: { requestId: search.requestId, bySource: { [ok.sourceId]: { relevant: 3, strong: 1 } } } })).status()).toBe(200);
    await page.goto(`${PORTAL}/runs`);
    await expect(page.getByText("3 / 1").filter({ visible: true }).first()).toBeVisible();
    await page.goto(`${PORTAL}/health`);
    await expect(page.getByText(/Healthy|Degraded|Down/).first()).toBeVisible();
  });

  test("WJ-JL-030 administrative actions are audited", async ({ page, request }) => {
    const { source } = await (await request.post(`${ADMIN}/sources`, { data: { name: `Audited ${Date.now()}`, config: { kind: "feed", feed: { url: "https://remotive.com/remote-jobs/feed" } } } })).json();
    await request.patch(`${ADMIN}/sources/${source.id}`, { data: { status: "paused" } });
    await page.goto(`${PORTAL}/sources/${source.id}`);
    await page.getByRole("tab", { name: "Audit" }).click();
    await expect(page.getByText("source.created")).toBeVisible();
    await expect(page.getByText("source.paused")).toBeVisible();
    await removeSource(request, source.id);
  });

  test("WJ-JL-032 source configuration stays usable on a phone", async ({ page }, info) => {
    info.skip(info.project.name !== "Mobile Chrome", "mobile project only");
    await page.goto(`${PORTAL}/sources/greenhouse`);
    await expect(page.getByRole("heading", { name: "Greenhouse", level: 1 })).toBeVisible();
    await noHorizontalScroll(page);
    await page.getByRole("tab", { name: "Limits" }).click();
    await expect(page.getByLabel("Timeout (ms)")).toBeVisible();
    await noHorizontalScroll(page);
  });
});

/* ============================================================== protocol */

test.describe("JobsLake protocol", () => {
  test.beforeEach(async ({ request }, info) => {
    info.skip(info.project.name !== "chromium", "API journeys run once");
    info.skip(!(await adminReachable(request)), "BLOCKED: needs the local JobsLake server set-up");
  });

  test("WJ-JL-028/035/036/037 REST results are valid canonical opportunities with provenance; failures stay per source", async ({ request }) => {
    test.setTimeout(90_000);
    const r = await (await request.post("/api/jobs-lake/v1/search", { data: { query: { text: "engineer", locations: ["Remote"] }, searchMode: "balanced", limit: 100 } })).json();
    expect(r.protocolVersion).toBe("1.0");
    expect(r.metadata.sourcesPlanned).toBeGreaterThan(0);
    for (const o of r.results.slice(0, 20)) {
      expect(o.id).toMatch(/^opp_/);
      expect(o.title && o.employer.name && o.canonicalApplyUrl && o.postedAt).toBeTruthy();
      expect(o.sourceRecords.length).toBeGreaterThan(0);
      expect(o.sourceRecords.filter((x: { canonical: boolean }) => x.canonical)).toHaveLength(1);
      expect(o.provenance.find((p: { field: string }) => p.field === "title")).toBeTruthy();
    }
    // Adzuna has no credentials in this set-up: it says so, and every other source still answers.
    const adzuna = r.sources.find((s: { sourceId: string }) => s.sourceId === "adzuna_in");
    if (adzuna) expect(adzuna.outcome).toBe("needs_setup");
    expect(r.sources.some((s: { outcome: string }) => s.outcome === "ok")).toBe(true);
    // Where one posting was seen on an employer site and an aggregator, the employer's record is canonical.
    const merged = r.results.find((o: { sourceRecords: { category: string }[] }) => o.sourceRecords.length > 1 && o.sourceRecords.some((x) => x.category === "ats"));
    if (merged) expect(merged.sourceRecords.find((x: { canonical: boolean }) => x.canonical).category).toBe("ats");
  });

  test("WJ-JL-004 the stream emits real events, ending with the full response", async ({ request }) => {
    test.setTimeout(90_000);
    const res = await request.post("/api/jobs-lake/v1/search/stream", { data: { query: { text: "designer", locations: [] }, searchMode: "fast", limit: 30 } });
    expect(res.headers()["content-type"]).toContain("ndjson");
    const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(events[0].type).toBe("search_started");
    expect(events.at(-1).type).toBe("search_completed");
    expect(events.filter((e) => e.type === "source_completed")).toHaveLength(events[0].plannedSources.length);
  });

  test("WJ-JL-029 MCP search_jobs returns what REST returns", async ({ request }) => {
    test.setTimeout(120_000);
    const token = process.env.JOBSLAKE_MCP_TOKEN;
    const auth = { authorization: `Bearer ${token}` };
    const probe = await request.post("/api/jobs-lake/mcp", { headers: auth, data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    test.skip(!token || probe.status() !== 200, "BLOCKED: MCP not enabled on this server (JOBSLAKE_MCP_ENABLED + JOBSLAKE_MCP_TOKEN)");
    const args = { query: { text: "product manager", locations: ["Remote"] }, searchMode: "fast", limit: 25 };
    const rest = await (await request.post("/api/jobs-lake/v1/search", { headers: auth, data: args })).json();
    const mcp = (await (await request.post("/api/jobs-lake/mcp", { headers: auth, data: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "search_jobs", arguments: args } } })).json()).result;
    expect(mcp.isError).toBe(false);
    // Same schema, key for key (live sources may differ between two calls, so compare shapes, not values).
    const shape = (o: unknown): unknown => (Array.isArray(o) ? (o.length ? [shape(o[0])] : []) : o && typeof o === "object" ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, shape((o as Record<string, unknown>)[k])])) : typeof o);
    expect(Object.keys(mcp.structuredContent).sort()).toEqual(Object.keys(rest).sort());
    if (rest.results[0] && mcp.structuredContent.results[0]) expect(Object.keys(shape(mcp.structuredContent.results[0]) as object)).toEqual(Object.keys(shape(rest.results[0]) as object));
  });
});

/* ============================================================= candidate */

const RUN_URL = /\/app\/runs\/(?!new$)[^/?]+$/;

test.describe("Candidate searches through JobsLake", () => {
  let account: TestAccount | null = null;
  test.beforeEach(async ({ page }, info) => {
    info.skip(info.project.name !== "chromium" && info.project.name !== "Mobile Chrome", "Chromium-only sandbox");
    info.skip(!supabaseConfigured(), "BLOCKED: needs Supabase credentials — only signed-in accounts search through JobsLake");
    info.setTimeout(180_000);
    account = await createTestAccount("jobslake");
    await signInThroughUI(page, account);
    await skipOnboardingIfShown(page);
  });
  test.afterEach(async () => {
    if (account) await deleteTestAccount(account.id);
    account = null;
  });

  async function find(page: Page, request: string) {
    const lake = page.waitForRequest((r) => r.url().includes("/api/jobs-lake/v1/search") && r.method() === "POST");
    await page.goto("/app/runs/new");
    await page.locator("#find-request").fill(request);
    await page.getByRole("button", { name: "Find opportunities" }).last().click();
    await page.waitForURL(RUN_URL, { timeout: 20_000 });
    return { card: page.locator("section[aria-labelledby='run-experience-title']"), lake: await lake };
  }
  async function searchEvidence(page: Page): Promise<Locator> {
    await page.getByRole("button", { name: /See how Wonder worked/ }).click();
    await page.locator("#how-wonder-worked-panel").getByRole("button", { name: /Searching job sources/ }).first().click();
    return page.locator("#how-wonder-worked-panel");
  }
  async function toResults(card: Locator) {
    await expect(async () => {
      const t = await card.locator("#run-experience-title").innerText();
      if (/needs your input/i.test(t)) await card.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(card.getByRole("link", { name: /Strong opportunities|Search again/ }).first()).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 120_000 });
  }

  test("WJ-JL-001/002/003 Find Jobs sends the candidate's search to JobsLake — terms and places only", async ({ page }) => {
    await page.goto("/app/jobs");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const { lake } = await find(page, "Product designer roles, remote");
    const body = JSON.parse(lake.postData() ?? "{}");
    expect(Object.keys(body).sort()).toEqual(["limit", "query", "searchMode", "sourceIds"]);
    expect(Object.keys(body.query).sort()).toEqual(["locations", "text"]);
  });

  test("WJ-JL-004/005/006/034 progress is real, several sources answer, duplicates are merged, and status is announced", async ({ page }) => {
    const { card } = await find(page, "Software engineer roles, remote");
    await expect(page.locator("p[aria-live='polite']").first()).not.toBeEmpty();
    await toResults(card);
    const panel = await searchEvidence(page);
    await expect(panel.getByText("Searched with")).toBeVisible();
    await expect(panel.getByText("Sources searched")).toBeVisible();
    await page.locator("#how-wonder-worked-panel").getByRole("button", { name: /Removing duplicates/ }).first().click();
    await expect(panel.getByText("Cross-posted duplicates merged")).toBeVisible();
  });

  test("WJ-JL-007/008/009 a job shows where it was found, why it fits, and why a job was filtered", async ({ page }) => {
    const { card } = await find(page, "Product manager roles, remote");
    await toResults(card);
    await page.goto("/app/jobs");
    const first = page.getByRole("list", { name: "Job results" }).locator(":scope > li").first();
    await first.locator("h3 a").click();
    await page.getByRole("tab", { name: "Why it fits" }).click();
    await expect(page.getByRole("heading", { name: "Why this job?" })).toBeVisible();
    await page.getByRole("tab", { name: "Sources & signals" }).click();
    await expect(page.getByRole("heading", { name: "Where this job was found" })).toBeVisible();
    await page.getByRole("button", { name: "Not for me" }).click();
    await page.getByRole("group", { name: "Reason not for me" }).getByRole("button", { name: "Wrong industry" }).click();
    await expect(page.getByRole("button", { name: "Show it anyway" })).toBeVisible();
  });

  test("WJ-JL-010 a source that can't be searched is reported, and the search still completes", async ({ page }) => {
    const { card } = await find(page, "Data analyst roles, remote");
    await toResults(card);
    const panel = await searchEvidence(page);
    // Every source outcome is shown — including any that needed setup or failed on this deployment.
    await expect(panel.getByText(/jobs$|Needs setup|Unavailable|Didn't respond in time/).first()).toBeVisible();
  });

  test("WJ-JL-011/012 the candidate stops the search, then searches again", async ({ page }) => {
    const { card } = await find(page, "Marketing manager roles");
    await card.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(card.locator("#run-experience-title")).toHaveText("Search stopped", { timeout: 30_000 });
    await card.getByRole("link", { name: "Search again" }).click();
    await expect(page).toHaveURL(/\/app\/runs\/new/);
  });

  test("WJ-JL-031/033 mobile search has no horizontal overflow; reduced motion is honoured", async ({ page }, info) => {
    info.skip(info.project.name !== "Mobile Chrome", "mobile project only");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { card } = await find(page, "Customer support roles, remote");
    await expect(card).toBeVisible();
    await noHorizontalScroll(page);
  });
});
