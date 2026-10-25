import { test, expect } from "@playwright/test";
import { openApp } from "./fixtures/sample";

/**
 * Notification center (WJ-364): the bell's "Notification center" opens every notification, linking to Notifications;
 * Unread filters, Mark all read clears the count, and an item's action opens where it points.
 */
test.describe("Notification center", () => {
  test("opens from the bell, filters unread, marks all read and links to Notifications", async ({ page }) => {
    await openApp(page, "/app");
    await page.waitForURL(/\/app$/, { timeout: 20_000 });
    await page.getByRole("button", { name: /^Notifications, \d+ unread/ }).click();
    await page.getByRole("dialog", { name: "Notifications" }).getByRole("link", { name: "Notification center" }).click();
    await page.waitForURL(/\/app\/notifications$/);
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();

    const list = page.getByRole("list", { name: "Notifications" });
    await expect(list.getByRole("listitem").first()).toBeVisible();
    const show = page.getByRole("group", { name: "Show" });
    await show.getByRole("button", { name: /^Unread · \d+$/ }).click();
    // Reminders can arrive while the page is open: the list always matches the chip's live count.
    const unreadCount = async () => Number((await show.getByRole("button", { name: /^Unread/ }).innerText()).replace(/\D/g, ""));
    await expect.poll(async () => (await list.getByRole("listitem").count()) === (await unreadCount())).toBe(true);

    // Mark all read clears what's there; a reminder raised a moment later is new, so press it again until none is left.
    await expect(async () => {
      const mark = page.getByRole("button", { name: "Mark all read" });
      if (await mark.isVisible()) await mark.click();
      await expect(page.getByText("Nothing unread")).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    await expect(show.getByRole("button", { name: "Unread", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Notifications, \d+ unread/ })).toHaveCount(0);
    await show.getByRole("button", { name: "All" }).click();
    await expect(list.getByRole("listitem").first()).toBeVisible();

    // What you're told, and how, is one tap away on Notifications.
    await page.locator("#main").getByRole("link", { name: /Notification settings/ }).click();
    await page.waitForURL(/\/app\/settings\/notifications$/);
  });

  test("Profile menu → Notifications opens the settings page", async ({ page }) => {
    await openApp(page, "/app/profile");
    await page.waitForURL(/\/app\/profile$/, { timeout: 20_000 });
    await page.getByRole("button", { name: "Profile menu" }).click();
    await page.getByRole("menuitem", { name: "Notifications" }).click();
    await page.waitForURL(/\/app\/settings\/notifications$/);
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
  });
});
