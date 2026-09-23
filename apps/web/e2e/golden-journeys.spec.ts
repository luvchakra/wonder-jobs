import { test, expect } from "@playwright/test";

/**
 * Golden-journey coverage for the core candidate experience, entirely in demo mode (`wj_demo=1`) — no
 * real Supabase account needed, so every test here runs unconditionally, unlike auth.spec.ts's
 * account-dependent block. Demo mode auto-seeds a full job catalog, applications and Career DNA
 * synchronously on first client boot (src/store/StoreHydrator.tsx) and never gates behind onboarding
 * (Gate's redirect only fires for mode === "user"), so these tests go straight from demo entry to
 * real product screens with no setup step of their own.
 */

test.describe("Golden journey — demo entry", () => {
  test("GJ-001 a real click on a demo link (not a prefetch) enters demo mode and reaches the app", async ({ page }) => {
    await page.goto("/");
    // A plain <a href="/demo"> (not the Button-as-Link CTAs elsewhere on the page) forces a real full-page
    // navigation, so this is unambiguously a genuine click, not Next.js's Link-prefetch side effect that
    // WJ-102 found and fixed in GET /demo.
    await page.getByRole("link", { name: "Try it in the demo" }).click();
    await page.waitForURL(/\/app$/, { timeout: 20_000 });
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === "wj_demo" && c.value === "1")).toBe(true);
  });
});

test.describe("Golden journey — jobs (demo mode)", () => {
  test.beforeEach(async ({ page }) => {
    // Enter demo mode directly rather than repeating the landing-page click in every test — GJ-001 above
    // already covers that the real click path itself works.
    await page.goto("/demo?next=/app/jobs");
  });

  test("GJ-002 the jobs list is pre-seeded and a job opens into its detail page", async ({ page }) => {
    await expect(page).toHaveURL(/\/app\/jobs/);
    const results = page.getByRole("list", { name: "Job results" });
    await expect(results).toBeVisible();
    expect(await results.getByRole("listitem").count()).toBeGreaterThan(10);

    await page.goto("/app/jobs/job_google_pm");
    await expect(page.getByRole("heading", { name: "Product Manager", level: 1 })).toBeVisible();
  });

  test("GJ-003 a job's detail page explains the match and its save state can be toggled", async ({ page }) => {
    await page.goto("/app/jobs/job_google_pm");
    // job_google_pm is pre-saved in the demo seed (services/mock/demo.ts).
    const saveBtn = page.getByRole("button", { name: /^(Save|Saved)$/ });
    await expect(saveBtn).toHaveText("Saved");

    await page.getByRole("tab", { name: /Why it's a match/i }).click();
    await expect(page.getByText(/Run Wonder to compute a match/i)).toHaveCount(0); // demo pre-computes matches for the whole catalog

    await saveBtn.click();
    await expect(saveBtn).toHaveText("Save");
    await saveBtn.click();
    await expect(saveBtn).toHaveText("Saved"); // restore seed state so other tests aren't affected
  });

  test("GJ-004 marking a job not for me records a reason and can be undone", async ({ page }) => {
    // job_microsoft_spm isn't part of the pre-saved/rejected seed set, so this test's state change is isolated.
    await page.goto("/app/jobs/job_microsoft_spm");
    await page.getByRole("button", { name: "Not for me" }).click();

    const reasons = page.getByRole("group", { name: "Reason not for me" });
    await expect(reasons).toBeVisible();
    await reasons.getByRole("button", { name: "Wrong industry" }).click();

    const undoBtn = page.getByRole("button", { name: "Undo not for me" });
    await expect(undoBtn).toBeVisible();
    await expect(undoBtn).toHaveAttribute("aria-pressed", "true");

    await undoBtn.click();
    await expect(page.getByRole("button", { name: "Not for me" })).toBeVisible();
  });
});

test.describe("Golden journey — applications (demo mode)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/demo?next=/app/applications");
  });

  test("GJ-005 the applications dashboard defaults to a timeline, pre-seeded across every stage, with the tab/list view still available", async ({ page }) => {
    await expect(page).toHaveURL(/\/app\/applications/);
    // Default view: a real pipeline (Preparing/Applied/Interview/Outcome), not a tab-switching list.
    await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Preparing" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Interview" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Application status" })).not.toBeVisible();
    // Switching to List brings back the tab-based view for power users.
    await page.getByRole("radio", { name: "List" }).click();
    await expect(page.getByRole("tablist", { name: "Application status" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^All/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Interview/ })).toBeVisible();
  });

  test("GJ-006 a submitted application opens into its real timeline, not the prepare flow", async ({ page }) => {
    // app_google is status "submitted" — routes to the detail/timeline page, unlike a "saved"/"preparing"
    // application, which ApplicationCard instead routes into /prepare (see docs/TEST_EXECUTION_REPORT.md).
    await page.goto("/app/applications/app_google");
    await expect(page).toHaveURL(/\/app\/applications\/app_google$/);
    await expect(page.locator("#main").getByRole("link", { name: "Applications" })).toBeVisible(); // PageHeader back link, distinct from the sidebar nav's own "Applications" link
    await expect(page.getByRole("heading", { name: "Product Manager · Google" })).toBeVisible();
  });
});

test.describe("Golden journey — run Wonder (demo mode)", () => {
  test("GJ-007 starting a run lands on that run's own timeline page", async ({ page }) => {
    await page.goto("/demo?next=/app/runs/new");
    await expect(page).toHaveURL(/\/app\/runs\/new/);

    const continueBtn = page.getByRole("button", { name: "Continue" });
    // A demo seed run may already be "active" (services/mock/runs.ts), which disables this page's own
    // submit button and offers "Open active run" instead — either outcome proves runs are real and
    // reachable, so this test follows whichever the seed actually produced rather than assuming one.
    // The target pattern excludes "new" itself: `[^/]+` alone would also match the page we start on,
    // resolving `waitForURL` instantly without ever waiting for the real navigation the click triggers.
    const runPageUrl = /\/app\/runs\/(?!new$)[^/]+$/;
    if (await continueBtn.isEnabled().catch(() => false)) {
      await continueBtn.click();
    } else {
      await page.getByRole("link", { name: "Open active run" }).click();
    }
    await page.waitForURL(runPageUrl, { timeout: 20_000 });
    expect(page.url()).toMatch(runPageUrl);
  });
});

test.describe("Golden journey — mobile navigation drawer (demo mode)", () => {
  // Forced regardless of the running project's own device preset, so this exercises the actual
  // mobile layout (hamburger + bottom bar) even under the desktop "chromium" project.
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/demo?next=/app");
  });

  test("GJ-008 the hamburger opens the full nav drawer, and navigating closes it", async ({ page }) => {
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeHidden();

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(drawer).toBeVisible();
    // The drawer carries every menu the desktop Sidebar does, not just the bottom bar's 4 shortcuts.
    await expect(drawer.getByRole("link", { name: "Calendar" })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Career DNA" })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Automation Settings" })).toBeVisible();

    await drawer.getByRole("link", { name: "Insights" }).click();
    await page.waitForURL(/\/app\/insights/);
    await expect(drawer).toBeHidden();
  });

  test("GJ-009 the bottom bar's More tab opens the same drawer", async ({ page }) => {
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await page.getByRole("button", { name: "More" }).click();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Resume Studio" })).toBeVisible();
  });

  test("GJ-010 the drawer is closed by default and the bottom bar has no separate Profile tab", async ({ page }) => {
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
    // Profile moved out of the bottom bar (More replaced it) — it's still one tap away via the avatar menu.
    const bottomBar = page.locator("nav.fixed.inset-x-0.bottom-0");
    await expect(bottomBar.getByRole("link", { name: "Profile" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Profile menu" })).toBeVisible();
  });
});
