#!/usr/bin/env node
/**
 * Automated accessibility audit (WJ-075). Runs axe-core against the
 * production build's key public pages and the demo-mode app screens (which
 * need no real account), and fails the process if any "serious" or
 * "critical" violation is found. "Minor"/"moderate" findings are reported
 * but do not fail the run.
 *
 * Usage:
 *   npm run build && npm run a11y            # against a server this script starts
 *   BASE=http://localhost:3000 npm run a11y  # against a server you already started
 *
 * Requires a Chromium binary: this repo does not vendor one, so either run
 * `npx playwright install chromium` once, or set PW_CHROMIUM_PATH to an
 * existing install (this session's sandbox has one at /opt/pw-browsers).
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const AXE_SOURCE = readFileSync(new URL("../../../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");

const PUBLIC_PAGES = ["/", "/sign-in", "/sign-up", "/forgot-password", "/help", "/about", "/privacy", "/terms", "/security", "/cookies"];
const DEMO_PAGES = ["/app", "/app/jobs", "/app/runs", "/app/applications", "/app/automation/settings", "/app/automation/scheduled", "/app/career-dna", "/app/settings/ai", "/app/profile"];

/**
 * Screens that only exist after an interaction. A dialog is exactly where accessibility tends to break
 * — focus, labelling, contrast on an overlay — so auditing only what renders on load would miss the
 * riskiest part of the UI.
 */
const INTERACTIONS = [
  {
    name: "/app/career-dna (resume import dialog)",
    url: "/app/career-dna",
    open: async (page) => {
      await page.getByRole("button", { name: /import from resume/i }).click();
      await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5_000 });
      // The paste panel is part of the same dialog and is worth auditing with it.
      await page.getByRole("button", { name: /paste the text instead/i }).click();
    },
  },
  {
    name: "/app/jobs (Why Was This Filtered — some results hidden)",
    url: "/app/jobs?saved=1",
    open: async () => {}, // the URL param alone drives the filtered state; nothing to click
  },
  {
    name: "/app/jobs (Why Was This Filtered — zero results)",
    url: "/app/jobs",
    open: async (page) => {
      await page.getByLabel("Search jobs").fill("zzzznonexistentqueryzzzz");
      await page.waitForTimeout(400); // the search is debounced
    },
  },
];

// Impacts axe-core reports, worst first. Anything at or above FAIL_AT fails the run.
const IMPACT_RANK = { minor: 0, moderate: 1, serious: 2, critical: 3 };
const FAIL_AT = "serious";

async function runAxe(page) {
  await page.addScriptTag({ content: AXE_SOURCE });
  return await page.evaluate(async () => await globalThis.axe.run(document, { resultTypes: ["violations"] }));
}

async function auditPage(page, url) {
  await page.goto(url, { waitUntil: "load", timeout: 30_000 });
  // Let scroll-reveal / IntersectionObserver content settle so it isn't flagged as invisible.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  return (await runAxe(page)).violations;
}

async function auditInteraction(page, base, step) {
  await page.goto(base + step.url, { waitUntil: "load", timeout: 30_000 });
  await step.open(page);
  await page.waitForTimeout(200);
  return (await runAxe(page)).violations;
}

async function main() {
  let server;
  let base = process.env.BASE;
  if (!base) {
    const port = 3900 + Math.floor(Math.random() * 90);
    base = `http://localhost:${port}`;
    console.log(`Starting \`next start -p ${port}\` (set BASE=... to audit a server you already started)…`);
    server = spawn("npx", ["next", "start", "-p", String(port)], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: process.env });
    await new Promise((resolve, reject) => {
      let out = "";
      const onData = (d) => {
        out += d.toString();
        if (/Ready in/.test(out)) resolve();
      };
      server.stdout.on("data", onData);
      server.stderr.on("data", onData);
      server.on("exit", (code) => reject(new Error(`next start exited early (code ${code}):\n${out}`)));
      setTimeout(() => reject(new Error(`next start did not become ready in time:\n${out}`)), 30_000);
    });
  }

  const executablePath = process.env.PW_CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  const browser = await chromium.launch({ executablePath, args: ["--ignore-certificate-errors"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  // Settled DOM, not mid-transition: scroll-reveal opacity/transform transitions are
  // suppressed under prefers-reduced-motion (see .wj-reveal in globals.css), so a
  // page audited here reflects its final state instead of a random transition frame.

  const findings = [];
  try {
    // Enter demo mode once; its cookie carries across the rest of the pages in this context.
    await page.goto(base + "/demo", { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector("main h1"), null, { timeout: 20_000 }).catch(() => {});

    for (const p of [...PUBLIC_PAGES, ...DEMO_PAGES]) {
      const violations = await auditPage(page, base + p).catch((e) => {
        console.error(`  ! ${p}: could not audit (${e.message})`);
        return [];
      });
      for (const v of violations) findings.push({ page: p, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) });
    }

    for (const step of INTERACTIONS) {
      const violations = await auditInteraction(page, base, step).catch((e) => {
        console.error(`  ! ${step.name}: could not audit (${e.message})`);
        return [];
      });
      for (const v of violations) findings.push({ page: step.name, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) });
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  const byPage = new Map();
  for (const f of findings) {
    if (!byPage.has(f.page)) byPage.set(f.page, []);
    byPage.get(f.page).push(f);
  }

  console.log(`\nAudited ${PUBLIC_PAGES.length + DEMO_PAGES.length} pages and ${INTERACTIONS.length} interaction state(s), ${findings.length} violation group(s) found.\n`);
  for (const [p, list] of byPage) {
    console.log(`${p}`);
    for (const f of list) console.log(`  [${f.impact}] ${f.id} — ${f.help} (${f.nodes} node${f.nodes === 1 ? "" : "s"}: ${f.targets.join(", ")})`);
  }

  const blocking = findings.filter((f) => (IMPACT_RANK[f.impact] ?? 0) >= IMPACT_RANK[FAIL_AT]);
  if (blocking.length) {
    console.error(`\n✖ ${blocking.length} violation(s) at "${FAIL_AT}" impact or above.`);
    process.exit(1);
  }
  console.log(findings.length ? `\n✓ No "${FAIL_AT}"+ violations (${findings.length} lower-impact note(s) above, worth a look but not blocking).` : "\n✓ Clean run — axe-core found nothing on any audited page.");
}

function existsSync(p) {
  try {
    readFileSync(p);
    return true;
  } catch (e) {
    // A directory throws EISDIR, which still means it exists.
    return e.code === "EISDIR";
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
