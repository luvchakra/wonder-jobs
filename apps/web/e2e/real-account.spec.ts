import { test, expect, type Browser, type Page } from "@playwright/test";
import { createTestAccount, deleteTestAccount, signInThroughUI, skipOnboardingIfShown, supabaseConfigured, type TestAccount } from "./fixtures/auth";
import { openDescription } from "./utils/jobPage";

/**
 * Signed-in journeys against a real deployment (PLAYWRIGHT_BASE_URL) with real sources, real AI and
 * the real Supabase project — the production walk-through behind docs/checklists. Every account is a
 * disposable, pre-confirmed `wj-e2e-*@example.com` user created here and deleted afterwards; nothing
 * is ever submitted to an employer (the guided session stops before the candidate's own confirmation).
 * Without Supabase admin credentials the journeys are BLOCKED, not faked.
 */

const NAME = "Riya Test Candidate";

async function freshSignedIn(browser: Browser, tag: string): Promise<{ page: Page; account: TestAccount; close: () => Promise<void> }> {
  const account = await createTestAccount(tag);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signInThroughUI(page, account);
  await skipOnboardingIfShown(page);
  return { page, account, close: () => ctx.close() };
}

test.describe("Real account — production walk-through", () => {
  test.describe.configure({ mode: "serial", timeout: 300_000 });
  const accounts: TestAccount[] = [];

  test.beforeEach(async ({}, info) => {
    info.skip(info.project.name !== "chromium", "Desktop Chromium");
    info.skip(!supabaseConfigured(), "BLOCKED: needs Supabase admin credentials to create a disposable account");
  });
  test.afterAll(async () => {
    for (const a of accounts) await deleteTestAccount(a.id);
  });

  test("REAL-001 guards: signed-out API is refused, cron needs its secret, admin portals are hidden from candidates", async ({ page, request }) => {
    expect((await request.get("/api/jobs-apply/sessions")).status()).toBe(401);
    expect((await request.get("/api/cron/scheduled-runs")).status()).toBe(401);
    expect((await request.get("/api/cron/scheduled-runs", { headers: { authorization: "Bearer not-the-secret" } })).status()).toBe(401);
    const account = await createTestAccount("guards");
    accounts.push(account);
    await signInThroughUI(page, account);
    await skipOnboardingIfShown(page);
    for (const p of ["/platform/jobs-lake", "/platform/jobs-apply"]) expect((await page.goto(p))?.status()).toBe(404);
    const push = await (await page.request.get("/api/push/subscribe")).json();
    expect(push.configured).toBe(true);
    expect(push.publicKey).toMatch(/^B[A-Za-z0-9_-]{86}$/);
    const ai = await (await page.request.get("/api/ai/keys")).json();
    expect(ai.platform.configured).toBe(true);
    const { url } = await (await page.request.get("/api/calendar/link")).json();
    const feed = await page.request.get(url);
    expect(feed.status()).toBe(200);
    expect(await feed.text()).toContain("BEGIN:VCALENDAR");
  });

  test("REAL-002 career profile → résumé template → real search → Apply with Wonder (guided), isolated from a second account", async ({ browser }) => {
    const a = await freshSignedIn(browser, "journey");
    accounts.push(a.account);
    const { page } = a;

    // Career Profile: the facts résumés are built from, saved to the account and back after a reload.
    await page.goto("/app/career-dna");
    await page.locator("#name").fill(NAME);
    await page.locator("#headline").fill("Product Manager");
    await page.locator("#goal").fill("Senior product manager role in fintech");
    // Work history lives in its own folded row.
    await page.getByText("Work history, education and contact", { exact: true }).click();
    await page.getByRole("button", { name: "Add a role" }).click();
    await page.getByLabel("Job title").fill("Product Manager");
    await page.getByLabel("Employer").fill("Example Payments");
    await page.getByLabel("Started").first().fill("2021-04");
    await page.getByLabel("I work here now").check();
    await page.getByLabel("Achievements and responsibilities").fill("Led the checkout redesign with engineering and design\nRan weekly customer interviews");
    await page.locator("#contact-email").fill(a.account.email);
    await page.locator("#contact-email").blur();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Career Profile updated")).toBeVisible();
    await page.waitForTimeout(2_000); // remote sync is debounced
    await page.reload();
    await expect(page.locator("#name")).toHaveValue(NAME, { timeout: 20_000 });
    await expect(page.getByText(/^1 roles? —/)).toBeVisible();
    await page.getByText("Work history, education and contact", { exact: true }).click();
    await expect(page.getByText("Example Payments").first()).toBeVisible();

    // Résumé Studio: eight templates drawing this account's own data; generate and download a real PDF.
    await page.goto("/app/resume-studio?tab=templates");
    await expect(page.getByRole("heading", { name: "Choose a resume template" })).toBeVisible({ timeout: 20_000 });
    const cards = page.getByRole("list", { name: "Resume templates" }).getByRole("article");
    await expect(cards).toHaveCount(8);
    await expect(cards.first().getByRole("img")).toContainText(/Riya Test Candidate/i);
    // The first template is in every plan (a new account is on Free, which has the first few).
    await cards.first().getByRole("button", { name: /^Use the .+ template$/ }).click();
    await page.getByRole("button", { name: /^(Generate resume|Generate again)$/ }).click();
    await expect(page.getByText(/^Résumé ready|isn't ready yet|needs attention/).first()).toBeVisible({ timeout: 30_000 });
    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
    expect(Buffer.concat(await (await pdf.createReadStream()).toArray()).subarray(0, 5).toString()).toBe("%PDF-");

    // Find: a real search through WorksLake, with per-source evidence.
    const lake = page.waitForResponse((r) => r.url().includes("/api/jobs-lake/v1/search") && r.request().method() === "POST", { timeout: 60_000 });
    await page.goto(`/app/jobs?search=${encodeURIComponent("Product manager roles, remote")}`);
    const lakeRes = await lake;
    await page.locator("#main").getByRole("link", { name: "Details" }).first().click();
    expect(lakeRes.status()).toBe(200);
    const card = page.locator("section[aria-labelledby='run-experience-title']");
    await expect(async () => {
      const t = await card.locator("#run-experience-title").innerText();
      if (/needs your input/i.test(t)) await card.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(card.getByRole("link", { name: /Strong opportunities|Search again/ }).first()).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 150_000 });

    // Decide → Apply with Wonder on a real posting, guided (nothing is submitted). Apply with Wonder is a paid-plan
    // feature; pre-launch, a test account switches plans through the audited test-plan route.
    expect((await page.request.post("/api/billing/test-plan", { data: { plan: "max" } })).status()).toBe(200);
    await page.goto("/app/jobs");
    // A posting on an employer's own site: a job posted on WonderJobs (its card's Apply is "Easy Apply to …") is
    // applied to on WonderJobs itself with one tap, not through the guided page.
    const firstJob = page.locator("#main article").filter({ hasNot: page.getByRole("link", { name: /^Easy Apply to / }) }).locator("h3 a[href^='/app/jobs/']").first();
    await expect(firstJob).toBeVisible({ timeout: 30_000 });
    await firstJob.click();
    await page.waitForURL(/\/app\/jobs\/[^/]+$/);
    await openDescription(page);
    await page.getByText("Sources & hiring signals", { exact: true }).click({ timeout: 20_000 });
    await expect(page.getByText("Where this job was found")).toBeVisible();
    // On a computer the job page offers Easy Apply, which opens the guided page.
    await page.getByRole("link", { name: "Easy Apply" }).click({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "How would you like to apply?" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Change for this job" }).click();
    await page.getByRole("radio", { name: /Guide me/ }).click();
    await page.getByRole("button", { name: "Start application" }).click();
    await expect(page.getByRole("heading", { name: "Fill the form with Wonder beside you" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("wj-apply-url")).toHaveAttribute("title", /^https:\/\//);
    const sessions = await (await page.request.get("/api/jobs-apply/sessions")).json();
    const mine = (sessions.sessions ?? sessions) as { id: string }[];
    expect(mine.length).toBeGreaterThan(0);
    await page.goto("/app/applications/apply");
    await expect(page.getByRole("heading", { name: "Applications in progress" })).toBeVisible({ timeout: 20_000 });

    // Isolation: a second account sees none of the first account's profile or sessions.
    const b = await freshSignedIn(browser, "isolation");
    accounts.push(b.account);
    const theirs = await (await b.page.request.get("/api/jobs-apply/sessions")).json();
    const theirIds = ((theirs.sessions ?? theirs) as { id: string }[]).map((s) => s.id);
    for (const s of mine) expect(theirIds).not.toContain(s.id);
    expect((await b.page.request.get(`/api/jobs-apply/sessions/${mine[0].id}`)).status()).toBe(404);
    await b.page.goto("/app/career-dna");
    await expect(b.page.getByRole("heading", { name: "Career Profile" })).toBeVisible({ timeout: 20_000 });
    await expect(b.page.locator("#name")).not.toHaveValue(NAME);
    await b.close();
    await a.close();
  });
});
