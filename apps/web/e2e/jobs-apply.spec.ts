import { test as base, expect, chromium, type BrowserContext, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * JobsApply end to end (spec §118–§141). The WonderJobs helper (the real MV3 extension) is loaded
 * into Chromium; employers' pages are WonderJobs' own mock portals (`e2e/fixtures/portals`), served
 * by request interception — no real employer site is ever contacted and nothing is submitted
 * anywhere (§150). Demo mode: the sample candidate and the demo "Razorpay" application, whose
 * Application Pack already has a résumé, cover letter and answers.
 *
 * The test build of the extension differs from the shipped one in exactly two ways, both written
 * below: it talks to the server under test, and it has host access to the mock employer hosts (the
 * stand-in for the candidate choosing "Allow on this site", a browser permission prompt automation
 * can't click).
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3211";
const PORTALS = path.join(__dirname, "fixtures/portals");
const EXT_SRC = path.resolve(__dirname, "../../../extension");
const CHROMIUM = process.env.PW_CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

const JOB = "job_razorpay_spm";
const APPLY = `/demo?next=/app/jobs/${JOB}/apply`;

/** Which mock portal answers a URL. `employerPage` is what the demo job's own apply link serves in a given test. */
function portalFor(url: URL, employerPage: string): string | null {
  if (url.pathname === "/__portal/_submit.js") return "_submit.js";
  if (url.hostname === "evil-redirect.test") return "mock-evil.html";
  if (url.hostname === "boards.greenhouse.io") return "mock-greenhouse.html";
  if (url.hostname === "jobs.lever.co") return "mock-lever.html";
  if (url.hostname === "jobs.ashbyhq.com") return "mock-ashby.html";
  if (url.hostname.endsWith(".myworkdayjobs.com")) return "mock-workday.html";
  if (url.hostname.startsWith("careers.") || url.hostname === "jobs.example") return employerPage;
  return null;
}

async function servePortals(ctx: BrowserContext, employerPage: () => string) {
  await ctx.route(/^https:\/\//, async (route: Route) => {
    const url = new URL(route.request().url());
    const file = portalFor(url, employerPage());
    if (!file) return route.abort();
    await route.fulfill({ status: 200, contentType: file.endsWith(".js") ? "application/javascript" : "text/html; charset=utf-8", body: fs.readFileSync(path.join(PORTALS, file), "utf8") });
  });
}

function buildTestExtension(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wj-helper-"));
  fs.cpSync(EXT_SRC, dir, { recursive: true });
  const origin = new URL(BASE).origin;
  const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  m.host_permissions.push(`${origin}/*`, "https://*/*");
  m.content_scripts[0].matches.push(`${origin}/*`);
  m.content_scripts[1].matches.push("https://*/*");
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(m, null, 2));
  fs.writeFileSync(path.join(dir, "config.js"), `export const WONDERJOBS_ORIGINS = [${JSON.stringify(origin)}];\n`);
  return dir;
}

type Fixtures = { context: BrowserContext; page: Page; portal: { set: (file: string) => void } };

const test = base.extend<Fixtures>({
  portal: [async ({}, use) => {
    let file = "mock-greenhouse.html";
    await use({ set: (f) => (file = f) });
    void file;
  }, { scope: "test" }],
  context: async ({ portal }, use, info) => {
    info.skip(info.project.name !== "chromium", "The helper runs in desktop Chromium");
    let current = "mock-greenhouse.html";
    const origSet = portal.set;
    portal.set = (f) => {
      current = f;
      origSet(f);
    };
    const ext = buildTestExtension();
    const ctx = await chromium.launchPersistentContext("", {
      executablePath: CHROMIUM,
      headless: true,
      viewport: { width: 1280, height: 900 },
      acceptDownloads: true,
      permissions: ["clipboard-read", "clipboard-write"],
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    });
    await servePortals(ctx, () => current);
    if (!ctx.serviceWorkers().length) await ctx.waitForEvent("serviceworker", { timeout: 15_000 });
    await use(ctx);
    await ctx.close();
    fs.rmSync(ext, { recursive: true, force: true });
  },
  page: async ({ context }, use) => {
    const p = context.pages()[0] ?? (await context.newPage());
    await use(p);
  },
});

/* ------------------------------------------------------------------ steps */

async function openApply(page: Page) {
  await page.goto(APPLY);
  await expect(page.getByRole("heading", { name: "How would you like to apply?" })).toBeVisible({ timeout: 30_000 });
}

/** Start with the browser helper; returns the employer tab it opened. */
async function startWithHelper(page: Page, context: BrowserContext): Promise<Page> {
  await expect(page.getByRole("radio", { name: /Fill it in with the browser helper/ })).toHaveAttribute("aria-checked", "true");
  const [employer] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Start application" }).click()]);
  await employer.waitForLoadState("domcontentloaded");
  await expect(employer).toHaveURL(/^https:\/\//, { timeout: 15_000 });
  return employer;
}

const panel = (employer: Page) => employer.locator("#wonderjobs-autofill-root");

async function sessionJson(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const r = await fetch("/api/jobs-apply/sessions", { cache: "no-store" });
    const list = (await r.json()) as { sessions: { id: string }[] };
    const full = await Promise.all(list.sessions.map((s) => fetch(`/api/jobs-apply/sessions/${s.id}`, { cache: "no-store" }).then((x) => x.text())));
    return full.join("\n");
  });
}

/* ------------------------------------------------------- golden journeys */

test.describe("JobsApply with the browser helper", () => {
  test.describe.configure({ timeout: 120_000 });

  test("GJ1 / APPLY-004…060: fill safe fields, stop for what's yours, draft an answer, submit on the employer's site, confirm, tracked", async ({ page, context }) => {
    await openApply(page);
    await expect(page.getByRole("radiogroup", { name: "Résumé to use" }).getByText("Tailored résumé for this role (DOCX)")).toBeVisible();
    await expect(page.getByText(/Application destination:/)).toBeVisible();
    const employer = await startWithHelper(page, context);

    // The helper read the form and offers to fill — nothing is filled until the candidate chooses Fill (policy "Ask").
    const fill = panel(employer).getByRole("button", { name: /^Fill \d+ fields?$/ });
    await expect(fill).toBeVisible({ timeout: 20_000 });
    await expect(employer.locator("#first_name")).toHaveValue("");
    await fill.click();
    await expect(employer.locator("#first_name")).toHaveValue("Alex", { timeout: 15_000 });
    await expect(employer.locator("#last_name")).toHaveValue("Morgan");
    await expect(employer.locator("#email")).toHaveValue("alex.morgan@example.com");
    await expect(employer.locator("#phone")).toHaveValue("+91 90000 00000");
    await expect(employer.locator("#linkedin")).toHaveValue("https://www.linkedin.com/in/example-alex-morgan");
    expect(await employer.locator("#resume").evaluate((el: HTMLInputElement) => el.files?.[0]?.name)).toMatch(/\.docx$/);
    // APPLY-019/052: sensitive questions are never filled.
    await expect(employer.locator("#wa")).toHaveValue("");
    await expect(employer.locator("#gender")).toHaveValue("");
    // APPLY-053 / EXT-010: nothing was submitted.
    expect(await employer.evaluate(() => (window as unknown as { __submits: number }).__submits)).toBe(0);

    // WonderJobs shows the live state.
    await expect(page.getByTestId("wj-apply-summary")).toContainText(/filled/, { timeout: 15_000 });
    const needs = page.getByRole("heading", { name: /^Needs you/ });
    await expect(needs).toBeVisible();
    await expect(page.getByText("Are you legally authorized to work in India?").first()).toBeVisible();

    // GJ10: work authorization — answered by the candidate on the employer's form; the helper notices only that it has a value.
    await employer.locator("#wa").selectOption("1");
    const openItems = page.getByRole("heading", { name: /^Needs you/ }).locator("xpath=ancestor::*[contains(@class,'wj-card')][1]").locator("ol > li");
    await expect(openItems.filter({ hasText: "Are you legally authorized to work in India?" })).toHaveCount(0, { timeout: 15_000 });
    // The optional equal-opportunity question stays with the candidate, untouched.
    await expect(openItems.filter({ hasText: "Gender" }).getByRole("button", { name: "I've answered it on the form" })).toBeVisible();

    // GJ9 / APPLY-037…041: Wonder drafts, labelled AI-generated; the candidate edits and approves.
    await page.getByRole("button", { name: "Draft with Wonder" }).click();
    await expect(page.getByTestId("wj-ai-label")).toBeVisible({ timeout: 15_000 });
    const answer = page.getByRole("textbox", { name: /Answer to Why do you want to join Example/ });
    await expect(answer).not.toHaveValue("");
    await answer.fill("I want to build Example's identity platform with the team.");
    await page.getByRole("button", { name: "Use answer" }).click();
    // The helper picks up the approved answer and offers to fill it.
    const fillOne = panel(employer).getByRole("button", { name: "Fill 1 field" });
    await expect(fillOne).toBeVisible({ timeout: 15_000 });
    await fillOne.click();
    await expect(employer.locator("#why")).toHaveValue("I want to build Example's identity platform with the team.", { timeout: 10_000 });

    // The candidate submits on the employer's site. Wonder sees the confirmation — as evidence only.
    await employer.getByRole("button", { name: "Submit Application" }).click();
    await expect(employer.getByText("Thank you for applying!")).toBeVisible();
    expect(await employer.evaluate(() => (window as unknown as { __submits: number }).__submits)).toBe(1);
    await expect(page.getByTestId("wj-evidence")).toContainText("confirmation number GH-12345", { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Application submitted" })).toHaveCount(0);

    // Only the candidate's answer marks it submitted.
    await page.getByRole("button", { name: "Yes, application submitted" }).click();
    await expect(page.getByRole("heading", { name: "Application submitted" })).toBeVisible();
    await expect(page.getByText(/Confirmation: GH-12345/)).toBeVisible();
    await page.getByRole("link", { name: "View in Applications" }).click();
    await expect(page.getByText("Confirmed by you after applying with Wonder", { exact: false }).first()).toBeVisible();

    // SEC-006/007: no candidate value in the audit trail.
    const json = await sessionJson(page);
    const audit = JSON.stringify(JSON.parse(json.split("\n")[0]).session.audit);
    for (const v of ["Alex", "alex.morgan@example.com", "90000", "identity platform with the team"]) expect(audit).not.toContain(v);
  });

  test("GJ2 / APPLY-045…047: sign in on the employer's site, verification challenge pauses, password never reaches WonderJobs", async ({ page, context, portal }) => {
    portal.set("mock-login.html");
    await openApply(page);
    const employer = await startWithHelper(page, context);
    await expect(page.getByText("Sign in on the employer's site").first()).toBeVisible({ timeout: 20_000 });
    await expect(panel(employer).getByText("You're not signed in to this portal.")).toBeVisible();
    // The candidate signs in themselves.
    await employer.locator("#u").fill("alex.morgan@example.com");
    await employer.locator("#p").fill("hunter2-secret-pw");
    await employer.locator("#signin").click();
    await expect(panel(employer).getByText("Verification required")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Verification required").first()).toBeVisible({ timeout: 15_000 });
    // The candidate completes the challenge (here: it goes away), then continues.
    await employer.locator("#captcha").evaluate((f) => f.remove());
    await panel(employer).getByRole("button", { name: "I've completed it" }).click();
    await panel(employer).getByRole("button", { name: /^Fill \d+ fields?$/ }).click();
    await expect(employer.locator("#first_name")).toHaveValue("Alex", { timeout: 15_000 });
    const json = await sessionJson(page);
    expect(json).not.toContain("hunter2");
    expect(json).toContain("AUTH_COMPLETED");
  });

  test("GJ3 + GJ8 / APPLY-018/039: an unfamiliar form — generic reader, salary confirmed and remembered, a metric only the candidate knows, the right résumé field", async ({ page, context, portal }) => {
    portal.set("mock-generic.html");
    await openApply(page);
    const employer = await startWithHelper(page, context);
    await panel(employer).getByRole("button", { name: /^Fill \d+ fields?$/ }).click({ timeout: 20_000 });
    await expect(employer.locator("input[name=gn]")).toHaveValue("Alex", { timeout: 15_000 });
    await expect(employer.locator("input[name=contact_mail]")).toHaveValue("alex.morgan@example.com");
    await expect(employer.locator("input[name=base]")).toHaveValue("Bengaluru, India");
    // Consent is a declaration — never ticked for the candidate.
    await expect(employer.locator("input[name=consent]")).not.toBeChecked();

    // Salary: confirm-before-fill, remembered for next time.
    const salary = page.getByRole("textbox", { name: /Your answer to Expected salary/ });
    await salary.fill("₹60,00,000");
    await page.getByRole("listitem").filter({ has: salary }).getByRole("button", { name: "Use this" }).click();
    // Two fields could take the résumé — the candidate chooses.
    await page.getByRole("listitem").filter({ hasText: /^\d+\. CV/ }).getByRole("button", { name: "Put my résumé here" }).click();
    // A measurable result is asked for, not invented.
    await expect(page.getByText("Wonder needs one detail.")).toBeVisible();

    const fillMore = panel(employer).getByRole("button", { name: /^Fill \d+ fields?$/ });
    await expect(fillMore).toBeVisible({ timeout: 15_000 });
    await fillMore.click();
    await expect(employer.locator("input[name=exp_sal]")).toHaveValue("₹60,00,000", { timeout: 15_000 });
    expect(await employer.locator("input[name=cv]").evaluate((el: HTMLInputElement) => el.files?.length ?? 0)).toBe(1);
    expect(await employer.locator("input[name=cv2]").evaluate((el: HTMLInputElement) => el.files?.length ?? 0)).toBe(0);

    await page.goto("/app/career-dna");
    await expect(page.getByRole("heading", { name: "Application answers Wonder remembers" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("₹60,00,000")).toBeVisible();
  });

  test("GJ7 / APPLY-050: an unexpected destination pauses everything; the candidate stops", async ({ page, context }) => {
    await openApply(page);
    const employer = await startWithHelper(page, context);
    await expect(panel(employer).getByRole("button", { name: /^Fill \d+ fields?$/ })).toBeVisible({ timeout: 20_000 });
    await employer.getByRole("link", { name: "Continue on our partner site" }).click();
    await expect(employer).toHaveURL(/evil-redirect\.test/);
    await expect(panel(employer).getByText("Wonder paused this application.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Wonder detected a new destination: https://evil-redirect.test")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("alert").getByRole("button", { name: "Stop" }).click();
    await expect(page.getByText("You stopped this application").first()).toBeVisible({ timeout: 15_000 });
  });

  test("APPLY-051: a payment request blocks the application", async ({ page, context, portal }) => {
    portal.set("mock-payment.html");
    await openApply(page);
    const employer = await startWithHelper(page, context);
    await expect(panel(employer).getByText("Wonder found a payment request.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Wonder found a payment request").first()).toBeVisible({ timeout: 15_000 });
    await expect(employer.locator("input[name=cc]")).toHaveValue("");
  });

  test("EXT-009 / GJ6: Stop in the helper panel stops field actions; WonderJobs offers to continue after a reload", async ({ page, context }) => {
    await openApply(page);
    const employer = await startWithHelper(page, context);
    await expect(panel(employer).getByRole("button", { name: /^Fill \d+ fields?$/ })).toBeVisible({ timeout: 20_000 });
    await panel(employer).getByRole("button", { name: "Stop" }).click();
    await expect(panel(employer).getByText("You stopped Wonder.")).toBeVisible();
    await expect(page.getByText("You stopped this application").first()).toBeVisible({ timeout: 15_000 });
    await expect(employer.locator("#first_name")).toHaveValue("");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Continue application" })).toBeVisible({ timeout: 20_000 });
  });

  test("APPLY-063 / APPLY-071 / GJ4: no form on the page → guided mode keeps the candidate moving", async ({ page, context, portal }) => {
    portal.set("mock-broken.html");
    await openApply(page);
    await startWithHelper(page, context);
    await expect(page.getByText("Wonder couldn't identify this application form yet").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Guided application" })).toBeVisible();
    await expect(page.getByTestId("wj-apply-url")).toContainText("https://");
  });
});

/* ---------------------------------------------------- web-only journeys */

const web = base;

web.describe("JobsApply in WonderJobs", () => {
  web.beforeEach(async ({}, info) => {
    info.skip(info.project.name !== "chromium" && info.project.name !== "Mobile Chrome", "Chromium-only sandbox");
  });

  web("APPLY-001/002: Apply with Wonder is offered where a résumé exists, and explained where it doesn't", async ({ page }) => {
    await page.goto(`/demo?next=/app/jobs/${JOB}`);
    await expect(page.getByRole("link", { name: "Apply with Wonder" })).toBeVisible({ timeout: 30_000 });
    await page.goto("/app/jobs/job_airbnb_pm");
    await expect(page.getByRole("button", { name: "Apply with Wonder" })).toBeDisabled({ timeout: 20_000 });
    await expect(page.getByText("Prepare a résumé first")).toBeVisible();
  });

  web("GJ5 / APPLY-006: an application already submitted is flagged before anything starts", async ({ page }) => {
    await page.goto("/demo?next=/app/jobs/job_google_pm/apply");
    await expect(page.getByRole("heading", { name: "Wonder found an existing application for this opportunity" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "View application" })).toHaveAttribute("href", "/app/applications/app_google");
  });

  web("GJ4 / APPLY-072…077: guided mode — copy, download, open, then the candidate confirms", async ({ page }, info) => {
    await page.goto(APPLY);
    await expect(page.getByRole("heading", { name: "How would you like to apply?" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("radio", { name: /Guide me/ }).click();
    await page.getByRole("button", { name: "Start application" }).click();
    await expect(page.getByRole("heading", { name: "Guided application" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("+91 90000 00000")).toBeVisible();
    await expect(page.getByTestId("wj-apply-url")).toContainText("https://");
    if (info.project.name === "chromium") {
      const [resume] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).first().click()]);
      expect(resume.suggestedFilename()).toMatch(/Resume.*\.docx$/);
      const [zip] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download Application Pack" }).first().click()]);
      expect(zip.suggestedFilename()).toMatch(/^Application_Pack_.*\.zip$/);
    }
    await page.getByRole("button", { name: "Yes, application submitted" }).click();
    await expect(page.getByRole("heading", { name: "Application submitted" })).toBeVisible({ timeout: 15_000 });
    await page.goto("/app/applications/apply");
    await expect(page.getByRole("heading", { name: "Recently submitted" })).toBeVisible({ timeout: 20_000 });
  });

  web("UI-003/005/007/008: preflight on a phone — no horizontal scroll, labelled controls", async ({ page }) => {
    await page.goto(APPLY);
    await expect(page.getByRole("heading", { name: "How would you like to apply?" })).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await expect(page.getByRole("radiogroup", { name: "Application method" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Application steps" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Résumé to use" })).toBeVisible();
  });

  web("admin: JobsApply operations shows adapters, domain policies and counts only", async ({ page }, info) => {
    info.skip(info.project.name !== "chromium", "desktop admin");
    await page.goto("/platform/jobs-apply");
    await expect(page.getByRole("heading", { name: "JobsApply", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("cell", { name: /Greenhouse/ }).first()).toBeVisible();
    await expect(page.getByText("Candidate controlled").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Domain policies" })).toBeVisible();
  });
});

/* ------------------------------------------------ adapter contract (§148) */

type Contract = { fixture: string; provider: string; filled: [string, string][]; file: string; untouched: string[]; answer?: (p: Page) => Promise<void>; afterFirstFill?: (p: Page) => Promise<void>; secondFile?: string; submit: string; confirmation: string };

const CONTRACTS: Contract[] = [
  { fixture: "mock-greenhouse.html", provider: "Greenhouse", filled: [["#first_name", "Alex"], ["#last_name", "Morgan"], ["#email", "alex.morgan@example.com"]], file: "#resume", untouched: ["#wa", "#gender"], answer: (p) => p.locator("#wa").selectOption("1").then(() => undefined), submit: "Submit Application", confirmation: "GH-12345" },
  { fixture: "mock-lever.html", provider: "Lever", filled: [["input[name=name]", "Alex Morgan"], ["input[name=email]", "alex.morgan@example.com"], ["input[name=org]", "Northwind Payments (sample)"], ["input[name='urls[LinkedIn]']", "https://www.linkedin.com/in/example-alex-morgan"]], file: "input[name=resume]", untouched: [], answer: (p) => p.locator("input[name='cards[sponsor]'][value=no]").check(), submit: "Submit application", confirmation: "LV-777001" },
  { fixture: "mock-ashby.html", provider: "Ashby", filled: [["#_systemfield_name", "Alex Morgan"], ["#_systemfield_email", "alex.morgan@example.com"]], file: "#_systemfield_resume", untouched: ["#q_disability"], submit: "Submit Application", confirmation: "AB-55120" },
  {
    fixture: "mock-workday.html",
    provider: "Workday",
    filled: [["#legalNameSection_firstName", "Alex"], ["#legalNameSection_lastName", "Morgan"], ["#email", "alex.morgan@example.com"], ["#phone-number", "+91 90000 00000"]],
    file: "",
    untouched: [],
    // Multi-step: the candidate moves on; the helper reads step 2 and fills the résumé there.
    afterFirstFill: async (p) => p.getByRole("button", { name: "Next" }).click(),
    secondFile: "#resumeUpload",
    answer: (p) => p.locator("#auth").fill("Yes"),
    submit: "Submit",
    confirmation: "WD-REQ-4410",
  },
];

test.describe("Adapter contract ADAPTER-001…010", () => {
  test.describe.configure({ timeout: 120_000 });
  for (const c of CONTRACTS) {
    test(`${c.provider}: detect, inspect, map, fill, upload, intervention, navigation, submission detection`, async ({ page, context, portal }) => {
      portal.set(c.fixture);
      await openApply(page);
      const employer = await startWithHelper(page, context);
      // ADAPTER-001/002/003: detected and read — the adapter names itself in the audit.
      await panel(employer).getByRole("button", { name: /^Fill \d+ fields?$/ }).click({ timeout: 20_000 });
      // ADAPTER-004/005: mapped and filled from the candidate's own profile.
      for (const [sel, v] of c.filled) await expect(employer.locator(sel)).toHaveValue(v, { timeout: 15_000 });
      // ADAPTER-006: the résumé is attached.
      if (c.secondFile) expect(await employer.locator(c.secondFile).evaluate((el: HTMLInputElement) => el.files?.length ?? 0)).toBe(0);
      if (c.file) await expect.poll(() => employer.locator(c.file).evaluate((el: HTMLInputElement) => el.files?.length ?? 0)).toBe(1);
      // ADAPTER-007: sensitive questions are left for the candidate.
      for (const sel of c.untouched) await expect(employer.locator(sel)).toHaveValue("");
      if (c.fixture === "mock-lever.html") await expect(employer.locator("input[name='cards[sponsor]']:checked")).toHaveCount(0);
      // ADAPTER-008: navigation to the next step is read and filled.
      if (c.afterFirstFill) {
        await c.afterFirstFill(employer);
        await panel(employer).getByRole("button", { name: /^Fill \d+ fields?$/ }).click({ timeout: 20_000 });
        await expect.poll(() => employer.locator(c.secondFile!).evaluate((el: HTMLInputElement) => el.files?.length ?? 0), { timeout: 15_000 }).toBe(1);
      }
      expect(await employer.evaluate(() => (window as unknown as { __submits: number }).__submits)).toBe(0);
      // The candidate answers what only they can, on the form.
      await c.answer?.(employer);
      // ADAPTER-010: the candidate submits; the confirmation is detected as evidence.
      await employer.getByRole("button", { name: c.submit, exact: true }).click();
      await expect(page.getByTestId("wj-evidence")).toContainText(c.confirmation, { timeout: 20_000 });
      const json = await sessionJson(page);
      expect(json).toContain(`${c.provider} form`);
    });
  }
});
