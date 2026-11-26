#!/usr/bin/env node
/**
 * The weekly search-coverage probes on the GitHub Actions runner (.github/workflows/search-coverage.yml): runs the
 * app's own WorksLake search for every probe (src/server/jobslake/coverage.ts) in this process, against Supabase, and
 * saves the report Admin → Sources → Search coverage reads. The site is never called. Same secrets as the gateway
 * collection; source keys come from Admin → Keys in the same database.
 *
 *   WJ_COVERAGE_BUDGET_MIN  minutes before it stops starting new probes (default 35)
 *   WJ_RUNNER_CHECK         1 to only load the code and exit (a smoke test; nothing is searched)
 */
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SECRET_ENCRYPTION_KEY"];
const check = process.env.WJ_RUNNER_CHECK === "1";
const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
if (missing.length && !check) {
  console.error(`Missing: ${missing.join(", ")}. These are repository secrets (GitHub → Settings → Secrets and variables → Actions); see .github/workflows/search-coverage.yml.`);
  process.exit(2);
}

const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } });
const { runCoverage } = await jiti.import("../src/server/jobslake/coverage.ts");
if (check) {
  console.log("coverage code loads");
  process.exit(0);
}
const budgetMin = Math.min(55, Math.max(5, Number(process.env.WJ_COVERAGE_BUDGET_MIN) || 35));
try {
  const r = await runCoverage({ ranOn: "github", budgetMs: budgetMin * 60_000 });
  const measured = r.probes.filter((p) => p.matches !== null);
  const gaps = measured.filter((p) => p.matches < 3).length;
  console.log(`done: ${r.probes.length} searches in ${Math.round(r.durationMs / 60_000)} min; ${gaps} gaps, ${r.probes.length - measured.length} failed`);
  process.exit(0);
} catch (e) {
  console.error(`failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
