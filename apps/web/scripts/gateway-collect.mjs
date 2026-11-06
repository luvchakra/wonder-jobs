#!/usr/bin/env node
/**
 * The gateway collection on the GitHub Actions runner (.github/workflows/gateway-collect.yml): runs the app's own
 * collection code (src/server/gateway/runner.ts) in this process, against Supabase, with the repository's secrets as
 * its environment. The site is never called. Loads the TypeScript through jiti with the app's "@/…" alias, like
 * scripts/ui-check.mjs.
 *
 *   WJ_COLLECT_MODE    scheduled (default: what's due) · all (Import now) · module (Import this module)
 *   WJ_COLLECT_MODULE  the module, for mode=module
 *   WJ_COLLECT_BY      who started it (the run's record)
 *   WJ_COLLECT_FORCE   1 to collect even right after the last scheduled run (Run workflow by hand)
 *   WJ_RUNNER_CHECK    1 to only load the code and exit (a smoke test; nothing is collected)
 */
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

// The gateway's tokens and API key are derived from SECRET_ENCRYPTION_KEY (src/server/gateway/secrets.ts); email and
// source keys come from Admin → Keys in the same database. So three secrets are all the runner needs.
const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SECRET_ENCRYPTION_KEY"];
const check = process.env.WJ_RUNNER_CHECK === "1";
const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
if (missing.length && !check) {
  console.error(`Missing: ${missing.join(", ")}. These are repository secrets (GitHub → Settings → Secrets and variables → Actions); see .github/workflows/gateway-collect.yml.`);
  process.exit(2);
}
process.env.WORKSLAKE_GATEWAY_ENABLED ??= "1";

const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } });
const { runOnRunner } = await jiti.import("../src/server/gateway/runner.ts");
if (check) {
  console.log("runner code loads");
  process.exit(0);
}
const mode = ["scheduled", "all", "module"].includes(process.env.WJ_COLLECT_MODE ?? "") ? process.env.WJ_COLLECT_MODE : "scheduled";
try {
  const r = await runOnRunner({ mode, module: process.env.WJ_COLLECT_MODULE || undefined, by: process.env.WJ_COLLECT_BY || undefined, force: process.env.WJ_COLLECT_FORCE === "1" });
  console.log(`${r.ok ? "done" : "not run"}: ${r.summary}`);
  process.exit(r.ok ? 0 : 1);
} catch (e) {
  console.error(`failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
