#!/usr/bin/env node
/**
 * A screenshot of one screen in the first or the second UI (domain/platform/ui.ts), for before/after checks.
 *
 *   node scripts/ui-shot.mjs <path> --ui 1|2 --out shot.png [--width 390] [--height 844] [--scale 2] [--full]
 *
 * Same server and sample candidate as scripts/ui-check.mjs. The UI is chosen with this browser's own preview key,
 * the way Admin → Settings → Look → This device does, so nothing on the server changes.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { chromium } from "playwright";

const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } });
const { openApp } = await jiti.import("../e2e/fixtures/sample.ts");
const { UI_PREVIEW_KEY } = await jiti.import("../src/domain/platform/ui.ts");

const args = process.argv.slice(2);
const path = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? "/app/jobs";
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const ui = opt("ui", "2") === "1" ? "1" : "2";
const out = opt("out", `ui${ui}.png`);
const executablePath = process.env.WJ_CHROMIUM ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ baseURL: process.env.WJ_URL ?? "http://localhost:3123", viewport: { width: Number(opt("width", "390")), height: Number(opt("height", "844")) }, deviceScaleFactor: Number(opt("scale", "2")) });
await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [UI_PREVIEW_KEY, ui]);
await openApp(page, path, { empty: args.includes("--empty") });
await page.waitForURL((u) => u.pathname === path.split("?")[0], { timeout: 120_000 });
await page.waitForLoadState("networkidle").catch(() => {});
// The dev server's own badge isn't part of the product.
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForTimeout(800);
console.log(`data-ui=${await page.evaluate(() => document.documentElement.getAttribute("data-ui"))} font=${await page.evaluate(() => getComputedStyle(document.body).fontFamily.split(",")[0])} bg=${await page.evaluate(() => getComputedStyle(document.body).backgroundColor)}`);
await page.screenshot({ path: out, fullPage: args.includes("--full") });
console.log(`saved ${out}`);
await browser.close();
