import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { supabaseConfigured } from "./fixtures/auth";
import { openApp } from "./fixtures/sample";

/**
 * WonderWorks Network (WJ-811), two people each in their own browser with their own account: both join from
 * My network profile, one asks the other to connect with a note, the other sees the note and accepts, and each
 * then lists the other as a connection. A third account that never joined can't open either of them.
 *
 * Local build only (no Supabase: in-memory tables, each browser its own tenant; E2E_LEGACY_EMAIL=1 says a server
 * named by PLAYWRIGHT_BASE_URL is such a build, as in hiring.spec.ts). Both people start from the same
 * sample Career Profile, so they share a name; they are told apart by their network ids and by the note, which
 * carries a word nothing else contains.
 */
const LOCAL = !supabaseConfigured() && (!process.env.PLAYWRIGHT_BASE_URL || process.env.E2E_LEGACY_EMAIL === "1");
const token = `zq${randomBytes(3).toString("hex")}`;
const NOTE = `We met at the IAM meetup ${token}`;

type Person = { ctx: BrowserContext; page: Page; id: string };

async function person(browser: Browser, next: string): Promise<Person> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await openApp(page, next);
  return { ctx, page, id: "" };
}

/** Joins from My network profile and returns the member's network id (from "See my profile"). */
async function join(p: Person): Promise<string> {
  const { page } = p;
  await expect(page.getByRole("heading", { name: "My network profile" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Join the network" }).click();
  await expect(page.getByText("You're on the network")).toBeVisible();
  // Joining lands on My network, now with its three tabs.
  await expect(page.getByRole("tab", { name: "People" })).toBeVisible({ timeout: 20_000 });
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

  test.beforeEach(async ({}, info) => {
    info.skip(info.project.name !== "chromium", "Desktop Chromium");
    info.skip(!LOCAL, "BLOCKED: Network's tables (migration 0051) aren't on the Supabase project yet; this journey runs on a local build");
  });
  test.afterAll(async () => {
    for (const p of Object.values(people)) await p?.ctx.close().catch(() => {});
  });

  test("NET-001 someone who hasn't joined is asked to join, and both people join from My network profile", async ({ browser }) => {
    const asha = (people.asha = await person(browser, "/app/network"));
    await expect(asha.page.getByRole("heading", { name: "Join the network" })).toBeVisible({ timeout: 30_000 });
    await asha.page.getByRole("link", { name: "Set up my network profile" }).click();
    await expect(asha.page).toHaveURL(/\/app\/network\/profile/);
    // What it promises about contact details is on the page before they join.
    await expect(asha.page.getByText("Your email and phone are never shown.")).toBeVisible();
    await join(asha);

    const kunal = (people.kunal = await person(browser, "/app/network/profile"));
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
    await expect(asha.page.getByRole("tab", { name: "Invitations · 1" })).toBeVisible({ timeout: 20_000 });
    await expect(asha.page.getByText(`Worked together · “${NOTE}”`)).toBeVisible();
    await expect(asha.page.locator(`a[href="/app/network/${kunal.id}"]`).first()).toBeVisible();
    await asha.page.getByRole("button", { name: "Accept" }).click();
    await expect(asha.page.getByText(/^You and .+ are connected$/)).toBeVisible();

    await asha.page.goto("/app/network?tab=connections");
    await expect(asha.page.getByRole("tab", { name: "Connections · 1" })).toBeVisible({ timeout: 20_000 });
    await expect(asha.page.locator(`a[href="/app/network/${kunal.id}"]`).first()).toBeVisible();

    await kunal.page.goto("/app/network?tab=connections");
    await expect(kunal.page.getByRole("tab", { name: "Connections · 1" })).toBeVisible({ timeout: 20_000 });
    await expect(kunal.page.locator(`a[href="/app/network/${asha.id}"]`).first()).toBeVisible();
    await kunal.page.goto(`/app/network/${asha.id}`);
    await expect(kunal.page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(kunal.page.getByRole("button", { name: "Connect" })).toHaveCount(0);
  });

  test("NET-004 an account that never joined can't read either profile, and nothing sent to a browser names an account", async ({ browser }) => {
    const { asha, kunal } = people as Required<typeof people>;
    const visitor = (people.visitor = await person(browser, "/app/network"));
    await expect(visitor.page.getByRole("heading", { name: "Join the network" })).toBeVisible({ timeout: 30_000 });
    for (const path of [`/api/network/people/${asha.id}`, `/api/network/people/${asha.id}/photo`, "/api/network/people?q=alex", "/api/network/connections"]) {
      const res = await visitor.page.request.get(path);
      expect(res.status(), path).toBe(409);
      expect(await res.text()).not.toContain(asha.id);
    }
    // (Signed out is 401 on every route: src/app/api/network/network.journeys.test.ts. A local build has no sign-in.)
    // What a connected member's browser receives: network ids, never an account id or an email.
    for (const path of ["/api/network/connections", `/api/network/people/${asha.id}`, "/api/network/people?q=product"]) {
      const res = await kunal.page.request.get(path);
      expect(res.status(), path).toBe(200);
      const text = await res.text();
      expect(text).not.toMatch(/u-e2e-|wj-e2e-|@example\.com|tenant/i);
    }
  });
});
