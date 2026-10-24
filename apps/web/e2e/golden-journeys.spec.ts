import { test, expect } from "@playwright/test";
import { openDescription } from "./utils/jobPage";

/**
 * Golden-journey coverage for the core candidate experience, entirely in demo mode (`wj_demo=1`) — no
 * real Supabase account needed, so every test here runs unconditionally, unlike auth.spec.ts's
 * account-dependent block. Demo mode auto-seeds a full job catalog, applications and Career DNA
 * synchronously on first client boot (src/store/StoreHydrator.tsx) and never gates behind onboarding
 * (Gate's redirect only fires for mode === "user"), so these tests go straight from demo entry to
 * real product screens with no setup step of their own.
 */

test.describe("Golden journey — demo entry", () => {
  test("GJ-001 opening /demo (where the deployment enables it) enters demo mode and reaches the job list", async ({ page }) => {
    // The public landing page no longer links to the demo (WJ-188); it is reachable only where
    // WJ_DEMO_ENABLED=1, which this suite's web server sets.
    await page.goto("/demo");
    await page.waitForURL(/\/app\/jobs$/, { timeout: 20_000 });
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

    // "Why it fits" is a folded section above the description.
    await page.getByText("Why it fits", { exact: true }).click();
    await expect(page.getByText(/hasn't compared this role/i)).toHaveCount(0); // demo pre-computes matches for the whole catalog

    await saveBtn.click();
    await expect(saveBtn).toHaveText("Save");
    await saveBtn.click();
    await expect(saveBtn).toHaveText("Saved"); // restore seed state so other tests aren't affected
  });

  test("GJ-004 marking a job not for me records a reason and can be undone", async ({ page }) => {
    // job_microsoft_spm isn't part of the pre-saved/rejected seed set, so this test's state change is isolated.
    await page.goto("/app/jobs/job_microsoft_spm");
    await openDescription(page);
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
    // The stages are one row of counts; one stage's applications show at a time. Saved jobs aren't here (they're in Saved).
    const stages = page.getByRole("tablist", { name: "Applications by stage" });
    await stages.getByRole("tab", { name: /Interview/ }).click();
    await expect(stages.getByRole("tab", { name: /Interview/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("list", { name: "Interview" }).or(page.getByText("Nothing in Interview yet."))).toBeVisible();
    await expect(page.locator("#main").getByText("Saved", { exact: true })).toHaveCount(0);
    // Needs attention is the Tasks page now, not under the pipeline.
    await expect(page.getByRole("heading", { name: "Needs attention" })).toHaveCount(0);
    await expect(page.getByRole("tablist", { name: "Application status" })).not.toBeVisible();
    // A status deep link (?tab=…) opens the tab-based list.
    await page.goto("/app/applications?tab=all");
    await expect(page.getByRole("tablist", { name: "Application status" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^All/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Interview/ })).toBeVisible();
  });

  test("GJ-020b Save on the Career Profile opened from Find goes back to Find and searches the role as written, even a level alone", async ({ page }) => {
    await page.goto("/app/career-dna?from=find&focus=role");
    await page.locator("#goal").fill("director");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/\/app\/jobs/);
    await expect(page.getByText(/Which director role\?/)).toHaveCount(0);
    await expect(page.locator("#main").getByText("director", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/(Searching for|For|for) “director”/).first()).toBeVisible({ timeout: 30_000 });
  });

  test("GJ-005b removing an application from the Pipeline puts its job back in Find, marked", async ({ page }) => {
    const stages = page.getByRole("tablist", { name: "Applications by stage" });
    await stages.getByRole("tab", { name: /Preparing/ }).click();
    const remove = page.getByRole("button", { name: /^Remove .+ from Pipeline$/ }).first();
    // The card's own job: its title, to find it again in Find.
    const title = (await remove.locator("xpath=..").locator("a span.line-clamp-2").innerText()).trim();
    const company = (await remove.locator("xpath=..").locator("a span.font-semibold").first().innerText()).trim();
    const before = Number((await stages.getByRole("tab", { name: /Preparing/ }).innerText()).match(/\d+/)![0]);
    await remove.click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click();
    await expect(stages.getByRole("tab", { name: /Preparing/ })).toContainText(String(before - 1));
    await page.getByRole("link", { name: "Find", exact: true }).first().click();
    await page.waitForURL(/\/app\/jobs$/);
    // Back in Find (old postings included, like saved ones), marked.
    const card = page.getByRole("list", { name: "Job results" }).locator(":scope > li").filter({ hasText: title }).filter({ hasText: company }).filter({ hasText: "Removed from Pipeline" });
    await expect(card.first()).toBeVisible({ timeout: 20_000 });
  });

  test("GJ-005c an interview card's Prepare opens that job's interview prep, built from the posting", async ({ page }) => {
    await page.getByRole("tablist", { name: "Applications by stage" }).getByRole("tab", { name: /Interview/ }).click();
    await page.getByRole("link", { name: /^Prepare/ }).first().click();
    await page.waitForURL(/\/app\/applications\/[^/]+\/interview$/);
    await expect(page.getByRole("heading", { name: "Lead with" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Practise these" })).toBeVisible();
    // The Interview Prep tab is gone; its old address opens the next interview's prep.
    await expect(page.getByRole("navigation", { name: "Pipeline" }).getByRole("link", { name: "Interview Prep" })).toHaveCount(0);
    await page.goto("/app/interview-prep");
    await page.waitForURL(/\/app\/applications\/[^/]+\/interview$/);
  });

  test("GJ-005d interview prep offers a timed test, a mock interview and flashcards, and practice trends in Insights", async ({ page }) => {
    test.setTimeout(120_000);
    await page.getByRole("tablist", { name: "Applications by stage" }).getByRole("tab", { name: /Interview/ }).click();
    await page.getByRole("link", { name: /^Prepare/ }).first().click();
    await page.waitForURL(/\/interview$/);
    const prep = page.url();
    // Test: ten questions, ten seconds each; a pass needs 90%. Demo mode shows a labelled sample.
    await page.getByRole("link", { name: /Practice test/ }).click();
    await page.getByRole("button", { name: "Start test" }).click();
    for (let i = 1; i <= 10; i++) {
      await expect(page.getByText(`Question ${i} of 10`)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("group", { name: "Options" }).getByRole("button").first().click();
    }
    await expect(page.getByText(/^(Pass|Fail)$/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Save score" }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();
    // Mock interview: answer, end, get a score kept with the application.
    await page.goto(`${prep}/mock`);
    await page.getByRole("button", { name: "Start interview" }).click();
    await page.getByRole("textbox", { name: "Your answer" }).fill("I led a migration of our sign-in platform across five teams and cut incidents by forty percent over two quarters.");
    await page.getByRole("button", { name: "Send answer" }).click();
    await expect(page.getByRole("textbox", { name: "Your answer" })).toBeVisible();
    await page.getByRole("button", { name: "End interview" }).click();
    await expect(page.getByText("To improve")).toBeVisible({ timeout: 15_000 });
    // Flashcards: twenty, flip and sort.
    await page.goto(`${prep}/cards`);
    await page.getByRole("button", { name: "Make my cards" }).click();
    await expect(page.getByText("1 / 20")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Show the answer" }).click();
    await page.getByRole("button", { name: "Know it" }).click();
    await expect(page.getByText("1 of 20 known")).toBeVisible();
    // Insights trends what was kept.
    await page.goto("/app/insights");
    await expect(page.getByRole("heading", { name: "Interview practice" })).toBeVisible();
    await expect(page.getByText("Practice tests")).toBeVisible();
    await expect(page.getByText("Work on next", { exact: false })).toBeVisible();
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
    // Typed searches are Part Time's; Full Time is the Career Profile's own search.
    await page.getByRole("radio", { name: "Part Time" }).click();
    await page.getByRole("textbox", { name: "Search jobs" }).fill("product manager in Bengaluru");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/jobs$/);
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
    for (const label of ["Find", "Saved", "Pipeline", "You"]) {
      await expect(bottomBar.getByRole("link", { name: label })).toBeVisible();
    }
    await expect(bottomBar.getByRole("link")).toHaveCount(4);
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
    // Help, account and sign-out are in the avatar menu rather than a drawer.
    await page.getByRole("button", { name: "Profile menu" }).click();
    await expect(page.getByRole("menuitem", { name: "Get Help" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Account" }).first()).toBeVisible();
  });

  test("GJ-009 a place's own pages are tabs at its top; You lists every settings page as a row", async ({ page }) => {
    const bottomBar = page.locator("nav.fixed.inset-x-0.bottom-0");
    await bottomBar.getByRole("link", { name: "Pipeline" }).click();
    await page.waitForURL(/\/app\/applications$/);
    const tabs = page.getByRole("navigation", { name: "Pipeline" });
    await expect(tabs.getByRole("link", { name: "Applications" })).toHaveAttribute("aria-current", "page");
    await tabs.getByRole("link", { name: "Calendar" }).click();
    await page.waitForURL(/\/app\/calendar$/);
    await expect(bottomBar.getByRole("link", { name: "Pipeline" })).toHaveAttribute("aria-current", "page");

    await bottomBar.getByRole("link", { name: "You" }).click();
    await page.waitForURL(/\/app\/you$/);
    // The name card at the top is the Career Profile's entry; account, plan and data live in the avatar menu (WJ-281).
    await expect(page.getByRole("link", { name: /Career Profile$/ })).toBeVisible();
    for (const label of ["Career Profile", "Job sources", "Automation", "Search history"]) {
      await expect(page.getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
    }
    await page.getByRole("link", { name: /^Automation/ }).click();
    await page.waitForURL(/\/app\/automation\/settings$/);
    await expect(page.getByRole("heading", { name: "Scheduled searches" })).toBeVisible();
    await expect(bottomBar.getByRole("link", { name: "You" })).toHaveAttribute("aria-current", "page");
  });
});

test.describe("Golden journey — new candidate onboarding", () => {
  test("GJ-011 a new candidate without a CV types the role and lands on jobs", async ({ page }) => {
    // A fresh browser in local mode (no demo cookie): nothing is seeded, so no role is prefilled.
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "Add your CV, see your jobs" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Upload CV/ })).toBeVisible();
    await page.getByRole("button", { name: "No CV handy? Type it in" }).click();
    const show = page.getByRole("button", { name: "Show my jobs" });
    // Local mode seeds the sample profile, so clear what it prefilled: with no role, nothing is assumed.
    await page.getByLabel("Role you want").fill("");
    await expect(show).toBeDisabled(); // a role is required, never assumed
    await page.getByLabel("Role you want").fill("data analyst");
    await expect(show).toBeEnabled();
    await show.click();
    await page.waitForURL(/\/app(\/jobs)?$/, { timeout: 20_000 });
  });
});

test.describe("Golden journey — search (demo mode)", () => {
  test("GJ-012 a free-text search narrows the real catalog, not a canned result set", async ({ page }) => {
    await page.goto("/demo?next=/app/jobs");
    const results = page.getByRole("list", { name: "Job results" });
    // A distinctive, single-employer term (the default catalog view is paginated at 24, so a common word
    // like "google" — matched against skills/tags too, e.g. "Google Analytics" — can still fill a page
    // and not visibly shrink).
    // Typing alone changes nothing; Search applies the words.
    await page.getByRole("radio", { name: "Part Time" }).click();
    await page.getByRole("textbox", { name: "Search jobs" }).fill("designer");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.locator("#main").getByText(/^Showing \d+ jobs? for “designer”/)).toBeVisible({ timeout: 20_000 });
    // Every visible card is a real match for the typed text, not a fixed demo subset.
    // (Top-level results only: each card carries its own "why" lists, which are list items too.)
    const items = await results.locator(":scope > li").all();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) await expect(item).toContainText(/design/i);
  });

  test("GJ-021 Saved's box filters the saved jobs as you type — no source search, no Search button, no Refine", async ({ page }) => {
    await page.goto("/demo?next=/app/jobs");
    const cards = page.getByRole("list", { name: "Job results" }).locator(":scope > li");
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });
    // Save two jobs from different companies.
    const companies: string[] = [];
    for (let i = 0; companies.length < 2 && i < 12; i++) {
      const card = cards.nth(i);
      // The company is the card's first link.
      const company = (await card.getByRole("link").first().innerText()).trim();
      if (!company || companies.includes(company)) continue;
      await card.getByRole("button", { name: "Save job" }).click();
      companies.push(company);
    }
    expect(companies).toHaveLength(2);
    let searches = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/jobs-lake/v1/search")) searches++;
    });
    await page.goto("/app/saved");
    const box = page.getByRole("textbox", { name: "Filter saved jobs" });
    await expect(box).toBeVisible();
    // A plain text box: no second, browser-drawn ×.
    expect(await box.getAttribute("type")).not.toBe("search");
    const saved = page.getByRole("list", { name: "Job results" }).locator(":scope > li");
    // The demo account comes with saved jobs of its own; these two are among them.
    await expect(saved.first()).toBeVisible();
    const all = await saved.count();
    expect(all).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole("button", { name: "Search", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Refine/ })).toHaveCount(0);
    // Typing narrows the list, nothing to press, and no source is searched.
    await box.fill(companies[0]);
    await expect(async () => {
      const n = await saved.count();
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(all);
    }).toPass({ timeout: 5_000 });
    for (const card of await saved.all()) await expect(card).toContainText(companies[0]);
    // The start of a word is enough, as it's typed ("int" → "Interactive").
    const start = companies[0].slice(0, 3);
    await box.fill(start);
    await expect(async () => expect(await saved.count()).toBeGreaterThan(0)).toPass({ timeout: 5_000 });
    // Enter (the arrow) keeps the words in Saved's history: shown on focus, × removes them.
    await box.fill(companies[0]);
    await page.getByRole("button", { name: "Enter", exact: true }).click();
    await box.fill("");
    await box.focus();
    const recent = page.getByRole("list", { name: "Recent searches" });
    await expect(recent.getByRole("button", { name: companies[0], exact: true })).toBeVisible();
    await recent.getByRole("button", { name: `Remove “${companies[0]}” from recent searches` }).click();
    await expect(recent).toHaveCount(0);
    await box.fill("zzzz-no-such-job");
    await expect(page.getByText(/No saved job matches “zzzz-no-such-job”/)).toBeVisible();
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(saved).toHaveCount(all);
    expect(searches).toBe(0);
    // Find's own words aren't touched by Saved's filter.
    await page.goto("/app/jobs");
    await page.getByRole("radio", { name: "Part Time" }).click();
    await expect(page.getByRole("textbox", { name: "Search jobs" })).toHaveValue("");
  });

  test("GJ-022 Stop ends a search and brings back the list as it was before it started", async ({ page }) => {
    // Slow sources, so the search is still running when Stop is pressed.
    await page.addInitScript(() => localStorage.setItem("wj.demoSourceLatencyMs", "4000"));
    await page.goto("/demo?next=/app/jobs");
    const main = page.locator("#main");
    const summary = main.getByText(/^Showing \S+ jobs? (for|from) /);
    await expect(summary).toBeVisible({ timeout: 20_000 });
    const before = await summary.innerText();
    await page.getByRole("radio", { name: "Part Time" }).click();
    await page.getByRole("radio", { name: "Full Time" }).click();
    await page.getByRole("button", { name: "Search based on Career Profile" }).click();
    const stop = main.getByRole("button", { name: "Stop", exact: true });
    await expect(stop).toBeVisible({ timeout: 10_000 });
    await stop.click();
    await expect(stop).toHaveCount(0, { timeout: 10_000 });
    await expect(summary).toHaveText(before);
  });

  test("GJ-024 a running search's banner says what it's for in full, with Details and Stop", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem("wj.demoSourceLatencyMs", "4000"));
    await page.goto("/demo?next=/app/jobs");
    await page.getByRole("radio", { name: "Part Time" }).click();
    await page.getByRole("textbox", { name: "Search jobs" }).fill("designer in Pune");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const banner = page.getByRole("status").filter({ hasText: "For “designer” in Pune" });
    await expect(banner).toBeVisible({ timeout: 10_000 });
    // In full: the words and the place aren't cut off.
    const forLine = banner.getByText("For “designer” in Pune", { exact: true });
    expect(await forLine.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(banner.getByRole("link", { name: "Details" })).toBeVisible();
    await banner.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(banner).toHaveCount(0, { timeout: 10_000 });
  });

  test("GJ-025 Search as: Full Time always has one picked; Part Time starts with none, and a pick fills the box", async ({ page }) => {
    await page.goto("/demo?next=/app/jobs");
    const main = page.locator("#main");
    const pressed = async () => (await main.getByRole("group", { name: "Search as" }).getByRole("button").evaluateAll((els) => els.filter((e) => e.getAttribute("aria-pressed") === "true").map((e) => e.textContent?.trim())));
    // Full Time always has one picked: tapping My profile again keeps it.
    await main.getByRole("button", { name: /^Refine/ }).click();
    expect(await pressed()).toEqual(["My profile"]);
    await main.getByRole("group", { name: "Search as" }).getByRole("button", { name: "My profile" }).click();
    expect(await pressed()).toEqual(["My profile"]);
    await main.getByRole("button", { name: "Back to jobs" }).click();
    // Part Time: none picked; a role puts its words in the box, tapping it again takes them out.
    await page.getByRole("radio", { name: "Part Time" }).click();
    await main.getByRole("button", { name: /^Refine/ }).click();
    expect(await pressed()).toEqual([]);
    const role = main.getByRole("group", { name: "Search as" }).getByRole("button").nth(1);
    const title = (await role.innerText()).trim();
    await role.click();
    expect(await pressed()).toEqual([title]);
    await expect(page.getByRole("textbox", { name: "Search jobs" })).toHaveValue(title);
    await role.click();
    expect(await pressed()).toEqual([]);
    await expect(page.getByRole("textbox", { name: "Search jobs" })).toHaveValue("");
  });

  test("GJ-026 on a phone the top bar, then the bottom bar, slide away on scrolling down and come back on scrolling up", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/demo?next=/app/jobs");
    await expect(page.getByRole("list", { name: "Job results" }).locator(":scope > li").first()).toBeVisible({ timeout: 20_000 });
    const top = page.locator("[data-top-bar]");
    const bottom = page.getByRole("navigation", { name: "Primary" });
    const topY = async () => (await top.boundingBox())!.y;
    const bottomY = async () => (await bottom.boundingBox())!.y;
    const shownBottom = await bottomY();
    // Start below the top of the page, then scroll down a little: the top bar goes first, the bottom stays.
    await page.mouse.move(195, 500);
    await page.mouse.wheel(0, 150);
    await expect.poll(topY, { timeout: 5_000 }).toBeLessThan(-40);
    await expect.poll(async () => Math.abs((await bottomY()) - shownBottom), { timeout: 5_000 }).toBeLessThan(2);
    // Further down: the bottom bar goes too.
    await page.mouse.wheel(0, 400);
    await expect.poll(bottomY, { timeout: 5_000 }).toBeGreaterThan(840);
    // Back up: both come back.
    await page.mouse.wheel(0, -400);
    await expect.poll(bottomY, { timeout: 5_000 }).toBeLessThan(shownBottom + 2);
    await expect.poll(topY, { timeout: 5_000 }).toBeGreaterThan(-2);
  });

  test("GJ-023 Full Time and Part Time each keep their own Refine settings, across a reload", async ({ page }) => {
    await page.goto("/demo?next=/app/jobs");
    const main = page.locator("#main");
    const kind = page.getByRole("radiogroup", { name: "Kind of work" });
    const refine = main.getByRole("button", { name: /^Refine/ });
    await expect(refine).toHaveAccessibleName("Refine");
    await refine.click();
    await main.getByLabel(/^Hide Pipeline/).check();
    await main.getByRole("button", { name: "Back to jobs" }).click();
    await expect(refine).toHaveAccessibleName("Refine, 1 set");
    // Part Time starts with nothing set; Full Time's setting comes back with it.
    await kind.getByRole("radio", { name: "Part Time" }).click();
    await expect(refine).toHaveAccessibleName("Refine");
    await kind.getByRole("radio", { name: "Full Time" }).click();
    await expect(refine).toHaveAccessibleName("Refine, 1 set");
    // Kept between visits, per mode.
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(kind.getByRole("radio", { name: "Full Time" })).toHaveAttribute("aria-checked", "true");
    await expect(refine).toHaveAccessibleName("Refine, 1 set");
    await kind.getByRole("radio", { name: "Part Time" }).click();
    await expect(refine).toHaveAccessibleName("Refine");
  });

  test("GJ-020 Full Time searches the Career Profile; Part Time searches typed words, by job type; the slider slides", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/demo?next=/app/jobs");
    const kind = page.getByRole("radiogroup", { name: "Kind of work" });
    const full = kind.getByRole("radio", { name: "Full Time" });
    const part = kind.getByRole("radio", { name: "Part Time" });
    await expect(full).toHaveAttribute("aria-checked", "true");
    // The slider spans the phone's width (inside the page's gutters).
    const box = (await kind.boundingBox())!;
    expect(box.width).toBeGreaterThan(330);

    // Full Time: Looking for with Change, then Refine · Work mode · Salary and the round search; no search box.
    // The views and job types are in Refine, not on the page.
    const main = page.locator("#main");
    await expect(main.getByText(/^Looking for/)).toBeVisible();
    await expect(main.getByRole("link", { name: "Edit Career Profile" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Search based on Career Profile" })).toBeVisible();
    // Change opens the Career Profile at Role you want, with Back to Find.
    await expect(main.getByRole("link", { name: "Change", exact: true })).toHaveAttribute("href", "/app/career-dna?from=find&focus=role");
    const views = async () => (await main.getByRole("button", { name: /^(All|Strong|For you)$/ }).allInnerTexts()).map((t) => t.trim());
    expect(await views()).toEqual([]);
    await expect(main.getByRole("button", { name: "Contract", exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Search jobs" })).toHaveCount(0);
    const refine = main.getByRole("button", { name: /^Refine/ });
    // Full Time's own job types, in Refine; Internship and Gig are Part Time's.
    await refine.click();
    expect(await views()).toEqual(["All", "Strong", "For you"]);
    for (const t of ["Permanent", "Contract", "Consultant", "Short-term"]) await expect(main.getByRole("button", { name: t, exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Internship", exact: true })).toHaveCount(0);
    // Refine has one action: Save (no Search).
    await expect(main.getByRole("button", { name: "Save", exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Search", exact: true })).toHaveCount(0);
    await main.getByRole("button", { name: "Save", exact: true }).click();
    // Work mode and Salary open Refine at their own section; what's picked there shows on the pill.
    await main.getByRole("button", { name: "Work mode: All modes" }).click();
    await expect(main.getByRole("group", { name: "Work mode" })).toBeFocused();
    await main.getByRole("group", { name: "Work mode" }).getByRole("button", { name: "Remote", exact: true }).click();
    await main.getByRole("button", { name: "Save", exact: true }).click();
    await expect(main.getByRole("button", { name: "Work mode: Remote" })).toBeVisible();
    await main.getByRole("button", { name: "Salary: Any salary" }).click();
    await expect(main.getByRole("group", { name: "Salary" })).toBeFocused();
    await main.getByRole("group", { name: "Salary" }).getByRole("button", { name: "₹20L+", exact: true }).click();
    await main.getByRole("button", { name: "Save", exact: true }).click();
    await expect(main.getByRole("button", { name: "Salary: ₹20L+" })).toBeVisible();
    // Back as they were, so the list below is the whole one.
    await main.getByRole("button", { name: "Work mode: Remote" }).click();
    await main.getByRole("group", { name: "Work mode" }).getByRole("button", { name: "Remote", exact: true }).click();
    await main.getByRole("group", { name: "Salary" }).getByRole("button", { name: "Any", exact: true }).click();
    await main.getByRole("button", { name: "Save", exact: true }).click();
    // Opening Refine at a section scrolled to it: back to the top, where the slider is.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    // Where Refine and the search button sit: switching modes mustn't move them.
    const rows = async () => Promise.all([refine, main.locator("form").getByRole("button", { name: /^Search/ }).first()].map(async (l) => Math.round((await l.boundingBox())!.y)));
    const fullRows = await rows();

    // Slide the thumb across to Part Time.
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 6 });
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(part).toHaveAttribute("aria-checked", "true");
    for (const [i, y] of (await rows()).entries()) expect(Math.abs(y - fullRows[i])).toBeLessThanOrEqual(1);

    // Part Time: the box with Refine on its right, and Search; no Looking for. In Refine: its job types
    // (Consultant, not Full-time or Part-time) and All · Strong · For you.
    await expect(page.getByRole("textbox", { name: "Search jobs" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
    await expect(main.getByText(/^Looking for/)).toHaveCount(0);
    await refine.click();
    for (const t of ["Contract", "Consultant", "Internship", "Short-term", "Gig"]) await expect(main.getByRole("button", { name: t, exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Permanent", exact: true })).toHaveCount(0);
    for (const t of ["Full-time", "Part-time"]) await expect(main.getByRole("button", { name: t, exact: true })).toHaveCount(0);
    expect(await views()).toEqual(["All", "Strong", "For you"]);
    // Part Time's Refine has nothing from the Career Profile's role: no Looking for.
    await expect(main.getByText(/^Looking for/)).toHaveCount(0);
    await main.getByLabel(/^Hide Pipeline/).check();
    await expect(main.getByRole("button", { name: /^Refine, \d+ set/ })).toBeVisible();
    await main.getByLabel(/^Hide Pipeline/).uncheck();
    await main.getByRole("button", { name: "Save", exact: true }).click();
    // Search searches only the typed words: with none, it asks for them.
    await main.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Part Time searches only your words" })).toBeVisible();

    // Part Time has its own results: a prompt before its first search, then that search's jobs —
    // and switching modes swaps each one's results back, without searching again.
    await expect(main.getByRole("heading", { name: "Search for part-time work" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Job results" })).toHaveCount(0);
    // A search no source answers says so (it doesn't fall back to Full Time's jobs).
    await page.getByRole("textbox", { name: "Search jobs" }).fill("barista");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(main.getByRole("heading", { name: "Nothing found for “barista”" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("textbox", { name: "Search jobs" }).fill("designer");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const summary = main.getByText(/^Showing \S+ jobs? (for|from) /);
    await expect(summary).toContainText("“designer”", { timeout: 20_000 });
    await full.click();
    await expect(summary).not.toContainText("“designer”");
    await part.click();
    await expect(summary).toContainText("“designer”");
    // The last searches show under the box while it has focus, newest first; × removes one, a tap searches it again.
    const words = page.getByRole("textbox", { name: "Search jobs" });
    await words.fill("");
    await words.focus();
    const recent = main.getByRole("list", { name: "Recent searches" });
    expect((await recent.getByRole("listitem").allInnerTexts()).map((t) => t.trim())).toEqual(["designer", "barista"]);
    await recent.getByRole("button", { name: "Remove “barista” from recent searches" }).click();
    await expect(recent.getByRole("listitem")).toHaveCount(1);
    await recent.getByRole("button", { name: "designer", exact: true }).click();
    await expect(words).toHaveValue("designer");
    await expect(recent).toHaveCount(0);
    await expect(summary).toContainText("“designer”", { timeout: 20_000 });

    // Tap and the keyboard switch back too.
    await full.click();
    await expect(full).toHaveAttribute("aria-checked", "true");
    await full.focus();
    await page.keyboard.press("ArrowRight");
    await expect(part).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(full).toHaveAttribute("aria-checked", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe("Golden journey — application preparation (demo mode)", () => {
  test("GJ-013 preparing an application generates a real, editable artifact with visible provenance", async ({ page }) => {
    // app_meta is seeded "preparing" with no résumé drafted for it (services/mock/seed.ts). The résumé on
    // file is offered first (WJ-189); choosing to generate one for this role drafts a new one.
    await page.goto("/demo?next=/app/applications/app_meta/prepare");
    await expect(page.getByRole("heading", { name: "Application Pack" })).toBeVisible();
    const generateChoice = page.getByRole("radio", { name: /Generate a résumé for this role/ });
    await generateChoice.check();
    await page.getByRole("button", { name: "Generate résumé" }).click();
    // WonderJobsAI is a deterministic local template (no network, no billing) — real generation, fast.
    await expect(generateChoice).toHaveCount(0, { timeout: 10_000 });
    // Exact: the pack summary above also says "AI-generated draft" for the same version.
    await expect(page.getByText("AI-generated", { exact: true })).toBeVisible();
  });
});

test.describe("Golden journey — Ask Wonder (demo mode)", () => {
  test("GJ-014 a real question resolves to a real, data-backed action, not a canned chat reply", async ({ page }) => {
    await page.goto("/demo?next=/app");
    const input = page.getByRole("combobox", { name: "Command" });
    // The shortcut listener attaches when the page hydrates; under load a press can land before that,
    // so press again until the palette opens (the shortcut itself is what's under test).
    await expect(async () => {
      if (!(await input.isVisible())) await page.keyboard.press("ControlOrMeta+k");
      await expect(input).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
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
    await expect(page.getByRole("heading", { name: "Automation" })).toBeVisible();
    // Phase 3.2 relabeling — plain language, not internal jargon.
    // Two choices (owner decision, 2026-10-09): Help me folded into Work with me, Keep watch into Work independently.
    for (const label of ["Work with me", "Work independently"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    // Per-action rules are folded under "Change one action".
    await page.getByText("Change one action").click();
    const genResume = page.getByRole("radiogroup", { name: "Generate resume permission" });
    await expect(genResume).toBeVisible();
    await genResume.getByRole("radio", { name: "Off" }).click();
    await expect(genResume.getByRole("radio", { name: "Off" })).toHaveAttribute("aria-checked", "true");
    // Reload proves the change is real, persisted state — not a local-only UI toggle.
    await page.reload();
    await page.getByText("Change one action").click();
    await expect(page.getByRole("radiogroup", { name: "Generate resume permission" }).getByRole("radio", { name: "Off" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Restore defaults" }).click();
    // Drafts ask first by default (WJ-273).
    await expect(page.getByRole("radiogroup", { name: "Generate resume permission" }).getByRole("radio", { name: "Ask me" })).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("Golden journey — manual intervention (demo mode)", () => {
  test("GJ-016 a running search can be paused mid-flight and continued without losing progress", async ({ page }) => {
    // Sample sources answer slowly enough that the search is still running when it's paused.
    await page.addInitScript(() => localStorage.setItem("wj.demoSourceLatencyMs", "700"));
    await page.goto(`/demo?next=${encodeURIComponent("/app/jobs?search=product manager in Bengaluru")}`);
    await page.waitForURL(/\/app\/jobs$/, { timeout: 20_000 });
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
    // Continuing picks up where it left off — no step that was done goes back to not done. A fast
    // machine can finish the rest before this looks; the step list then gives way to the outcome.
    await expect(async () => {
      const finished = await page.getByText("Your search is ready").count();
      if (!finished) expect(await card.locator("li", { hasText: "— done" }).count()).toBeGreaterThanOrEqual(doneWhilePaused);
    }).toPass({ timeout: 5_000 });
  });
});

test.describe("Golden journey — advanced mode (demo mode)", () => {
  test("GJ-017 AI provider settings expose BYOK for every real provider plus usage transparency", async ({ page }) => {
    await page.goto("/demo?next=/app/settings/ai");
    await expect(page.getByText("WonderJobs AI").first()).toBeVisible();
    // Several providers and usage are folded until opened.
    await page.getByText("Advanced: models and several providers").click();
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
    // The Phase 3.6 hand-off rewrite: Wonder drafts; the candidate sends from their own email.
    await page.getByText("Draft a follow-up email").click();
    await expect(page.getByText(/you copy it into your own email and send it/i)).toBeVisible();
  });
});

test.describe("Golden journey — the phone keyboard (demo mode)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("GJ-019 Ask Wonder's box and a sheet's fields stay above the on-screen keyboard", async ({ page }) => {
    // Stand-in for the Android keyboard: the visual viewport shrinks, the layout viewport doesn't.
    await page.addInitScript(() => {
      const vv = new EventTarget();
      Object.assign(vv, { height: 844, width: 390, offsetTop: 0, offsetLeft: 0, scale: 1 });
      Object.defineProperty(window, "visualViewport", { get: () => vv });
      (window as unknown as { __kbd: (h: number) => void }).__kbd = (h) => {
        Object.assign(vv, { height: h });
        vv.dispatchEvent(new Event("resize"));
      };
    });
    await page.goto("/demo?next=/app/jobs");
    // The shortcut works once the app is interactive: a press during hydration is lost (and pressing again
    // would toggle it shut), so wait for the stores to hydrate and the top bar's listener to attach first.
    await page.waitForFunction(() => performance.getEntriesByName("wj:hydrated").length > 0);
    await expect(page.getByRole("link", { name: /^Tasks/ })).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByRole("combobox", { name: "Command" });
    await expect(input).toBeVisible();
    await page.evaluate(() => (window as unknown as { __kbd: (h: number) => void }).__kbd(430));
    const box = (await input.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(430);
    const dialog = (await page.locator("dialog[open]").boundingBox())!;
    expect(Math.round(dialog.width)).toBe(390);
    await page.keyboard.press("Escape");

    await page.goto("/app/applications");
    await page.getByRole("button", { name: "Add" }).click();
    await page.evaluate(() => (window as unknown as { __kbd: (h: number) => void }).__kbd(430));
    await expect(async () => {
      const sheet = (await page.locator("dialog[open]").boundingBox())!;
      expect(sheet.y + sheet.height).toBeLessThanOrEqual(431);
      expect(sheet.y).toBeGreaterThanOrEqual(0);
    }).toPass({ timeout: 3_000 });
  });
});
