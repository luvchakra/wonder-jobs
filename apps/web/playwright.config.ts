import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * WonderJobs Playwright E2E configuration.
 *
 * Base URL is environment-driven (`PLAYWRIGHT_BASE_URL`) — never hard-coded to production. When it's
 * unset, this config builds and starts a local server itself (`webServer` below) so `npx playwright test`
 * works out of the box; when it's set, that server is assumed already running (e.g. a deployment under
 * test) and nothing is spawned.
 *
 * Real backend, not a mock: these tests exercise the actual Supabase-backed auth/data flow, so
 * `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must
 * be present in the environment this process inherits (never committed — source a local env file before
 * running, the same way `npm run check` does elsewhere in this repo). Without them, auth-dependent specs
 * report BLOCKED rather than a fabricated pass — see `e2e/fixtures/auth.ts`.
 *
 * Browser matrix: Chromium and the Chromium-based "Mobile Chrome" project run wherever this repo's
 * pre-installed Chromium binary is found. Firefox, WebKit and "Mobile Safari" (WebKit-based) are declared
 * so the full required matrix exists and is documented, but this sandbox vendors Chromium only — running
 * them here fails at browser launch, which is a real, honest BLOCKED result (see docs/TEST_EXECUTION_REPORT.md),
 * not something this config should hide or fake a pass for.
 */
const PORT = 3211;
const chromiumPath = process.env.PW_CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;

// This sandbox routes all outbound HTTPS (e.g. the browser's direct calls to Supabase) through an agent
// proxy that TLS-terminates and re-signs every connection with a freshly-minted leaf certificate; CLI
// tools pick up HTTPS_PROXY and trust the proxy's CA automatically, but a Playwright-launched browser
// does neither on its own. Without both: (1) `proxy` below, every client-side Supabase call fails with a
// generic "Failed to fetch" (the request never reaches the proxy); (2) `--ignore-certificate-errors`,
// each request gets a *new* leaf cert that Chromium's per-connection cert-exception cache doesn't
// recognize, so it keeps retrying fresh connections until it gives up with net::ERR_TOO_MANY_RETRIES —
// a static ignore-errors flag (not the per-cert `ignoreHTTPSErrors` context option) is what avoids that.
const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;
const proxy = proxyServer ? { server: proxyServer, bypass: "localhost,127.0.0.1" } : undefined;
const chromiumProxyArgs = proxyServer ? ["--ignore-certificate-errors"] : [];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }], ["json", { outputFile: "playwright-report/results.json" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    proxy,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: chromiumPath, args: chromiumProxyArgs } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "Mobile Chrome", use: { ...devices["Pixel 7"], launchOptions: { executablePath: chromiumPath, args: chromiumProxyArgs } } },
    { name: "Mobile Safari", use: { ...devices["iPhone 14"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // Build first: NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so a stale
        // `.next` from a differently-configured build would silently test the wrong backend.
        command: `next build && next start -p ${PORT}`,
        url: baseURL,
        timeout: 180_000,
        reuseExistingServer: false,
        stdout: "pipe",
        stderr: "pipe",
      },
});
