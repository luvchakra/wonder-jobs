import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { CLEANUP_TIMEOUT_MS, createTestAccount, removeTestAccount, signInThroughUI, skipOnboardingIfShown, supabaseConfigured, type TestAccount } from "./fixtures/auth";
import { ERASE_PHRASE } from "../src/content/privacy";
import { openApp } from "./fixtures/sample";

/**
 * WonderWorks Network (WJ-811, WJ-812), two people each in their own browser with their own account: both join
 * from My network profile, one asks the other to connect with a note, the other sees the note and accepts, each
 * then lists the other as a connection, and a message one sends shows in the other's Messages. A third account
 * that never joined can't open either of them or their conversation. Last, one of them deletes their account and
 * is gone from the other's network, conversation included.
 *
 * Two ways to run, as hiring.spec.ts:
 *   - a local build without Supabase (in-memory tables, each browser its own tenant; E2E_LEGACY_EMAIL=1 says a
 *     server named by PLAYWRIGHT_BASE_URL is such a build). Both people start from the same sample Career Profile,
 *     so they share a name; they are told apart by their network ids and by the note's own word.
 *   - a local build on the Supabase project (the nightly's signed-in part): each person is a disposable
 *     wj-e2e-*@example.com account that signs in for real and puts a name on its Career Profile. Both delete their
 *     accounts through the product at the end, which is what removes their network data (WJ-815).
 * Against a deployment it doesn't run: the production part is the real-account walk-through only.
 */
const REAL = supabaseConfigured() && !process.env.PLAYWRIGHT_BASE_URL;
const LOCAL = !supabaseConfigured() && (!process.env.PLAYWRIGHT_BASE_URL || process.env.E2E_LEGACY_EMAIL === "1");
const token = `zq${randomBytes(3).toString("hex")}`;
const NOTE = `We met at the IAM meetup ${token}`;
const HELLO = `Good to connect ${token}`;
const REPLY = `Likewise ${token}`;
/** A message in the open conversation: its bubble. */
const bubble = (page: Page, text: string) => page.locator("p").filter({ hasText: new RegExp(`^${text}$`) });

type Person = { ctx: BrowserContext; page: Page; id: string; account?: TestAccount };

async function person(browser: Browser, next: string, tag: string, accounts: TestAccount[]): Promise<Person> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  if (!REAL) {
    await openApp(page, next);
    return { ctx, page, id: "" };
  }
  const account = await createTestAccount(`net-${tag}`);
  accounts.push(account);
  await signInThroughUI(page, account);
  await skipOnboardingIfShown(page);
  // A network profile comes from the Career Profile, and needs a name there.
  await page.goto("/app/career-dna");
  await page.locator("#name").fill(`${tag[0].toUpperCase()}${tag.slice(1)} Nettest`);
  await page.locator("#headline").fill("Product Manager");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Career Profile updated")).toBeVisible();
  await page.goto(next);
  return { ctx, page, id: "", account };
}

/** Deletes the signed-in account through the product itself ("Delete my account"), as the person would. */
const deleteOwnAccount = (p: Person) => p.page.request.post("/api/privacy/erase", { data: { confirm: ERASE_PHRASE } });

/** Joins from My network profile and returns the member's network id (from "See my profile"). */
async function join(p: Person): Promise<string> {
  const { page } = p;
  await expect(page.getByRole("heading", { name: "My network profile" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Join the network" }).click();
  await expect(page.getByText("You're on the network")).toBeVisible();
  // Joining lands on My network: the feed, with People, Invitations and Connections as the icons above it.
  await expect(page.getByRole("button", { name: "People" })).toBeVisible({ timeout: 20_000 });
  await page.goto("/app/network/profile");
  const mine = page.getByRole("link", { name: "See my profile" });
  await expect(mine).toBeVisible({ timeout: 20_000 });
  const id = (await mine.getAttribute("href"))!.split("/").pop()!;
  expect(id).toMatch(/^np_/);
  return (p.id = id);
}

test.describe("Network — two people connect", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });
  const people: Partial<Record<"asha" | "kunal" | "visitor", Person>> = {};
  const accounts: TestAccount[] = [];
  let conversation = ""; // /app/network/messages/<connection id>

  test.beforeEach(async ({}, info) => {
    info.skip(info.project.name !== "chromium", "Desktop Chromium");
    info.skip(!LOCAL && !REAL, "BLOCKED: runs on a local build (with or without the Supabase project), not against a deployment");
  });
  test.afterAll(async ({ browser }) => {
    test.setTimeout(CLEANUP_TIMEOUT_MS);
    for (const p of Object.values(people)) await p?.ctx.close().catch(() => {});
    // Whoever is still there (the visitor; everyone, if the journey stopped early) is deleted the product's way too,
    // which is what removes network data.
    for (const a of accounts) await removeTestAccount(browser, a);
  });

  test("NET-001 someone who hasn't joined is asked to join, and both people join from My network profile", async ({ browser }) => {
    const asha = (people.asha = await person(browser, "/app/network", "asha", accounts));
    await expect(asha.page.getByRole("heading", { name: "Join the network" })).toBeVisible({ timeout: 30_000 });
    await asha.page.getByRole("link", { name: "Set up my network profile" }).click();
    await expect(asha.page).toHaveURL(/\/app\/network\/profile/);
    // What it promises about contact details is on the page before they join.
    await expect(asha.page.getByText("Your email and phone are never shown.")).toBeVisible();
    await join(asha);

    const kunal = (people.kunal = await person(browser, "/app/network/profile", "kunal", accounts));
    await join(kunal);
    expect(kunal.id).not.toBe(asha.id);
  });

  test("NET-002 one opens the other's profile and sends a connect request with a note", async () => {
    const { asha, kunal } = people as Required<typeof people>;
    await kunal.page.goto(`/app/network/${asha.id}`);
    await kunal.page.getByRole("button", { name: "Connect" }).click();
    const sheet = kunal.page.getByRole("dialog");
    await expect(sheet.getByText("Your email and phone are never shared.")).toBeVisible();
    await sheet.getByRole("button", { name: "Worked together" }).click();
    await sheet.getByLabel("Add a note (optional)").fill(NOTE);
    await sheet.getByRole("button", { name: "Send request" }).click();
    await expect(kunal.page.getByText(/^Request sent to /)).toBeVisible();
    await expect(kunal.page.getByText("Requested", { exact: true })).toBeVisible();
    await expect(kunal.page.getByRole("button", { name: "Withdraw" })).toBeVisible();

    // It is listed under what he sent, and he isn't connected yet.
    await kunal.page.goto("/app/network?tab=invitations");
    await expect(kunal.page.getByRole("heading", { name: "Sent · 1" })).toBeVisible({ timeout: 20_000 });
    await kunal.page.goto("/app/network?tab=connections");
    await expect(kunal.page.getByText("No connections yet.")).toBeVisible({ timeout: 20_000 });
  });

  test("NET-003 the other sees the request with its note and accepts; each lists the other as a connection", async () => {
    const { asha, kunal } = people as Required<typeof people>;
    await asha.page.goto("/app/network?tab=invitations");
    await expect(asha.page.getByRole("button", { name: "Invitations · 1" })).toBeVisible({ timeout: 20_000 });
    await expect(asha.page.getByText(`Worked together · “${NOTE}”`)).toBeVisible();
    await expect(asha.page.locator(`a[href="/app/network/${kunal.id}"]`).first()).toBeVisible();
    await asha.page.getByRole("button", { name: "Accept" }).click();
    await expect(asha.page.getByText(/^You and .+ are connected$/)).toBeVisible();

    await asha.page.goto("/app/network?tab=connections");
    await expect(asha.page.getByRole("button", { name: "Connections · 1" })).toBeVisible({ timeout: 20_000 });
    await expect(asha.page.locator(`a[href="/app/network/${kunal.id}"]`).first()).toBeVisible();

    await kunal.page.goto("/app/network?tab=connections");
    await expect(kunal.page.getByRole("button", { name: "Connections · 1" })).toBeVisible({ timeout: 20_000 });
    await expect(kunal.page.locator(`a[href="/app/network/${asha.id}"]`).first()).toBeVisible();
    await kunal.page.goto(`/app/network/${asha.id}`);
    await expect(kunal.page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(kunal.page.getByRole("button", { name: "Connect" })).toHaveCount(0);
  });

  test("NET-004 a message to a connection shows in their Messages, and the reply comes back", async () => {
    const { asha, kunal } = people as Required<typeof people>;
    await kunal.page.goto(`/app/network/${asha.id}`);
    await kunal.page.getByRole("link", { name: "Message" }).click();
    await expect(kunal.page).toHaveURL(/\/app\/network\/messages\/nc_/);
    conversation = new URL(kunal.page.url()).pathname;
    await expect(kunal.page.getByText("No messages yet. Say hello.")).toBeVisible({ timeout: 20_000 });
    await kunal.page.getByRole("textbox", { name: "Message" }).fill(HELLO);
    await kunal.page.getByRole("button", { name: "Send" }).click();
    await expect(bubble(kunal.page, HELLO)).toBeVisible();

    // The other person finds it in Messages, marked as from a connection, and opens the conversation.
    await asha.page.goto("/app/network/messages");
    const row = asha.page.locator(`a[href="${conversation}"]`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(HELLO);
    await expect(row).toContainText("Connection");
    await row.click();
    await expect(bubble(asha.page, HELLO)).toBeVisible({ timeout: 20_000 });
    await asha.page.getByRole("textbox", { name: "Message" }).fill(REPLY);
    await asha.page.getByRole("button", { name: "Send" }).click();
    await expect(bubble(asha.page, REPLY)).toBeVisible();

    await kunal.page.goto(conversation);
    await expect(bubble(kunal.page, REPLY)).toBeVisible({ timeout: 20_000 });
    await kunal.page.goto("/app/network/messages");
    await expect(kunal.page.locator(`a[href="${conversation}"]`)).toContainText(REPLY, { timeout: 20_000 });
  });

  test("NET-005 an account that never joined can't read either profile or the conversation, and nothing sent to a browser names an account", async ({ browser }) => {
    const { asha, kunal } = people as Required<typeof people>;
    const visitor = (people.visitor = await person(browser, "/app/network", "visitor", accounts));
    await expect(visitor.page.getByRole("heading", { name: "Join the network" })).toBeVisible({ timeout: 30_000 });
    const thread = `/api/network/threads/${conversation.split("/").pop()}`;
    for (const path of [`/api/network/people/${asha.id}`, `/api/network/people/${asha.id}/photo`, "/api/network/people?q=alex", "/api/network/connections", "/api/network/threads", thread, "/api/network/updates"]) {
      const res = await visitor.page.request.get(path);
      expect(res.status(), path).toBe(409);
      const text = await res.text();
      expect(text).not.toContain(asha.id);
      expect(text).not.toContain(token);
    }
    expect((await visitor.page.request.post(thread, { data: { body: "Let me in", confirmed: true } })).status()).toBe(409);
    await visitor.page.goto(conversation);
    await expect(visitor.page.getByText("Conversation not available")).toBeVisible({ timeout: 20_000 });
    await expect(visitor.page.getByText(HELLO)).toHaveCount(0);
    await expect(visitor.page.getByRole("textbox", { name: "Message" })).toHaveCount(0);
    // (Signed out is 401 on every route: src/app/api/network/network.journeys.test.ts. A local build has no sign-in.)
    // What a connected member's browser receives: network ids, never an account id or an email.
    for (const path of ["/api/network/connections", `/api/network/people/${asha.id}`, "/api/network/people?q=product", "/api/network/threads", thread, "/api/network/updates"]) {
      const res = await kunal.page.request.get(path);
      expect(res.status(), path).toBe(200);
      const text = await res.text();
      expect(text).not.toMatch(/u-e2e-|wj-e2e-|@example\.com|tenant/i);
      for (const a of accounts) expect(text).not.toContain(a.id);
    }
  });

  test("NET-006 deleting an account takes the person, the connection and the conversation off the network", async () => {
    const { asha, kunal } = people as Required<typeof people>;
    const thread = `/api/network/threads/${conversation.split("/").pop()}`;
    const erased = await deleteOwnAccount(asha);
    expect(erased.status(), await erased.text()).toBe(200);
    // For the other person she is as if she had never been there, and nothing of the conversation is left to read.
    expect((await kunal.page.request.get(`/api/network/people/${asha.id}`)).status()).toBe(404);
    const gone = await kunal.page.request.get(thread);
    expect(gone.status()).toBe(404);
    expect(await gone.text()).not.toContain(token);
    expect(await (await kunal.page.request.get("/api/network/connections")).json()).toEqual({ connections: [], invitations: [], sent: [] });
    expect((await (await kunal.page.request.get("/api/network/threads")).json()).threads).toEqual([]);
    await kunal.page.goto(conversation);
    await expect(kunal.page.getByText("Conversation not available")).toBeVisible({ timeout: 20_000 });
    await kunal.page.goto("/app/network?tab=connections");
    await expect(kunal.page.getByText("No connections yet.")).toBeVisible({ timeout: 20_000 });
    // He deletes his too: nothing of either is left behind.
    expect((await deleteOwnAccount(kunal)).status()).toBe(200);
  });
});
