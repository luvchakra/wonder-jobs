#!/usr/bin/env node
/**
 * A cheap look at one screen, for checking a UI change without a full screenshot.
 *
 *   node scripts/ui-check.mjs <path> [--width 412] [--select "<css>"] [--click "<role>:<name>"]... [--shot out.jpg]
 *
 * Opens <path> on a running dev server (WJ_URL, default http://localhost:3123) in demo mode, applies each
 * --click in order (role and accessible name, e.g. "button:Refine" or "radio:Part Time"), then prints, for
 * every element matching --select, its text and box (x, y, width, height) as one line each. Text is what to
 * read first: it costs a few hundred tokens where a phone screenshot costs thousands. --shot also saves a
 * JPEG at 1x (a quarter of the pixels of a 2x shot), clipped to the matched elements when there are any.
 */
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("--")) ?? "/app/jobs";
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const all = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));
const base = process.env.WJ_URL ?? "http://localhost:3123";
const width = Number(opt("width", "412"));

// The project's Playwright may not match the browser installed on the machine; use the installed one when there is one.
const executablePath = process.env.WJ_CHROMIUM ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
await page.goto(`${base}/demo?next=${encodeURIComponent(path)}`, { timeout: 120_000 });
await page.waitForURL((u) => u.pathname === path.split("?")[0], { timeout: 120_000 });
await page.waitForLoadState("networkidle").catch(() => {});
for (const c of all("click")) {
  const [role, ...name] = c.split(":");
  await page.getByRole(role, { name: name.join(":") }).first().click();
  await page.waitForTimeout(400);
}
const select = opt("select");
let clip;
if (select) {
  const boxes = await page.locator(select).evaluateAll((els) =>
    els.slice(0, 40).map((e) => {
      const r = e.getBoundingClientRect();
      return { text: (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80), x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) };
    }),
  );
  for (const b of boxes) console.log(`${b.x},${b.y} ${b.w}x${b.h}  ${b.text}`);
  if (boxes.length) {
    const top = Math.min(...boxes.map((b) => b.y));
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    clip = { x: 0, y: Math.max(0, top - 8), width, height: Math.min(1400, bottom - top + 16) };
  }
}
const shot = opt("shot");
if (shot) {
  await page.screenshot({ path: shot, type: "jpeg", quality: 60, fullPage: !!clip, ...(clip ? { clip } : {}) });
  console.log(`saved ${shot}`);
}
await browser.close();
