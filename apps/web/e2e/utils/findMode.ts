import { expect, type Page } from "@playwright/test";

type Kind = "Full Time Jobs" | "Part Time Jobs";

/** From 1024px the sidebar lists the modules; below that they are a menu in the middle of the top bar. */
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Modules" });
const menu = (page: Page) => page.getByRole("button", { name: /^Module: / });

/** Full Time / Part Time: the sidebar's Modules list on a computer, the top bar's Module menu on a phone or tablet. */
export async function pickKind(page: Page, label: Kind) {
  const inSidebar = sidebar(page).getByRole("button", { name: label, exact: true });
  await expect(inSidebar.or(menu(page)).first()).toBeVisible({ timeout: 20_000 });
  if (await inSidebar.isVisible()) return inSidebar.click();
  await menu(page).click();
  await page.getByRole("menuitemradio", { name: label }).click();
}

/** The kind in use, wherever this width shows it. */
export async function expectKind(page: Page, label: Kind) {
  const inSidebar = sidebar(page).getByRole("button", { name: label, exact: true });
  await expect(inSidebar.or(menu(page)).first()).toBeVisible({ timeout: 20_000 });
  if (await inSidebar.isVisible()) await expect(inSidebar).toHaveAttribute("aria-current", "true");
  else await expect(menu(page)).toHaveAccessibleName(`Module: ${label}`);
}
