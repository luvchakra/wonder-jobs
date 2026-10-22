import type { Page } from "@playwright/test";

/** The job page's sections (Why it fits, Sources & hiring signals…) and Not for me show once the whole description is open. */
export async function openDescription(page: Page) {
  await page.getByRole("heading", { name: "Job description" }).waitFor();
  const more = page.getByRole("button", { name: "More", exact: true });
  if (await more.count()) await more.click();
}
