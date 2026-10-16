import { test, expect, supabaseConfigured, signInThroughUI } from "./fixtures/auth";

/**
 * WJ-309: the help center is for signed-in accounts. Signed out, /help goes to sign-in (and back after),
 * the help assistant answers 401 with nothing from the guide, and no guide text reaches the browser.
 * The pages a signed-out visitor needs stay public.
 *
 * Needs real auth: with Supabase Auth unconfigured (local-only mode) every page is open by design, so the
 * signed-out checks report BLOCKED there. They run in the nightly's signed-in part.
 */

const GUIDE_TEXT = /User guide &(amp;)? FAQ|Frequently asked questions|Roadmap and known limitations/;
const PUBLIC = ["/", "/sign-in", "/sign-up", "/forgot-password", "/privacy", "/terms", "/cookies", "/security", "/about", "/extension", "/api-reference"];
const authOn = () => !!process.env.NEXT_PUBLIC_SUPABASE_URL;

test.describe("Help center — signed out", () => {
  test.beforeEach(({}, info) => {
    info.skip(info.project.name !== "chromium", "Desktop Chromium");
    info.skip(!authOn(), "BLOCKED: Supabase Auth isn't configured, so this deployment has no sign-in to require");
  });

  test("HELP-001 /help redirects to sign-in and the page's HTML carries no guide text", async ({ page, request }) => {
    const raw = await request.get("/help", { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(raw.status());
    const to = new URL(raw.headers()["location"]!, "http://x");
    expect(to.pathname).toBe("/sign-in");
    expect(to.searchParams.get("next")).toBe("/help");
    expect(await raw.text()).not.toMatch(GUIDE_TEXT);

    await page.goto("/help#faq");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fhelp/);
    expect(await page.content()).not.toMatch(GUIDE_TEXT);
  });

  test("HELP-002 the help assistant answers 401, with nothing from the guide", async ({ request }) => {
    const res = await request.post("/api/help/ask", { data: { question: "Where do the jobs come from?" } });
    expect(res.status()).toBe(401);
    const body = await res.text();
    expect(body).not.toMatch(/answer|sectionId|Greenhouse|career sites/i);
  });

  test("HELP-003 the pages a signed-out visitor needs still load, and link to no help page", async ({ page }) => {
    for (const path of PUBLIC) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      expect(new URL(page.url()).pathname, path).toBe(path);
      const helpLinks = await page.locator('a[href^="/help"]').count();
      expect(helpLinks, `${path} links to /help`).toBe(0);
    }
  });
});

test.describe("Help center — signed in", () => {
  test.beforeEach(({}, info) => {
    info.skip(info.project.name !== "chromium", "Desktop Chromium");
    info.skip(!supabaseConfigured(), "BLOCKED: needs Supabase admin credentials to create a disposable account");
  });

  test("HELP-004 a signed-in account reads the guide and asks it a question", async ({ page, account }) => {
    await signInThroughUI(page, account);
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "User guide & FAQ", level: 1 })).toBeVisible();
    const res = await page.request.post("/api/help/ask", { data: { question: "Where do the jobs come from?" } });
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { sectionId: string }).sectionId).toBe("sources");
  });
});
