import { test, expect, devices, type Page } from "@playwright/test";

/**
 * Install banner (WJ-301). Chromium only: the banner's one-tap path is a Chromium event, and the other
 * engines aren't vendored here. A synthetic `beforeinstallprompt` with a stubbed `prompt()` stands in for
 * the browser's own; the iOS variant is checked by emulating an iPhone's user agent and touch screen.
 */

// `defaultBrowserType` can't be set inside a describe block; the rest of each descriptor can.
const { defaultBrowserType: _p, ...pixel } = devices["Pixel 7"];
const { defaultBrowserType: _i, ...iphone } = devices["iPhone 14"];
const { defaultBrowserType: _d, ...desktop } = devices["Desktop Chrome"];
void _p;
void _i;
void _d;

const banner = (page: Page) => page.getByRole("region", { name: "Install the WonderJobs app" });

/** Fires a fake `beforeinstallprompt` whose prompt resolves with `outcome`. */
async function offerInstall(page: Page, outcome: "accepted" | "dismissed") {
  await page.evaluate((outcome) => {
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    const w = window as unknown as { __prompted?: number };
    e.prompt = async () => {
      w.__prompted = (w.__prompted ?? 0) + 1;
    };
    e.userChoice = Promise.resolve({ outcome });
    window.dispatchEvent(e);
  }, outcome);
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("wonderjobs:install-banner") ?? "null") as { installed?: boolean; snoozedUntil?: number } | null);

test.describe("Install banner — Android phone (Chromium)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium-only event");
  test.use(pixel);

  test("IB-001 appears once the browser offers install; Install prompts and the banner goes for good", async ({ page }) => {
    await page.goto("/about");
    await offerInstall(page, "accepted");
    await expect(banner(page)).toBeVisible();
    await expect(banner(page).getByText("WonderJobs app")).toBeVisible();
    await banner(page).getByRole("button", { name: "Install" }).click();
    await expect(banner(page)).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { __prompted?: number }).__prompted)).toBe(1);
    expect((await stored(page))?.installed).toBe(true);

    // Installed is remembered: a fresh offer on the next visit shows nothing.
    await page.reload();
    await offerInstall(page, "accepted");
    await page.waitForTimeout(500);
    await expect(banner(page)).toHaveCount(0);
  });

  test("IB-002 declining the prompt, or closing the banner, snoozes it for 14 days", async ({ page }) => {
    await page.goto("/about");
    await offerInstall(page, "dismissed");
    await banner(page).getByRole("button", { name: "Install" }).click();
    await expect(banner(page)).toBeHidden();
    const day = 24 * 60 * 60 * 1000;
    const snooze = (await stored(page))?.snoozedUntil ?? 0;
    expect(snooze - Date.now()).toBeGreaterThan(13.9 * day);
    expect(snooze - Date.now()).toBeLessThan(14.1 * day);

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await offerInstall(page, "accepted");
    await banner(page).getByRole("button", { name: "Not now" }).click();
    await expect(banner(page)).toBeHidden();
    expect((await stored(page))?.snoozedUntil).toBeGreaterThan(Date.now());
  });

  test("IB-006 an install offer that arrives before the app has loaded is still caught", async ({ page }) => {
    // Fires as soon as the HTML is parsed — before React has hydrated — so only the early inline
    // listener in the root layout can catch it.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
        e.prompt = async () => {};
        e.userChoice = Promise.resolve({ outcome: "accepted" });
        window.dispatchEvent(e);
      });
    });
    await page.goto("/about");
    await expect(banner(page).getByRole("button", { name: "Install" })).toBeVisible();
  });

  test("IB-003 the banner pushes the landing page's fixed header down instead of covering it", async ({ page }) => {
    await page.goto("/");
    await offerInstall(page, "accepted");
    await expect(banner(page)).toBeVisible();
    // Let the grow-in animation settle, then the header must start where the banner ends.
    await page.waitForTimeout(700);
    const b = await banner(page).boundingBox();
    const header = await page.locator("header").first().boundingBox();
    expect(b && header).toBeTruthy();
    expect(Math.abs(header!.y - (b!.y + b!.height))).toBeLessThanOrEqual(1);
  });
});

test.describe("Install banner — iPhone", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Emulated in Chromium");
  test.use(iphone);

  test("IB-004 explains Share → Add to Home Screen, and 'I've added it' hides it for good", async ({ page }) => {
    await page.goto("/about");
    await expect(banner(page)).toBeVisible();
    const howTo = banner(page).getByRole("button", { name: "How to" });
    await expect(howTo).toHaveAttribute("aria-expanded", "false");
    await howTo.click();
    await expect(howTo).toHaveAttribute("aria-expanded", "true");
    await expect(banner(page).getByText("Add to Home Screen")).toBeVisible();
    await expect(banner(page).getByRole("img", { name: "Share" })).toBeVisible();
    await banner(page).getByRole("button", { name: "I've added it" }).click();
    await expect(banner(page)).toBeHidden();
    expect((await stored(page))?.installed).toBe(true);
  });
});

test.describe("Install banner — desktop", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium-only event");
  test.use(desktop);

  test("IB-005 never shows on desktop, even when the browser offers install", async ({ page }) => {
    await page.goto("/about");
    await offerInstall(page, "accepted");
    await page.waitForTimeout(500);
    await expect(banner(page)).toHaveCount(0);
  });
});
