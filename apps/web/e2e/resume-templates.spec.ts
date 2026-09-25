import { test, expect, type Page } from "@playwright/test";

/**
 * Résumé template gallery journeys RESUME-TPL-001…030 (spec §54) and visual baselines (§52, §87).
 * Demo mode: the sample candidate has a synthetic work history, so every preview is the real
 * renderer drawing that candidate's facts. Chromium only (this sandbox's browser).
 */

const STUDIO = "/demo?next=/app/resume-studio";
const cards = (page: Page) => page.getByRole("list", { name: "Resume templates" }).getByRole("article");

async function open(page: Page) {
  await page.goto(STUDIO);
  await expect(page.getByRole("heading", { name: "Choose a resume template" })).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

/** Records every text the generation panel announces, so real stages can be asserted after they've passed. */
async function recordAnnouncements(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __seen: string[] };
    w.__seen = [];
    new MutationObserver(() => document.querySelectorAll("[aria-live]").forEach((n) => w.__seen.push(n.textContent ?? ""))).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}
const announced = (page: Page) => page.evaluate(() => (window as unknown as { __seen: string[] }).__seen.join("\n"));

async function useTemplate(page: Page, name: string) {
  await page.getByRole("button", { name: `Use the ${name} template` }).click();
  await expect(page.getByRole("heading", { name: `${name} selected` })).toBeVisible();
}

async function generate(page: Page) {
  await page.getByRole("button", { name: /^(Generate resume|Generate again)$/ }).click();
  await expect(page.getByText(/^Résumé ready|isn't ready yet|needs attention/).first()).toBeVisible({ timeout: 20_000 });
}

/** Adds roles to the demo candidate's stored profile so the résumé runs to two pages. */
async function lengthenHistory(page: Page) {
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith("wj.career"))!;
    const s = JSON.parse(localStorage.getItem(key)!);
    const exp = s.state.dna.history.experience;
    for (let i = 0; i < 5; i++)
      exp.push({ id: `extra_${i}`, employer: `Sample Employer ${i + 1}`, title: "Product Manager", startDate: `${2012 - i * 2}-01`, endDate: `${2013 - i * 2}-12`, provenance: "USER_PROVIDED", bullets: Array.from({ length: 5 }, (_, j) => ({ id: `eb_${i}_${j}`, text: `Owned a product area end to end, working with engineering, design and analytics on the roadmap (${j + 1})`, provenance: "USER_PROVIDED" })) });
    localStorage.setItem(key, JSON.stringify(s));
  });
}

test.describe("Résumé templates", () => {
  test.beforeEach(async ({}, info) => {
    info.skip(info.project.name !== "chromium" && info.project.name !== "Mobile Chrome", "Chromium-only sandbox");
  });

  test("RESUME-TPL-001/002/003/004 the gallery shows eight templates and an explained recommendation", async ({ page }) => {
    await open(page);
    await expect(cards(page)).toHaveCount(8);
    await expect(cards(page).filter({ hasText: "Recommended" })).toHaveCount(1);
    await expect(page.getByText(/^Wonder recommends /)).toBeVisible();
    await expect(page.getByText("Recommended because:")).toBeVisible();
    // Each card's preview is the real renderer drawing the candidate's own name.
    await expect(cards(page).first().getByRole("img")).toContainText("Alex Morgan");
  });

  test("RESUME-TPL-005/006/007/008 filters narrow the gallery without a reload", async ({ page }) => {
    await open(page);
    const url = page.url();
    for (const [filter, n] of [["ATS Friendly", 8], ["Modern", 4], ["Executive", 2], ["Technical", 1]] as const) {
      await page.getByRole("group", { name: "Filter templates" }).getByRole("button", { name: filter, exact: true }).click();
      await expect(cards(page)).toHaveCount(n);
    }
    expect(page.url()).toBe(url);
  });

  test("RESUME-TPL-009/010 preview opens with the candidate's real data", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Preview the Executive template" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Executive template" })).toBeVisible();
    await expect(dialog.getByRole("img")).toContainText("Alex Morgan");
    await expect(dialog.getByRole("img")).toContainText("Northwind Payments (sample)");
  });

  test("RESUME-TPL-011/012/030 a selected template persists across a refresh", async ({ page }) => {
    await open(page);
    await useTemplate(page, "Leadership");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Leadership selected" })).toBeVisible({ timeout: 20_000 });
    // The "Selected" badge — not the words "Selected Achievements" inside a thumbnail.
    await expect(cards(page).filter({ has: page.getByText("Selected", { exact: true }) }).getByRole("heading")).toHaveText("Leadership");
  });

  test("RESUME-TPL-013/014/015/016 generation shows its real stages; changing template keeps the content", async ({ page }) => {
    await open(page);
    await useTemplate(page, "Executive");
    await recordAnnouncements(page);
    await generate(page);
    expect(await announced(page)).toMatch(/Rendering Executive template/);
    const viewer = page.getByTestId("resume-viewer");
    await expect(viewer.getByRole("img")).toContainText("Northwind Payments (sample)");
    await page.getByRole("button", { name: "Use the Modern Minimal template" }).click();
    await expect(page.getByRole("dialog")).toContainText("Your content will remain unchanged");
    await page.getByRole("button", { name: "Change template" }).click();
    await generate(page);
    await expect(page.getByTestId("resume-viewer").getByRole("img")).toContainText("Northwind Payments (sample)");
    await expect(page.getByTestId("resume-viewer").getByRole("img")).toContainText("ALEX MORGAN");
  });

  test("RESUME-TPL-017/018 page navigation and zoom", async ({ page }) => {
    await open(page);
    await lengthenHistory(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Choose a resume template" })).toBeVisible({ timeout: 20_000 });
    await useTemplate(page, "Classic ATS");
    await generate(page);
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
    const before = await page.getByTestId("resume-viewer").locator("svg").boundingBox();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.getByText("125%")).toBeVisible();
    const after = await page.getByTestId("resume-viewer").locator("svg").boundingBox();
    expect(after!.width).toBeGreaterThan(before!.width * 1.2);
    await noHorizontalScroll(page);
  });

  test("RESUME-TPL-019/020/021 PDF and DOCX download, and the résumé reopens from My resumes", async ({ page }) => {
    await open(page);
    await useTemplate(page, "Technical");
    await generate(page);
    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
    expect(pdf.suggestedFilename()).toMatch(/^Alex_Morgan_Resume_Technical\.pdf$/);
    const pdfBytes = await (await pdf.createReadStream()).toArray();
    expect(Buffer.concat(pdfBytes).subarray(0, 5).toString()).toBe("%PDF-");
    const [docx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download DOCX" }).click()]);
    expect(docx.suggestedFilename()).toMatch(/\.docx$/);
    expect(Buffer.concat(await (await docx.createReadStream()).toArray()).subarray(0, 2).toString()).toBe("PK");
    await page.getByRole("tab", { name: "My resumes" }).click();
    const saved = page.getByRole("listitem").filter({ hasText: "Technical" }).first();
    await expect(saved).toContainText("v1");
    await saved.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("dialog").getByRole("img")).toContainText("ALEX MORGAN");
  });

  test("RESUME-TPL-022/023/024 mobile gallery and preview, no horizontal overflow", async ({ page }, info) => {
    info.skip(info.project.name !== "Mobile Chrome", "mobile project only");
    await open(page);
    await expect(cards(page).first()).toBeVisible();
    await noHorizontalScroll(page);
    await page.getByRole("button", { name: "Preview the Creative Modern template" }).click();
    await expect(page.getByRole("dialog").getByRole("img")).toBeVisible();
    await noHorizontalScroll(page);
  });

  test("RESUME-TPL-025/026 keyboard and screen-reader labels", async ({ page }) => {
    await open(page);
    const ats = page.getByRole("group", { name: "Filter templates" }).getByRole("button", { name: "Technical", exact: true });
    await ats.focus();
    await page.keyboard.press("Enter");
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByRole("article", { name: /Technical template.*ATS friendly/ })).toBeVisible();
    await expect(page.getByRole("img", { name: "Technical template preview" })).toBeVisible();
  });

  test("RESUME-TPL-027 generation works with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await useTemplate(page, "Career Shift");
    await generate(page);
    await expect(page.getByText(/^Résumé ready/)).toBeVisible();
  });

  test("RESUME-TPL-028/029 a résumé that can't be validated is never offered for download; retry re-runs", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.endsWith("wj.career"))!;
      const s = JSON.parse(localStorage.getItem(key)!);
      s.state.dna.history.experience = [];
      localStorage.setItem(key, JSON.stringify(s));
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Choose a resume template" })).toBeVisible({ timeout: 20_000 });
    await useTemplate(page, "Executive");
    await generate(page);
    const alert = page.getByRole("alert").filter({ hasText: "isn't ready yet" });
    await expect(alert).toContainText("No work history yet");
    await expect(alert).toContainText("Your Career Profile is safe");
    await expect(page.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    await recordAnnouncements(page);
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(alert).toContainText("No work history yet");
    expect(await announced(page)).toMatch(/Selecting your experience/);
  });
});

test.describe("Résumé template visual baselines", () => {
  test.beforeEach(async ({}, info) => {
    info.skip(info.project.name !== "chromium", "baselines are per browser; Chromium only here");
  });
  for (const name of ["Executive", "Modern Minimal", "Technical", "Classic ATS", "Leadership", "Career Shift", "Academic / Research", "Creative Modern"]) {
    test(`visual: ${name} page 1`, async ({ page }) => {
      // Tall enough that the viewer shows the whole A4 page, so the baseline is the full page.
      await page.setViewportSize({ width: 1280, height: 1500 });
      await open(page);
      await page.getByRole("button", { name: `Preview the ${name} template` }).click();
      const svg = page.getByRole("dialog").getByTestId("resume-viewer").locator("svg");
      await expect(svg).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(svg).toHaveScreenshot(`${name.replace(/[^A-Za-z]+/g, "-").toLowerCase()}.png`, { maxDiffPixelRatio: 0.01 });
    });
  }
  test("visual: gallery (desktop)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page);
    await expect(page.getByRole("list", { name: "Resume templates" })).toHaveScreenshot("gallery.png", { maxDiffPixelRatio: 0.02 });
  });
});
