#!/usr/bin/env node
/**
 * Workaround for a stale Vercel project setting: this project's dashboard
 * "Output Directory" appears to be configured as "apps/web/.next" (a
 * leftover from before Root Directory was corrected to "apps/web"). With
 * Root Directory = apps/web, Vercel then looks for the build output at
 * apps/web/apps/web/.next, which doesn't exist — `next build` correctly
 * writes to apps/web/.next (i.e. ".next" relative to this Root Directory).
 *
 * Until that dashboard setting can be corrected directly, this script runs
 * after `next build` and places a copy of the output at the doubled path
 * Vercel is actually checking, so the deployment succeeds either way.
 * Harmless / a no-op if the dashboard setting gets fixed later (the extra
 * copy is just unused).
 */
import fs from "node:fs";
import path from "node:path";

const src = path.join(process.cwd(), ".next");
const dest = path.join(process.cwd(), "apps", "web", ".next");

if (!fs.existsSync(src)) {
  console.error(`[fix-output-dir] Expected build output at ${src} — nothing to copy.`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`[fix-output-dir] Copied ${src} -> ${dest}`);
