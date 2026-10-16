#!/usr/bin/env node
/**
 * Reads Playwright's JSON report and says what happened: passed / failed / flaky / not run / skipped,
 * the tests in each bad bucket, and how long each spec file took (the numbers to balance parts by).
 *
 *   node e2e/summary.mjs e2e-results.json             Markdown summary on stdout (CI step summary)
 *   node e2e/summary.mjs e2e-results.json --verdict   exits 1 if anything failed, was flaky, or didn't run
 *
 * Buckets:
 *   passed   passed on the first attempt
 *   flaky    failed, then passed on retry — counts against the run, so it gets a root cause
 *   failed   failed on every attempt
 *   not run  never started or was cut short (the run's time budget ran out, or the run itself errored)
 *   skipped  skipped on purpose: BLOCKED (missing credentials) or not applicable to that browser
 */
import { existsSync, readFileSync } from "node:fs";

const [file = "e2e-results.json", flag] = process.argv.slice(2);
const verdict = flag === "--verdict";

if (!existsSync(file)) {
  const msg = `No Playwright report at ${file}: the run ended before any test reported (build or server start failed?).`;
  if (verdict) {
    console.error(msg);
    process.exit(1);
  }
  console.log(`## E2E\n\n**${msg}**`);
  process.exit(0);
}

const report = JSON.parse(readFileSync(file, "utf8"));
const buckets = { passed: [], failed: [], flaky: [], "not run": [], skipped: [] };
const perFile = new Map();

function walk(suite) {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const name = `[${t.projectName}] ${spec.file}:${spec.line} › ${spec.title}`;
      const results = t.results ?? [];
      const ms = results.reduce((sum, r) => sum + (r.duration ?? 0), 0);
      perFile.set(spec.file, (perFile.get(spec.file) ?? 0) + ms);
      let bucket;
      if (results.some((r) => r.status === "interrupted")) bucket = "not run";
      else if (t.status === "flaky") bucket = "flaky";
      else if (t.status === "unexpected") bucket = "failed";
      else if (t.status === "skipped") bucket = results.length === 0 ? "not run" : "skipped";
      else bucket = "passed";
      buckets[bucket].push(name);
    }
  }
  for (const child of suite.suites ?? []) walk(child);
}
for (const suite of report.suites ?? []) walk(suite);

const plain = (text) => text.replace(/\u001b\[[0-9;]*m/g, "");
// "Timed out waiting …s for the test suite to run" is the run's time budget running out.
const runErrors = (report.errors ?? []).map((e) => plain((e.message ?? String(e)).split("\n")[0]));
const bad = buckets.failed.length + buckets.flaky.length + buckets["not run"].length + runErrors.length;

if (verdict) {
  const counts = Object.entries(buckets).map(([k, v]) => `${v.length} ${k}`).join(", ");
  if (bad > 0) {
    console.error(`E2E did not pass: ${counts}${runErrors.length ? `, ${runErrors.length} run error(s)` : ""}`);
    for (const k of ["failed", "flaky", "not run"]) for (const n of buckets[k]) console.error(`  ${k}: ${n}`);
    for (const e of runErrors) console.error(`  run error: ${e}`);
    process.exit(1);
  }
  console.log(`E2E passed: ${counts}`);
  process.exit(0);
}

const lines = ["## E2E", ""];
lines.push("| Passed | Failed | Flaky | Not run | Skipped (BLOCKED / not applicable) | Wall time |");
lines.push("|---|---|---|---|---|---|");
const wall = report.stats?.duration ? `${(report.stats.duration / 60000).toFixed(1)} min` : "—";
lines.push(`| ${buckets.passed.length} | ${buckets.failed.length} | ${buckets.flaky.length} | ${buckets["not run"].length} | ${buckets.skipped.length} | ${wall} |`);
lines.push("");
for (const e of runErrors) lines.push(`**Run error:** ${e}`, "");
for (const k of ["failed", "flaky", "not run"]) {
  if (!buckets[k].length) continue;
  lines.push(`### ${k[0].toUpperCase()}${k.slice(1)} (${buckets[k].length})`, "");
  if (k === "flaky") lines.push("Passed only on retry. Find the root cause; flaky is not one.", "");
  for (const n of buckets[k].slice(0, 100)) lines.push(`- ${n}`);
  if (buckets[k].length > 100) lines.push(`- … and ${buckets[k].length - 100} more`);
  lines.push("");
}
lines.push("### Time per spec file (all attempts, summed across workers)", "", "| Spec | Time |", "|---|---|");
for (const [f, ms] of [...perFile].sort((a, b) => b[1] - a[1])) lines.push(`| ${f} | ${(ms / 1000).toFixed(0)} s |`);
console.log(lines.join("\n"));
