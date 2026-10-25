import type { Page } from "@playwright/test";

/** Full Time / Part Time: the round menu in the top bar, beside the avatar. */
export async function pickKind(page: Page, label: "Full Time Jobs" | "Part Time Jobs") {
  await page.getByRole("button", { name: /^Kind of jobs/ }).click();
  await page.getByRole("menuitemradio", { name: label }).click();
}
