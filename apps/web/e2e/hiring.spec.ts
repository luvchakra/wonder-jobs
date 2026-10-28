import { test, expect, type Browser, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { createTestAccount, deleteTestAccount, signInThroughUI, skipOnboardingIfShown, supabaseConfigured, type TestAccount } from "./fixtures/auth";
import { uniqueTestEmail } from "./utils/testUser";

/** A message in the open conversation: its bubble, not the conversation list's last-message preview of it. */
const message = (page: Page, text: string) => page.locator("p").filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });

/**
 * Employers, recruiters and job seekers, each in their own browser with their own real account (WJ-333):
 * an Owner sets up a company and posts a job, invites a Recruiter and a Hiring manager who join by email,
 * a job seeker turns on You → Recruiters, the Recruiter finds, shortlists, reports and messages them, the
 * Hiring manager decides, and the job seeker answers, declines, blocks and reopens. Every account is a
 * disposable wj-e2e-*@example.com user deleted afterwards (its workspace, jobs and messages go with it).
 * With Supabase admin credentials each person is a real signed-in account. Without them, on a local build this
 * suite starts itself (WJ_E2E_LEGACY_EMAIL=1, playwright.config.ts), each browser is a separate no-auth tenant
 * that carries a wj-e2e email cookie, so invitations by email still work; the one step that needs live job
 * sources (HIRE-009) runs only with real accounts. Against any other server without credentials: BLOCKED.
 */
const REAL = supabaseConfigured();
const LEGACY = !REAL && (!process.env.PLAYWRIGHT_BASE_URL || process.env.E2E_LEGACY_EMAIL === "1");

type Person = { page: Page; account: TestAccount; close: () => Promise<void> };
const token = `zq${randomBytes(3).toString("hex")}`; // a word no real profile or job contains
const COMPANY = `wj-e2e Hiring ${token}`;
const JOB_TITLE = `Platform Engineer ${token}`;

async function signedIn(browser: Browser, tag: string, accounts: TestAccount[]): Promise<Person> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let account: TestAccount;
  if (REAL) {
    account = await createTestAccount(tag);
    accounts.push(account);
    await signInThroughUI(page, account);
  } else {
    // Local no-auth build: a browser is its own tenant; the email cookie is read only under WJ_E2E_LEGACY_EMAIL=1.
    account = { id: `e2e_${randomBytes(8).toString("hex")}`, email: uniqueTestEmail(tag), password: "" };
    const url = new URL(test.info().project.use.baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3211");
    await ctx.addCookies([
      { name: "wj_uid", value: account.id, domain: url.hostname, path: "/" },
      { name: "wj_e2e_email", value: encodeURIComponent(account.email), domain: url.hostname, path: "/" },
    ]);
    await page.goto("/app");
  }
  await skipOnboardingIfShown(page);
  return { page, account, close: () => ctx.close() };
}

async function openHiring(page: Page, tab?: string) {
  // Without a tab, Hiring opens on the table of workspaces; the journey works inside one, on Jobs by default.
  await page.goto(`/app/hiring?tab=${tab ?? "jobs"}`);
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 20_000 });
}

async function acceptInvitation(p: Person) {
  await openHiring(p.page);
  await expect(p.page.getByText(`${COMPANY}`).first()).toBeVisible({ timeout: 20_000 });
  await p.page.getByRole("button", { name: "Join" }).click();
  await expect(p.page.getByText("You joined the workspace")).toBeVisible();
  await expect(p.page.getByRole("heading", { name: COMPANY })).toBeVisible({ timeout: 20_000 });
}

test.describe("Hiring — employer, recruiter, hiring manager and job seeker", () => {
  test.describe.configure({ mode: "serial", timeout: 300_000 });
  const accounts: TestAccount[] = [];
  const people: Partial<Record<"owner" | "recruiter" | "manager" | "seeker", Person>> = {};

  test.beforeEach(async ({}, info) => {
    info.skip(info.project.name !== "chromium", "Desktop Chromium");
    info.skip(!REAL && !LEGACY, "BLOCKED: invitations need signed-in emails (Supabase admin credentials, or a local build)");
  });
  test.afterAll(async () => {
    for (const p of Object.values(people)) await p?.close().catch(() => {});
    for (const a of accounts) await deleteTestAccount(a.id);
  });

  test("HIRE-001 a new account has no workspace, and is hidden from recruiters by default", async ({ browser }) => {
    const seeker = (people.seeker = await signedIn(browser, "hire-seeker", accounts));
    await openHiring(seeker.page);
    await expect(seeker.page.getByRole("button", { name: "Create workspace" })).toBeDisabled();
    await seeker.page.goto("/app/recruiters");
    await expect(seeker.page.getByText("Hidden from recruiters", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(seeker.page.getByRole("button", { name: "Turn on" })).toBeVisible();
    // Nothing is shown to recruiters before they turn it on.
    expect((await (await seeker.page.request.get("/api/talent/me")).json()).profile).toBeNull();
  });

  test("HIRE-002 the job seeker turns on You → Recruiters and sees exactly what recruiters see", async () => {
    const { page, account } = people.seeker!;
    await page.goto("/app/career-dna");
    await page.locator("#name").fill("Sam Tester");
    await page.locator("#headline").fill(`SRE ${token} Kubernetes`);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Career Profile updated")).toBeVisible();
    await page.waitForTimeout(2_000); // remote sync is debounced

    await page.goto("/app/recruiters");
    await expect(page.getByText("What recruiters see")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Sam T.").first()).toBeVisible();
    await expect(page.getByText(account.email)).toHaveCount(0);
    await page.locator("#pitch").fill("Looking for platform roles.");
    await page.getByRole("button", { name: "Turn on" }).click();
    // Saved once the button changes: the page shows "on" only from the server's answer.
    await expect(page.getByRole("button", { name: "Update what recruiters see" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Open to recruiters", { exact: true })).toBeVisible();
    const { profile } = await (await page.request.get("/api/talent/me")).json();
    expect(profile).toMatchObject({ displayName: "Sam T.", headline: `SRE ${token} Kubernetes`, summary: "Looking for platform roles." });
    expect(JSON.stringify(profile)).not.toContain(account.email);
  });

  test("HIRE-003 the Owner creates a workspace, posts a draft, is told what's missing, and opens it", async ({ browser }) => {
    const owner = (people.owner = await signedIn(browser, "hire-owner", accounts));
    const { page } = owner;
    // Hiring is a row under You.
    await page.goto("/app/you");
    await page.locator("#main").getByRole("link", { name: /^Hiring/ }).click();
    await page.waitForURL(/\/app\/hiring/);
    await page.getByLabel("Company name").fill(COMPANY);
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByRole("heading", { name: COMPANY })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("you're an Owner")).toBeVisible();
    await expect(page.getByText(/Not verified yet/)).toBeVisible();
    for (const tab of ["Jobs", "Talent", "Shortlist", "Messages", "Team"]) await expect(page.getByRole("tab", { name: tab })).toBeVisible();

    await page.getByRole("button", { name: "Post a job" }).click();
    const form = page.getByRole("dialog");
    await form.getByLabel("Job title").fill(JOB_TITLE);
    await form.getByLabel("Location").fill("Bengaluru");
    await form.getByLabel("Description").fill("Too short");
    await form.getByRole("button", { name: "Save draft" }).click();
    // The reason shows inside the form, which stays open.
    await expect(form.getByRole("alert")).toContainText("more characters");
    await form.getByLabel("Description").fill("Build and run the Kubernetes platform every product team ships on, with a small SRE group.");
    await form.getByLabel("Skills").fill("Kubernetes, Go");
    await form.getByRole("button", { name: "Save draft" }).click();
    await expect(form.getByRole("alert")).toContainText("where to apply");
    await form.getByLabel("Where to apply").fill("wonderhome.example/careers");
    await form.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Job saved as a draft")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const row = page.getByRole("listitem").filter({ hasText: JOB_TITLE });
    await expect(row.getByText("Draft")).toBeVisible();

    // It survives a reload, and its apply address was completed.
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: JOB_TITLE })).toBeVisible({ timeout: 20_000 });
    const list = await (await page.request.get(`/api/hiring`)).json();
    const orgId = list.workspaces[0].org.id;
    const [job] = (await (await page.request.get(`/api/hiring/${orgId}/jobs`)).json()).jobs;
    expect(job).toMatchObject({ title: JOB_TITLE, status: "draft", applyUrl: "https://wonderhome.example/careers" });

    await page.getByRole("listitem").filter({ hasText: JOB_TITLE }).getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByText(`${JOB_TITLE} is open`)).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: JOB_TITLE }).getByText("Open", { exact: true })).toBeVisible();
  });

  test("HIRE-004 the Owner invites a Recruiter and a Hiring manager; only the invited emails can join", async ({ browser }) => {
    const { page } = people.owner!;
    const recruiter = (people.recruiter = await signedIn(browser, "hire-recruiter", accounts));
    const manager = (people.manager = await signedIn(browser, "hire-manager", accounts));

    await openHiring(page, "team");
    for (const [who, role] of [[recruiter, "Recruiter"], [manager, "Hiring manager"]] as const) {
      await page.getByLabel("Email to invite").fill(who.account.email);
      await page.getByLabel("Role", { exact: true }).selectOption({ label: role });
      await page.getByRole("button", { name: "Invite" }).click();
      await expect(page.getByText(who.account.email, { exact: true })).toBeVisible();
    }
    // The job seeker wasn't invited and sees no invitation.
    await openHiring(people.seeker!.page);
    await expect(people.seeker!.page.getByRole("button", { name: "Join" })).toHaveCount(0);

    await acceptInvitation(recruiter);
    await expect(recruiter.page.getByText("you're a Recruiter")).toBeVisible();
    await acceptInvitation(manager);
    await expect(manager.page.getByText("you're a Hiring manager")).toBeVisible();

    await openHiring(page, "team");
    for (const who of [recruiter, manager]) await expect(page.getByText(who.account.email).first()).toBeVisible();
  });

  test("HIRE-005 each role sees only its own tabs and buttons", async () => {
    const recruiter = people.recruiter!.page;
    await openHiring(recruiter);
    for (const tab of ["Jobs", "Talent", "Shortlist", "Messages", "Team"]) await expect(recruiter.getByRole("tab", { name: tab })).toBeVisible();
    await recruiter.getByRole("tab", { name: "Jobs" }).click();
    await expect(recruiter.getByRole("button", { name: "Post a job" })).toHaveCount(0);
    await expect(recruiter.getByText(JOB_TITLE)).toBeVisible();

    const manager = people.manager!.page;
    await openHiring(manager);
    await expect(manager.getByRole("tab", { name: "Talent" })).toHaveCount(0);
    await expect(manager.getByRole("tab", { name: "Reports" })).toBeVisible();
    await expect(manager.getByRole("button", { name: "Post a job" })).toBeVisible();
    await openHiring(manager, "team");
    await expect(manager.getByLabel("Email to invite")).toHaveCount(0);

    // The server refuses what the buttons don't offer.
    const orgId = (await (await manager.request.get("/api/hiring")).json()).workspaces[0].org.id;
    expect((await manager.request.get(`/api/hiring/${orgId}/talent?q=kubernetes`)).status()).toBe(403);
    expect((await recruiter.request.post(`/api/hiring/${orgId}/jobs`, { data: { title: "x" } })).status()).toBeGreaterThanOrEqual(400);
    expect((await people.seeker!.page.request.get(`/api/hiring/${orgId}/jobs`)).status()).toBe(403);
  });

  test("HIRE-006 the Recruiter finds the job seeker, shortlists, reports and messages them", async () => {
    const page = people.recruiter!.page;
    await openHiring(page, "talent");
    await page.getByLabel("Skills or role").fill(token);
    await page.getByRole("button", { name: "Find candidates" }).click();
    const card = page.getByRole("listitem").filter({ hasText: "Sam T." });
    await expect(card).toHaveCount(1, { timeout: 20_000 });
    await expect(card).not.toContainText(people.seeker!.account.email);

    await card.getByRole("button", { name: "Shortlist" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("For which job (optional)").selectOption({ label: JOB_TITLE });
    await dialog.getByLabel("Note for hiring managers").fill("Strong Kubernetes background");
    await dialog.getByRole("button", { name: "Shortlist" }).click();
    await expect(page.getByText("Sam T. shortlisted")).toBeVisible();

    await card.getByRole("button", { name: "Message" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("For which job (optional)").selectOption({ label: JOB_TITLE });
    await dialog.getByLabel("Message").fill(`Hi Sam, ${COMPANY} is hiring a ${JOB_TITLE}. Interested?`);
    await dialog.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Message sent to Sam T.")).toBeVisible();

    await openHiring(page, "shortlist");
    const entry = page.getByRole("listitem").filter({ hasText: "Sam T." });
    await expect(entry).toContainText("Strong Kubernetes background");
    await expect(entry.getByRole("button", { name: "Interview" })).toHaveCount(0);
    await entry.getByRole("button", { name: "Report to hiring managers" }).click();
    await expect(entry.getByRole("button", { name: "Report to hiring managers" })).toHaveCount(0);
  });

  test("HIRE-007 the Hiring manager sees the report and decides Interview, then Pass; can read but not write messages", async () => {
    const page = people.manager!.page;
    await openHiring(page, "shortlist");
    const entry = page.getByRole("listitem").filter({ hasText: "Sam T." });
    await expect(entry).toBeVisible({ timeout: 20_000 });
    await expect(entry).toContainText(JOB_TITLE);
    await entry.getByRole("button", { name: "Interview" }).click();
    await expect(entry.getByRole("button", { name: "Interview" })).toBeDisabled();
    await entry.getByRole("button", { name: "Pass" }).click();
    await expect(entry.getByRole("button", { name: "Pass" })).toBeDisabled();
    await entry.getByRole("button", { name: "Interview" }).click();
    await expect(entry.getByRole("button", { name: "Interview" })).toBeDisabled();

    await openHiring(page, "messages");
    await page.getByRole("button", { name: /Sam T\./ }).click();
    await expect(page.getByText(/is hiring a/).first()).toBeVisible();
    await expect(page.getByLabel("Message")).toHaveCount(0);
    await expect(page.getByText(/Your role can read this conversation/)).toBeVisible();
  });

  test("HIRE-008 the job seeker replies, declines, blocks and reopens; the Recruiter sees each one", async () => {
    const seeker = people.seeker!.page;
    const recruiter = people.recruiter!.page;
    await seeker.goto("/app/recruiters");
    await seeker.getByRole("button", { name: new RegExp(COMPANY) }).click();
    await expect(seeker.getByText(/is hiring a/).first()).toBeVisible({ timeout: 20_000 });
    await seeker.getByLabel("Message").fill("Yes, happy to talk this week.");
    await seeker.getByRole("button", { name: "Send" }).click();
    await expect(message(seeker, "Yes, happy to talk this week.")).toBeVisible();

    const openThread = async () => {
      await openHiring(recruiter, "messages");
      await recruiter.getByRole("button", { name: /Sam T\./ }).click();
    };
    await openThread();
    await expect(message(recruiter, "Yes, happy to talk this week.")).toBeVisible({ timeout: 20_000 });
    await recruiter.getByLabel("Message").fill("Great, sending times.");
    await recruiter.getByRole("button", { name: "Send" }).click();
    await expect(message(recruiter, "Great, sending times.")).toBeVisible();

    // Not interested: the company can't write.
    await seeker.getByRole("button", { name: "Not interested" }).click();
    await expect(seeker.getByText("You declined")).toBeVisible();
    await openThread();
    await expect(recruiter.getByText("Declined by the candidate")).toBeVisible();
    await expect(recruiter.getByLabel("Message")).toHaveCount(0);

    // Block, then open again.
    await seeker.getByRole("button", { name: new RegExp(`Block ${COMPANY}`) }).click();
    await expect(seeker.getByText("You blocked this company")).toBeVisible();
    await expect(seeker.getByLabel("Message")).toHaveCount(0);
    await openThread();
    await expect(recruiter.getByText("The candidate blocked your company")).toBeVisible();
    await seeker.getByRole("button", { name: "Open again" }).click();
    await openThread();
    await expect(recruiter.getByLabel("Message")).toBeVisible();
  });

  test("HIRE-009 the open job shows up in a job seeker's Find search under the company's name", async ({}, info) => {
    info.skip(!REAL, "Needs live job sources: a local build without Supabase searches sample data");
    const page = people.seeker!.page;
    // The source itself: a search of WonderJobs employers alone returns the job with its company.
    const res = await page.request.post("/api/jobs-lake/v1/search", { data: { query: { text: JOB_TITLE, locations: [] }, sourceIds: ["employers"], searchMode: "fast", limit: 20 } });
    expect(res.status()).toBe(200);
    const { results } = (await res.json()) as { results: { title: string; company: { name: string } | string }[] };
    const hit = results.find((r) => r.title === JOB_TITLE);
    expect(hit, JSON.stringify(results.map((r) => r.title))).toBeTruthy();
    expect(JSON.stringify(hit)).toContain(COMPANY);
    // And in Find, among every source's results once the search has finished.
    await page.goto(`/app/jobs?search=${encodeURIComponent(JOB_TITLE)}`);
    await expect(page.getByText("Searching job sources")).toHaveCount(0, { timeout: 240_000 });
    const card = page.getByText(JOB_TITLE, { exact: true });
    for (let i = 0; i < 20 && !(await card.count()); i++) {
      const more = page.getByRole("button", { name: /Show more/ });
      if (!(await more.count())) break;
      await more.click();
    }
    await expect(card.first()).toBeVisible();
    await expect(page.getByText(COMPANY).first()).toBeVisible();
  });

  test("HIRE-010 turning off You → Recruiters hides the job seeker and stops the company writing", async () => {
    const seeker = people.seeker!.page;
    await seeker.goto("/app/recruiters");
    await seeker.getByRole("button", { name: "Turn off" }).click();
    await expect(seeker.getByText("Hidden from recruiters", { exact: true })).toBeVisible();

    const recruiter = people.recruiter!.page;
    await openHiring(recruiter, "talent");
    await recruiter.getByLabel("Skills or role").fill(token);
    await recruiter.getByRole("button", { name: "Find candidates" }).click();
    await expect(recruiter.getByRole("listitem").filter({ hasText: "Sam T." })).toHaveCount(0);
    await openHiring(recruiter, "messages");
    await recruiter.getByRole("button", { name: /Candidate|Sam T\./ }).first().click();
    await expect(recruiter.getByText(/no longer open to recruiters/)).toBeVisible();
    await expect(recruiter.getByLabel("Message")).toHaveCount(0);
  });

  test("HIRE-011 the Owner closes the job, keeps the last Owner, and renames the company", async () => {
    const { page, account } = people.owner!;
    await openHiring(page);
    await page.getByRole("listitem").filter({ hasText: JOB_TITLE }).getByRole("button", { name: "Close" }).click();
    await expect(page.getByText(`${JOB_TITLE} is closed`)).toBeVisible();
    const orgId = (await (await page.request.get("/api/hiring")).json()).workspaces[0].org.id;
    const me = (await (await page.request.get(`/api/hiring/${orgId}/team`)).json()).members.find((m: { email?: string }) => m.email === account.email);
    expect((await page.request.patch(`/api/hiring/${orgId}/team`, { data: { tenantId: me.tenantId, role: "recruiter" } })).status()).toBe(409);

    // The Owner renames the company and sets its website from the workspaces table (⋯ in its row, then Edit).
    await page.goto("/app/hiring");
    await page.getByLabel(`More for ${COMPANY}`).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Company name").fill(`${COMPANY} Homes`);
    await page.getByLabel("Website").fill("wonderhome.example");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Company details saved")).toBeVisible();
    await expect(page.getByRole("button", { name: `Open ${COMPANY} Homes`, exact: true })).toBeVisible();
    const renamed = (await (await page.request.get("/api/hiring")).json()).workspaces[0].org;
    expect(renamed).toMatchObject({ name: `${COMPANY} Homes`, website: "https://wonderhome.example" });
    // Other roles don't get the settings.
    await people.recruiter!.page.goto("/app/hiring");
    await expect(people.recruiter!.page.getByLabel(`More for ${COMPANY} Homes`)).toHaveCount(0);
  });
});
