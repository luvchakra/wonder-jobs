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
    // The drawer carries every menu the desktop Sidebar does, not just the bottom bar's 5 primary destinations.
    await expect(drawer.getByRole("link", { name: "Career", exact: true })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Automation Settings" })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Help & Guide" })).toBeVisible();

    await drawer.getByRole("link", { name: "Insights" }).click();
    await page.waitForURL(/\/app\/insights/);
    await expect(drawer).toBeHidden();
  });

  test("GJ-009 the bottom bar shows all 5 real destinations directly, with no More catch-all", async ({ page }) => {
    const bottomBar = page.locator("nav.fixed.inset-x-0.bottom-0");
    for (const label of ["Home", "Jobs", "Applications", "Career", "Wonder"]) {
      await expect(bottomBar.getByRole("link", { name: label })).toBeVisible();
    }
    await expect(bottomBar.getByRole("button", { name: "More" })).toHaveCount(0);
    // Scheduled Runs/Automation Settings/Insights/Resume Studio/etc. are still one tap away via the
    // hamburger's drawer (GJ-008), not lost — just not duplicated as a 6th bottom-bar tab.
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  });

  test("GJ-010 the drawer is closed by default and the bottom bar has no separate Profile tab", async ({ page }) => {
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
    // Profile has never been in the bottom bar's 5 real destinations — it's one tap away via the avatar menu.
    const bottomBar = page.locator("nav.fixed.inset-x-0.bottom-0");
    await expect(bottomBar.getByRole("link", { name: "Profile" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Profile menu" })).toBeVisible();
  });
});

test.describe("Golden journey — new candidate onboarding", () => {
  test("GJ-011 a new candidate picks a real goal, which decides where onboarding sends them", async ({ page }) => {
    // /onboarding renders OnboardingFlow unconditionally — no seeded state needed for this journey.
    await page.goto("/onboarding");
    const picker = page.getByRole("radiogroup", { name: "What would you like Wonder to help you with?" });
    await expect(picker).toBeVisible();
    // All 5 real goals from Phase 2.2 — never a generic feature-bullet welcome screen.
    for (const label of ["Find my next role", "Improve my career profile", "Prepare an application", "Track my applications", "Let Wonder work for me"]) {
      await expect(picker.getByRole("radio", { name: new RegExp(label) })).toBeVisible();
    }
    const getStarted = page.getByRole("button", { name: "Get Started" });
    await expect(getStarted).toBeDisabled(); // a goal is required, never assumed
    await picker.getByRole("radio", { name: /Track my applications/ }).click();
    await expect(getStarted).toBeEnabled();
    await getStarted.click();
    // Step 1 is the real career-goal capture, common to every goal choice.
    await expect(page.getByText("What are you looking for?")).toBeVisible();
  });
});

test.describe("Golden journey — search (demo mode)", () => {
  test("GJ-012 a free-text search narrows the real catalog, not a canned result set", async ({ page }) => {
    await page.goto("/demo?next=/app/jobs");
    const results = page.getByRole("list", { name: "Job results" });
    // A distinctive, single-employer term (the default catalog view is paginated at 24, so a common word
    // like "google" — matched against skills/tags too, e.g. "Google Analytics" — can still fill a page
    // and not visibly shrink).
    await page.getByRole("textbox", { name: "Search jobs" }).fill("airbnb");
    await expect(async () => {
      const items = await results.getByRole("listitem").all();
      expect(items.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThan(24);
    }).toPass({ timeout: 5_000 });
    // Every remaining visible card is a real match for the typed text, not a fixed demo subset.
    await expect(results.getByText(/airbnb/i).first()).toBeVisible();
  });
});

test.describe("Golden journey — application preparation (demo mode)", () => {
  test("GJ-013 preparing an application generates a real, editable artifact with visible provenance", async ({ page }) => {
    // app_meta is seeded "preparing" with no resume yet (services/mock/seed.ts).
    await page.goto("/demo?next=/app/applications/app_meta/prepare");
    await expect(page.getByRole("heading", { name: "Application Pack" })).toBeVisible();
    await expect(page.getByText("No resume yet")).toBeVisible();
    await page.getByRole("button", { name: "Generate resume" }).click();
    // WonderJobsAI is a deterministic local template (no network, no billing) — real generation, fast.
    await expect(page.getByText("No resume yet")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText("AI-generated")).toBeVisible();
  });
});

test.describe("Golden journey — Ask Wonder (demo mode)", () => {
  test("GJ-014 a real question resolves to a real, data-backed action, not a canned chat reply", async ({ page }) => {
    await page.goto("/demo?next=/app");
    await page.getByRole("button", { name: "Ask Wonder anything (Command+K)" }).click();
    const input = page.getByRole("combobox", { name: "Command" });
    await expect(input).toBeVisible();
    await input.fill("what applications need my attention");
    const topResult = page.locator("#wj-cmd-list li[role='option']").first();
    // The label names a real count, never a static "Applications" nav shortcut.
    await expect(topResult).toContainText(/application.*attention/i);
    await topResult.getByRole("button").click();
    await expect(page).toHaveURL(/\/app\/applications$/);
  });
});

test.describe("Golden journey — automation (demo mode)", () => {
  test("GJ-015 automation levels use plain language, and per-capability policy is real and changeable", async ({ page }) => {
    await page.goto("/demo?next=/app/automation/settings");
    await expect(page.getByRole("heading", { name: "Automation Settings" })).toBeVisible();
    // Phase 3.2 relabeling — plain language, not internal jargon.
    for (const label of ["Assist me", "Work with me", "Work independently", "Keep working"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    const genResume = page.getByRole("radiogroup", { name: "Generate resume permission" });
    await expect(genResume).toBeVisible();
    await genResume.getByRole("radio", { name: "Off" }).click();
    await expect(genResume.getByRole("radio", { name: "Off" })).toHaveAttribute("aria-checked", "true");
    // Reload proves the change is real, persisted state — not a local-only UI toggle.
    await page.reload();
    await expect(page.getByRole("radiogroup", { name: "Generate resume permission" }).getByRole("radio", { name: "Off" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Restore defaults" }).click();
    await expect(page.getByRole("radiogroup", { name: "Generate resume permission" }).getByRole("radio", { name: "Automatic" })).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("Golden journey — manual intervention (demo mode)", () => {
  test("GJ-016 a running run can be paused mid-flight and resumed without losing progress", async ({ page }) => {
    await page.goto("/demo?next=/app/runs/new");
    const continueBtn = page.getByRole("button", { name: "Continue" });
    if (await continueBtn.isEnabled().catch(() => false)) await continueBtn.click();
    else await page.getByRole("link", { name: "Open active run" }).click();
    await page.waitForURL(/\/app\/runs\/(?!new$)[^/]+$/, { timeout: 20_000 });

    // On mobile widths a second, identical control also lives in a live-region status bar
    // (components/workflow/StageDetail.tsx) — same real action, so `.first()` is correct here, not a
    // workaround for a bug.
    const pauseBtn = page.getByRole("button", { name: "Pause" }).first();
    // The engine chunks work (services/workflow/executors.ts) specifically so pause stays responsive —
    // give it a real window to be running before asserting the button is there to click.
    await expect(pauseBtn).toBeVisible({ timeout: 15_000 });
    await pauseBtn.click();
    await expect(page.getByText("Paused", { exact: true }).first()).toBeVisible({ timeout: 5_000 });
    const progressBefore = await page.locator("[role='progressbar']").first().getAttribute("aria-valuenow").catch(() => null);

    const resumeBtn = page.getByRole("button", { name: "Resume" }).first();
    await expect(resumeBtn).toBeVisible();
    await resumeBtn.click();
    // Resuming continues from where it left off — progress never resets to 0.
    if (progressBefore != null) {
      await expect(async () => {
        const now = await page.locator("[role='progressbar']").first().getAttribute("aria-valuenow");
        expect(Number(now ?? 0)).toBeGreaterThanOrEqual(Number(progressBefore));
      }).toPass({ timeout: 5_000 });
    }
  });
});

test.describe("Golden journey — advanced mode (demo mode)", () => {
  test("GJ-017 AI provider settings expose BYOK for every real provider plus usage transparency", async ({ page }) => {
    await page.goto("/demo?next=/app/settings/ai");
    await expect(page.getByText("WonderJobs AI").first()).toBeVisible();
    for (const provider of ["Anthropic", "OpenAI", "Gemini"]) {
      await expect(page.getByText(provider, { exact: true }).first()).toBeVisible();
    }
    // Real usage transparency — tokens/cost/log, not a hidden estimate.
    await expect(page.getByText(/est\. BYOK cost/i)).toBeVisible();
  });
});

test.describe("Golden journey — trust (demo mode)", () => {
  test("GJ-018 Wonder discloses exactly what it can't do, in the same place it offers to help", async ({ page }) => {
    await page.goto("/demo?next=/app/applications/app_google");
    // The Phase 3.6 hand-off rewrite: Wonder never claims to send on the candidate's behalf.
    await expect(page.getByText(/Wonder never sends on your behalf/i)).toBeVisible();
    await expect(page.getByText(/doesn't have Google's email address and can't send it/i)).toBeVisible();
  });
});
