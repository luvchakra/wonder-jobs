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
    expect(await results.locator(":scope > li").count()).toBeGreaterThan(10);

    await page.goto("/app/jobs/job_google_pm");
    await expect(page.getByRole("heading", { name: "Product Manager", level: 1 })).toBeVisible();
  });

  test("GJ-003 a job's detail page explains the match and its save state can be toggled", async ({ page }) => {
    await page.goto("/app/jobs/job_google_pm");
    // job_google_pm is pre-saved in the demo seed (services/mock/demo.ts).
    const saveBtn = page.getByRole("button", { name: /^(Save|Saved)$/ });
    await expect(saveBtn).toHaveText("Saved");

    await page.getByRole("tab", { name: /Why it fits/i }).click();
    await expect(page.getByText(/hasn't compared this role/i)).toHaveCount(0); // demo pre-computes matches for the whole catalog

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
  test("GJ-007 a search from the search box stays on the job list, with that search's own page one tap away", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("wj.demoSourceLatencyMs", "700"));
    await page.goto("/demo?next=/app");
    await page.getByRole("textbox", { name: "Search jobs" }).fill("product manager in Bengaluru");
    await page.getByRole("button", { name: /^Search every source for/ }).click();
    await expect(page).toHaveURL(/\/app$/);
    await page.locator("#main").getByRole("link", { name: "Details" }).first().click();
    await page.waitForURL(/\/app\/runs\/(?!new$)[^/]+$/, { timeout: 20_000 });
  });
});

test.describe("Golden journey — mobile navigation (demo mode)", () => {
  // Pin a phone viewport so this journey exercises the mobile layout (bottom bar, no sidebar) even under
  // the desktop "chromium" project.
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/demo?next=/app");
  });

  test("GJ-008 the bottom bar shows the four places directly, with no menu drawer or More catch-all", async ({ page }) => {
    const bottomBar = page.locator("nav.fixed.inset-x-0.bottom-0");
    for (const label of ["Find", "Saved", "Applied", "You"]) {
      await expect(bottomBar.getByRole("link", { name: label })).toBeVisible();
    }
    await expect(bottomBar.getByRole("link")).toHaveCount(4);
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
    // Help, account and sign-out are in the avatar menu rather than a drawer.
    await page.getByRole("button", { name: "Profile menu" }).click();
    await expect(page.getByRole("menuitem", { name: "Get Help" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Account" })).toBeVisible();
  });

  test("GJ-009 a place's own pages are tabs at its top; You lists every settings page as a row", async ({ page }) => {
    const bottomBar = page.locator("nav.fixed.inset-x-0.bottom-0");
    await bottomBar.getByRole("link", { name: "Applied" }).click();
    await page.waitForURL(/\/app\/applications$/);
    const tabs = page.getByRole("navigation", { name: "Applied" });
    await expect(tabs.getByRole("link", { name: "Applications" })).toHaveAttribute("aria-current", "page");
    await tabs.getByRole("link", { name: "Calendar" }).click();
    await page.waitForURL(/\/app\/calendar$/);
    await expect(bottomBar.getByRole("link", { name: "Applied" })).toHaveAttribute("aria-current", "page");

    await bottomBar.getByRole("link", { name: "You" }).click();
    await page.waitForURL(/\/app\/you$/);
    for (const label of ["Career Profile", "Job sources", "What Wonder can do", "Scheduled searches", "AI provider", "Account"]) {
      await expect(page.getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
    }
    await page.getByRole("link", { name: /^Scheduled searches/ }).click();
    await page.waitForURL(/\/app\/automation\/scheduled$/);
    await expect(bottomBar.getByRole("link", { name: "You" })).toHaveAttribute("aria-current", "page");
  });
});

test.describe("Golden journey — new candidate onboarding", () => {
  test("GJ-011 a new candidate without a CV types the role and lands on jobs", async ({ page }) => {
    // /onboarding renders OnboardingFlow unconditionally — no seeded state needed for this journey.
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "Add your CV, see your jobs" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Upload CV/ })).toBeVisible();
    await page.getByRole("button", { name: "No CV handy? Type it in" }).click();
    const show = page.getByRole("button", { name: "Show my jobs" });
    await expect(show).toBeDisabled(); // a role is required, never assumed
    await page.getByLabel("Role you want").fill("data analyst");
    await expect(show).toBeEnabled();
    await show.click();
    await page.waitForURL(/\/app$/, { timeout: 20_000 });
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
      // Top-level results only: each card now carries its own "why" lists, which are list items too.
      const items = await results.locator(":scope > li").all();
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
    // Exact: the pack summary above also says "AI-generated draft" for the same version.
    await expect(page.getByText("AI-generated", { exact: true })).toBeVisible();
  });
});

test.describe("Golden journey — Ask Wonder (demo mode)", () => {
  test("GJ-014 a real question resolves to a real, data-backed action, not a canned chat reply", async ({ page }) => {
    await page.goto("/demo?next=/app");
    await page.getByRole("button", { name: "Ask Wonder anything (Command+K)" }).click();
    const input = page.getByRole("combobox", { name: "Command" });
    await expect(input).toBeVisible();
    await input.fill("what applications need my attention");
    const topResult = page.locator("#wj-cmd-list [role='option']").first();
    // The label names a real count, never a static "Applications" nav shortcut.
    await expect(topResult).toContainText(/application.*attention/i);
    await topResult.click();
    await expect(page).toHaveURL(/\/app\/applications$/);
  });
});

test.describe("Golden journey — automation (demo mode)", () => {
  test("GJ-015 automation levels use plain language, and per-capability policy is real and changeable", async ({ page }) => {
    await page.goto("/demo?next=/app/automation/settings");
    await expect(page.getByRole("heading", { name: "What Wonder can do" })).toBeVisible();
    // Phase 3.2 relabeling — plain language, not internal jargon.
    for (const label of ["Help me", "Work with me", "Work independently", "Keep watch"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    // Per-action rules are folded under "Fine-tune each action".
    await page.getByText("Fine-tune each action").click();
    const genResume = page.getByRole("radiogroup", { name: "Generate resume permission" });
    await expect(genResume).toBeVisible();
    await genResume.getByRole("radio", { name: "Off" }).click();
    await expect(genResume.getByRole("radio", { name: "Off" })).toHaveAttribute("aria-checked", "true");
    // Reload proves the change is real, persisted state — not a local-only UI toggle.
    await page.reload();
    await page.getByText("Fine-tune each action").click();
    await expect(page.getByRole("radiogroup", { name: "Generate resume permission" }).getByRole("radio", { name: "Off" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Restore defaults" }).click();
    await expect(page.getByRole("radiogroup", { name: "Generate resume permission" }).getByRole("radio", { name: "Automatic" })).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("Golden journey — manual intervention (demo mode)", () => {
  test("GJ-016 a running search can be paused mid-flight and continued without losing progress", async ({ page }) => {
    // Sample sources answer slowly enough that the search is still running when it's paused.
    await page.addInitScript(() => localStorage.setItem("wj.demoSourceLatencyMs", "700"));
    await page.goto(`/demo?next=${encodeURIComponent("/app/jobs?search=product manager in Bengaluru")}`);
    await page.waitForURL(/\/app$/, { timeout: 20_000 });
    await page.locator("#main").getByRole("link", { name: "Details" }).first().click();
    await page.waitForURL(/\/app\/runs\/(?!new$)[^/]+$/, { timeout: 20_000 });

    // Pause/Continue live on the outcome card; the mobile status bar has its own labelled twin
    // ("Continue the search"), so scoping to the card keeps this one real control per action.
    const card = page.locator("section[aria-labelledby='run-experience-title']");
    const pauseBtn = card.getByRole("button", { name: "Pause", exact: true });
    // The engine chunks work (services/workflow/executors.ts) specifically so pause stays responsive.
    await expect(pauseBtn).toBeVisible({ timeout: 15_000 });
    await pauseBtn.click();
    await expect(card.getByRole("heading", { name: "Wonder is paused" })).toBeVisible({ timeout: 5_000 });
    const doneWhilePaused = await card.locator("li", { hasText: "— done" }).count();

    await card.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(card.getByRole("heading", { name: "Wonder is paused" })).toHaveCount(0);
    // Continuing picks up where it left off — no step that was done goes back to not done.
    await expect(async () => {
      expect(await card.locator("li", { hasText: "— done" }).count()).toBeGreaterThanOrEqual(doneWhilePaused);
    }).toPass({ timeout: 5_000 });
  });
});

test.describe("Golden journey — advanced mode (demo mode)", () => {
  test("GJ-017 AI provider settings expose BYOK for every real provider plus usage transparency", async ({ page }) => {
    await page.goto("/demo?next=/app/settings/ai");
    await expect(page.getByText("WonderJobs AI").first()).toBeVisible();
    // Your own key and usage are folded until opened.
    await page.getByText("Use your own API key").click();
    await page.getByText("Usage", { exact: true }).click();
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
