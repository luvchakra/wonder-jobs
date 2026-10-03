import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * Outcome-based UX journeys (outcome spec §48): Find → Decide → Apply → Progress, plus Ask Wonder,
 * scheduled searches, "See how Wonder worked" and 390px mobile. All in demo mode, so every test runs
 * without a real account; each test gets a fresh browser context and therefore a fresh demo seed.
 *
 * These assert what the candidate sees *and* that it agrees with the underlying state — e.g. the
 * result summary's strong count matches the engine's own summary under "See how Wonder worked" — so a
 * pass means the outcome view is telling the truth, not only that it renders.
 */

const RUN_URL = /\/app\/runs\/(?!new$)[^/?]+$/;

/** Sample sources answer slowly enough that a search is still running when a test pauses, stops or watches it. */
async function slowSampleSources(page: Page) {
  await page.addInitScript(() => localStorage.setItem("wj.demoSourceLatencyMs", "700"));
}

/** Starts a search for the candidate's words (as Ask Wonder's “Find …” does): it lands on the job list; the run's own page is one tap away ("Details"). */
async function startFind(page: Page, request: string, opts: { openRun?: boolean } = { openRun: true }) {
  await slowSampleSources(page);
  await page.goto(`/demo?next=${encodeURIComponent(`/app/jobs?search=${request}`)}`);
  await page.waitForURL(/\/app$/, { timeout: 20_000 });
  if (opts.openRun) {
    await page.locator("#main").getByRole("link", { name: "Details" }).first().click();
    await page.waitForURL(RUN_URL, { timeout: 20_000 });
  }
  return page.locator("section[aria-labelledby='run-experience-title']");
}

const title = (card: Locator) => card.locator("#run-experience-title");

/** Answers each "Wonder needs your input" with Continue until the search reaches its result. */
async function driveToResult(card: Locator) {
  await expect(async () => {
    const t = await title(card).innerText();
    if (/needs your input/i.test(t)) await card.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(card.getByRole("link", { name: /Strong opportunities/ })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
}

const num = async (l: Locator) => Number((await l.innerText()).match(/[\d,]+/)![0].replace(/,/g, ""));
/** A headline number under "See how Wonder worked" (the value sits just above its label). */
const statFor = (page: Page, label: string) => page.locator("#how-wonder-worked-panel").getByText(label, { exact: true }).locator("xpath=preceding-sibling::p");

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

async function askWonder(page: Page, text: string) {
  const input = page.getByRole("combobox", { name: "Command" });
  // The trigger renders before the client has hydrated; retry until the click actually opens it.
  await expect(async () => {
    await page.getByRole("button", { name: "Ask Wonder anything (Command+K)" }).click();
    await expect(input).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await input.fill(text);
  return page.locator("#wj-cmd-list [role='option']").first();
}

test.describe("FIND", () => {
  test("FIND-001 signed in, the first screen is the job list — ranked, with what it searched", async ({ page }) => {
    await page.goto("/demo?next=/app/career-dna");
    await expect(page.getByRole("heading", { name: "Career Profile", level: 1 })).toBeVisible();
    await page.goto("/app");
    // No button between the candidate and the jobs.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/jobs for you/);
    await expect(page.getByRole("list", { name: "Job results" }).locator(":scope > li").first()).toBeVisible();
    await expect(page.locator("#main")).toContainText(/Searched \d+ sources? for “/);
    // Old links into the job list keep their filter.
    await page.goto("/app/jobs?fit=strong");
    await expect(page).toHaveURL(/\/app\?fit=strong/);
    await expect(page.getByRole("list", { name: "Job results" }).locator(":scope > li").first()).toBeVisible();
  });

  test("FIND-002 the search box: typing narrows the jobs here; one tap searches every source, reading place from the words", async ({ page }) => {
    await slowSampleSources(page);
    await page.goto("/demo?next=/app");
    const box = page.getByRole("textbox", { name: "Search jobs" });
    await box.fill("Senior product roles in Mumbai, preferably fintech");
    // Before anything runs, Wonder says what it read from the words.
    const wider = page.getByRole("button", { name: /^Search every source for “senior product[^”]*” in Mumbai/i });
    await expect(wider).toBeVisible();
    await wider.click();
    await expect(page.locator("#main").getByRole("status").first()).toContainText(/for “senior product/i);
    await expect(page.locator("#main")).toContainText(/Searched \d+ sources? for “senior product[^”]*” in Mumbai/i, { timeout: 45_000 });
  });

  test("FIND-003 real progress → completion → result summary that matches the engine", async ({ page }) => {
    const card = await startFind(page, "Product manager roles in Bengaluru");
    await expect(title(card)).toHaveText(/Wonder is (finding opportunities|getting ready)/);
    // Steps tick off while the search runs — each only once all of its stages actually finished.
    await expect(card.locator("li", { hasText: "— done" }).first()).toBeVisible({ timeout: 20_000 });
    await driveToResult(card);
    const strong = await num(card.getByRole("link", { name: /Strong opportunities/ }));
    await page.getByRole("button", { name: /See how Wonder worked/ }).click();
    // The shortlist is capped, so it can hold at most every strong fit the breakdown counts.
    expect(await num(statFor(page, "Strong on the shortlist"))).toBeLessThanOrEqual(strong);
  });

  test("FIND-004 stop keeps everything already found", async ({ page }) => {
    const card = await startFind(page, "Product manager roles");
    await card.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(title(card)).toHaveText("Search stopped", { timeout: 15_000 });
    await expect(card).toContainText("Everything already found is still available.");
    await expect(card.getByRole("link", { name: "Search again" })).toBeVisible();
  });

  test("FIND-005 a search finds and ranks — it never prepares applications on its own", async ({ page }) => {
    const card = await startFind(page, "Product manager roles in Bengaluru");
    await driveToResult(card);
    await expect(title(card)).not.toHaveText(/needs your input/i);
    await page.getByRole("button", { name: /See how Wonder worked/ }).click();
    const panel = page.locator("#how-wonder-worked-panel");
    await expect(panel).toContainText("Prioritizing opportunities");
    await expect(panel).not.toContainText("Preparing application materials");
  });
});

test.describe("DECIDE", () => {
  test("DECIDE-001 an opportunity says why Wonder surfaced it", async ({ page }) => {
    await page.goto("/demo?next=/app/jobs");
    const first = page.getByRole("list", { name: "Job results" }).locator(":scope > li").first();
    await expect(first.getByText("Why Wonder surfaced this")).toBeVisible();
    await page.goto("/app/jobs/job_google_pm?tab=why");
    await expect(page.getByRole("tab", { name: "Why it fits" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Why Wonder thinks this fits")).toBeVisible();
  });

  test("DECIDE-002 an opportunity shows its hiring-signal evidence", async ({ page }) => {
    await page.goto("/demo?next=/app/jobs/job_google_pm");
    await page.getByRole("tab", { name: "Sources & signals" }).click();
    await expect(page.getByRole("heading", { name: "Hiring signals" })).toBeVisible();
    await expect(page.getByText(/Signals are observations, not claims/)).toBeVisible();
  });

  test("DECIDE-003 a filtered job explains why and offers Show it anyway", async ({ page }) => {
    await page.goto("/demo?next=/app/jobs/job_microsoft_spm");
    await page.getByRole("button", { name: "Not for me" }).click();
    await page.getByRole("group", { name: "Reason not for me" }).getByRole("button", { name: "Wrong industry" }).click();
    await page.reload();
    await expect(page.getByText("Not in your main results right now.")).toBeVisible();
    await page.getByRole("button", { name: "Show it anyway" }).click();
    await expect(page.getByText("Not in your main results right now.")).toHaveCount(0);
  });

  test("DECIDE-004 compare two opportunities — differences, never a winner", async ({ page }) => {
    await page.goto("/demo?next=/app");
    // Compare is a mode under Refine — the cards carry only Save, Not for me and Prepare until it's on.
    await expect(page.getByRole("checkbox", { name: /^Compare / })).toHaveCount(0);
    await page.getByRole("button", { name: /^Refine/ }).click();
    await page.getByRole("button", { name: "Compare jobs" }).click();
    const boxes = page.getByRole("checkbox", { name: /^Compare / });
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page.getByRole("region", { name: "Compare opportunities" }).getByRole("button", { name: "Compare", exact: true }).click();
    await page.waitForURL(/\/app\/jobs\/compare\?ids=/);
    await expect(page.getByRole("heading", { name: "Compare opportunities" })).toBeVisible();
    await expect(page.getByRole("table").getByRole("columnheader")).toHaveCount(3);
    await expect(page.getByText(/\b(winner|best choice|you should pick)\b/i)).toHaveCount(0);
  });

  test("DECIDE-005 save an opportunity", async ({ page }) => {
    await page.goto("/demo?next=/app/jobs/job_microsoft_spm");
    const save = page.getByRole("button", { name: /^(Save|Saved)$/ });
    await expect(save).toHaveText("Save");
    await save.click();
    await expect(save).toHaveText("Saved");
    await page.reload();
    await expect(page.getByRole("button", { name: /^(Save|Saved)$/ })).toHaveText("Saved");
  });

  test("DECIDE-006 not-for-me only becomes a learned preference once the evidence is real, and it persists", async ({ page }) => {
    await page.goto("/demo?next=/app/jobs");
    const links = page.getByRole("list", { name: "Job results" }).locator("h3 a");
    await expect(links.nth(2)).toBeVisible();
    const hrefs = await links.evaluateAll((as) => as.slice(0, 3).map((a) => a.getAttribute("href")!));
    expect(hrefs).toHaveLength(3);
    for (const [i, href] of hrefs.entries()) {
      await page.goto(href);
      await page.getByRole("button", { name: "Not for me" }).click();
      await page.getByRole("group", { name: "Reason not for me" }).getByRole("button", { name: "Too senior" }).click();
      await page.goto("/app/career-dna");
      // Two same-reason rejections are noise; the third is a pattern worth suggesting.
      await expect(page.getByText("Rank more senior roles lower")).toHaveCount(i < 2 ? 0 : 1);
    }
    await page.reload();
    await expect(page.getByText("Rank more senior roles lower")).toBeVisible();
    await expect(page.getByText(/Marked 3 roles "not for me — too senior"/)).toBeVisible();
  });
});

test.describe("APPLY", () => {
  test("APPLY-001 prepare an Application Pack from an opportunity", async ({ page }) => {
    await page.goto("/demo?next=/app/jobs/job_microsoft_spm");
    await page.getByRole("button", { name: /^(Prepare application|Open application pack)$/ }).first().click();
    await page.waitForURL(/\/prepare$/);
    const summary = page.locator("#wj-pack-summary");
    await expect(summary).toHaveText(/Nothing prepared yet|of 3 materials ready/);
    await page.getByRole("button", { name: "Generate resume" }).click();
    await expect(summary).toHaveText(/of 3 materials ready/, { timeout: 10_000 });
    await expect(page.getByText("AI-generated draft")).toBeVisible();
  });

  test("APPLY-002 editing generated material records the candidate as its author", async ({ page }) => {
    await page.goto("/demo?next=/app/applications/app_razorpay/prepare");
    const editor = page.locator("[contenteditable='true']").first();
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Edited by the candidate.");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[aria-labelledby='wj-pack-summary']").getByText("Edited by you")).toBeVisible();
  });

  test("APPLY-003 review the application before the hand-off", async ({ page }) => {
    await page.goto("/demo?next=/app/applications/app_razorpay/prepare");
    await expect(page.locator("#wj-pack-summary")).toHaveText("Application ready");
    await page.getByRole("button", { name: "Review and continue" }).click();
    const handoff = page.getByRole("button", { name: "Continue to Employer" });
    await expect(handoff).toBeDisabled();
    await page.getByRole("checkbox", { name: /I've reviewed these materials/ }).check();
    await expect(handoff).toBeEnabled();
  });

  test("APPLY-004 the employer hand-off stays candidate-controlled — nothing is marked submitted", async ({ page, context }) => {
    await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.fulfill({ status: 200, body: "employer page" }));
    await page.goto("/demo?next=/app/applications/app_razorpay/prepare");
    await expect(page.getByText("The final action is yours.")).toBeVisible();
    await page.getByRole("button", { name: "Review and continue" }).click();
    await page.getByRole("checkbox", { name: /I've reviewed these materials/ }).check();
    const popup = context.waitForEvent("page");
    await page.getByRole("button", { name: "Continue to Employer" }).click();
    await (await popup).close();
    await page.waitForURL(/\/app\/applications\/app_razorpay$/);
    // Opening the employer's page isn't submitting: only the candidate's own later click records that.
    await expect(page.getByRole("button", { name: "Mark as submitted" })).toBeVisible();
  });
});

test.describe("PROGRESS", () => {
  test("PROGRESS-001 an application's timeline", async ({ page }) => {
    await page.goto("/demo?next=/app/applications/app_google");
    await expect(page.getByRole("heading", { name: "Product Manager · Google" })).toBeVisible();
    await expect(page.getByText("Submitted").first()).toBeVisible();
  });

  test("PROGRESS-002 what needs the candidate in their applications is one line above the jobs, counted from real applications", async ({ page }) => {
    await page.goto("/demo?next=/app");
    const line = page.locator("#main").getByRole("link", { name: /coming up|due|ready for your review|repl/ }).first();
    await expect(line).toBeVisible();
    await line.click();
    await expect(page).toHaveURL(/\/app\/applications$/);
  });
});

test.describe("WONDER", () => {
  test("WONDER-001 a natural-language intent leads to the right action", async ({ page }) => {
    await page.goto("/demo?next=/app");
    const top = await askWonder(page, "Show my application progress");
    await expect(top).toContainText("applications active");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app\/applications$/);
    await expect(page.getByRole("dialog", { name: "Ask Wonder" })).toBeHidden();
  });

  test("WONDER-002 “Find me IAM jobs” starts a search with only the candidate's words", async ({ page }) => {
    await page.goto("/demo?next=/app");
    await expect(await askWonder(page, "Find me IAM jobs")).toContainText("Find opportunities: “IAM jobs”");
    await page.keyboard.press("Enter");
    // Straight to the jobs, searching every source for the candidate's words — and saying so.
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator("#main")).toContainText(/for “iam/i, { timeout: 20_000 });
  });

  test("WONDER-003 “Search again with Director roles”", async ({ page }) => {
    await page.goto("/demo?next=/app");
    await askWonder(page, "Search again with Director roles");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator("#main")).toContainText(/for “director/i, { timeout: 20_000 });
  });

  test("WONDER-004 “Why didn't you show this?” explains a real filtering decision", async ({ page }) => {
    await page.goto("/demo?next=/app/jobs/job_razorpay_spm");
    await page.getByRole("button", { name: "Not for me" }).click();
    await page.getByRole("group", { name: "Reason not for me" }).getByRole("button", { name: "Wrong industry" }).click();
    const top = await askWonder(page, "Why didn't you show the Senior Product Manager, Platform role?");
    await expect(top).toContainText("Hidden because it's");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app\/jobs\/job_razorpay_spm$/);
    await expect(page.getByRole("button", { name: "Show it anyway" })).toBeVisible();
  });

  test("WONDER-005 “What should I focus on today?”", async ({ page }) => {
    await page.goto("/demo?next=/app/jobs");
    await expect(await askWonder(page, "What should I focus on today?")).toContainText(/^Today: .*need/);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app$/);
  });
});

test.describe("AUTOMATION", () => {
  async function createKeepWatch(page: Page, what: string) {
    await page.goto("/demo?next=/app/automation/scheduled/new");
    await expect(page.getByRole("heading", { name: "Keep Wonder looking", level: 1 })).toBeVisible();
    await page.locator("#sched-request").fill(what);
    await page.getByRole("radiogroup", { name: "How often should Wonder look?" }).getByRole("radio", { name: /Keep watch/ }).click();
    await page.getByRole("button", { name: "Start looking" }).click();
    await page.waitForURL(/\/app\/automation\/scheduled$/);
    return page.locator("li", { hasText: `Keep watch — ${what.toLowerCase().replace(/ roles$/, "")}` }).first();
  }

  test("AUTOMATION-001 a scheduled search is created through the simple chooser", async ({ page }) => {
    const row = await createKeepWatch(page, "Designer roles");
    await expect(row).toContainText("Only if strong matches > 0");
    await page.goto("/app");
    await expect(page.locator("#main")).toContainText("checks again on schedule");
  });

  test("AUTOMATION-002 a scheduled search executes", async ({ page }) => {
    const row = await createKeepWatch(page, "Designer roles");
    await row.getByRole("button", { name: "Run now" }).click();
    await page.waitForURL(RUN_URL);
    await expect(page.getByText(/^Scheduled search ·/)).toBeVisible();
    await expect(page.locator("#run-experience-title")).not.toHaveText(/finding|getting ready/i, { timeout: 30_000 });
  });

  test("AUTOMATION-003 an unmet condition is a legitimate quiet outcome", async ({ page }) => {
    const row = await createKeepWatch(page, "Designer roles");
    await row.getByRole("button", { name: "Run now" }).click();
    await page.waitForURL(RUN_URL);
    const card = page.locator("section[aria-labelledby='run-experience-title']");
    await expect(card).toContainText("Quiet outcome: no strong match made the shortlist", { timeout: 30_000 });
    await page.goto("/app/automation/scheduled");
    await expect(page.locator("li", { hasText: "Keep watch — designer" }).first()).toContainText("quiet — nothing to report");
  });
});

test.describe("ADVANCED", () => {
  test("ADVANCED-001 “See how Wonder worked” opens the full technical detail", async ({ page }) => {
    const card = await startFind(page, "Product manager roles in Bengaluru");
    await driveToResult(card);
    const toggle = page.getByRole("button", { name: /See how Wonder worked/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator("#how-wonder-worked-panel");
    await expect(panel.getByText("Jobs discovered")).toBeVisible();
    await expect(panel.getByRole("list", { name: "Run log" })).toBeVisible();
  });

  test("ADVANCED-002 the technical detail agrees with the outcome view", async ({ page }) => {
    const card = await startFind(page, "Product manager roles in Bengaluru");
    await driveToResult(card);
    const strong = await num(card.getByRole("link", { name: /Strong opportunities/ }));
    const worth = await num(card.getByRole("link", { name: /Worth considering/ }));
    const other = await num(card.getByRole("link", { name: /Other results/ }));
    await page.getByRole("button", { name: /See how Wonder worked/ }).click();
    await expect(page.locator("#how-wonder-worked-panel")).toContainText("Searched “");
    const panel = page.locator("#how-wonder-worked-panel");
    // The breakdown partitions exactly the unique opportunities the engine kept…
    expect(await num(statFor(page, "Unique opportunities"))).toBe(strong + worth + other);
    // …its strong count is the matching step's own evidence…
    await panel.getByRole("button", { name: /Matching with your career goals/ }).click();
    const evidence = (label: string) => panel.locator("li", { hasText: label }).filter({ has: page.locator("span") }).last();
    expect(await num(evidence("Strong opportunities"))).toBe(strong);
    expect(await num(evidence("Worth considering"))).toBe(worth);
    // …and the capped shortlist can't hold more strong roles than were found.
    expect(await num(statFor(page, "Strong on the shortlist"))).toBeLessThanOrEqual(strong);
  });
});

test.describe("MOBILE (390px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("MOBILE-001 the primary journey at 390px: find → result → opportunity → pack", async ({ page }) => {
    const card = await startFind(page, "Product manager roles in Bengaluru");
    await expectNoHorizontalScroll(page);
    await driveToResult(card);
    await expectNoHorizontalScroll(page);
    await card.getByRole("link", { name: /Strong opportunities/ }).click();
    await page.waitForURL(/\/app(\/jobs)?\?fit=strong/);
    await expectNoHorizontalScroll(page);
    await page.getByRole("list", { name: "Job results" }).locator("h3 a").first().click();
    await page.waitForURL(/\/app\/jobs\/[^/?]+$/);
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: /^(Prepare application|Open application pack)$/ }).first().click();
    await page.waitForURL(/\/prepare$/);
    await expect(page.locator("#wj-pack-summary")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("MOBILE-002 at 390px the first screen is the job list, and a search's progress is one line", async ({ page }) => {
    await startFind(page, "Product manager roles in Bengaluru", { openRun: false });
    await expect(page.locator("#main").getByRole("status").first()).toContainText(/for “product manager/i);
    await expectNoHorizontalScroll(page);
    await expect(page.getByRole("list", { name: "Job results" }).locator(":scope > li").first()).toBeVisible();
    await expect(page.locator("#main")).toContainText(/Searched \d+ sources? for “product manager/i, { timeout: 45_000 });
    await expectNoHorizontalScroll(page);
  });

  test("MOBILE-003 the Application Pack at 390px", async ({ page }) => {
    await page.goto("/demo?next=/app/applications/app_razorpay/prepare");
    await expect(page.locator("#wj-pack-summary")).toHaveText("Application ready");
    await expect(page.getByText("The final action is yours.")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: "Review and continue" }).click();
    await expect(page.getByRole("button", { name: "Continue to Employer" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
