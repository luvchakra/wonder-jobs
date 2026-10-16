# What runs where, and why

Pull requests merge automatically once CI is green (CLAUDE.md), so CI must be fast and must never be
flaky. The slow, browser-driven suite runs every night instead. Timings come from real runs; see
`docs/performance.md`.

| Where | What | How long | Gates the merge? |
|---|---|---|---|
| Pull request, code changed | Lint **on the changed files**, Typecheck, unit tests **related to the changed files** (`vitest related`), Build, Dependency audit: parallel jobs → `CI` | ~1 min | Yes, `CI` |
| Pull request that changes `package.json`, the lockfile, `tsconfig`, test/lint/build config, CI files, files tests read from disk (`extension/`, `apps/web/supabase/`, `apps/web/public/`), anything outside the two apps, or deletes a file | The same jobs, but the **whole** lint and **every** unit test | ~1 min | Yes, `CI` |
| Pull request, docs/Markdown only | Nothing (`CI` reports passed) | ~15 s | Yes, `CI` |
| Push to `main` (a merge) | The whole lint, every unit test, Typecheck, Build, audit; saves the caches PRs restore | ~1 min | No (already merged) |
| Nightly, 02:47 IST, on `main` | The whole Playwright suite (desktop Chromium + Pixel 7) against a fresh production build | ~8 min | No, but a red nightly blocks other merges (below) |
| By hand | Actions → **E2E nightly** → Run workflow: any branch, optionally only some spec files | depends | No |

There is **no E2E on pull requests**. There is no secret scanner in this repository; GitHub's push
protection is the only one.

Why the build stays on pull requests: a merge deploys straight to production, and a broken build there
costs a deployment slot and leaves `main` red. It runs in parallel and takes about as long as Typecheck,
so it doesn't lengthen CI.

## The nightly (`.github/workflows/e2e-nightly.yml`)

- **Fresh build:** `playwright.config.ts` builds the app (`next build && next start`) before the run; no
  build cache is restored.
- **Clean start:** the run's global setup (`apps/web/e2e/cleanup.ts`) first deletes throwaway data earlier
  runs left in the test Supabase project, older than two hours: `wj-e2e-…@example.com` accounts with
  their rows, and the JobsLake sources the admin journeys add (`Remotive API <ms>`, `Credentialed <ms>`,
  `Audited <ms>`). Nothing else is ever touched. A run killed halfway therefore can't break the next one.
  The JobsLake admin journeys, the only ones that change a shared setting (sources), run only against a
  server without Supabase Auth, where that state lives in memory and dies with the server.
- **Never production data:** the workflow refuses an `E2E_SUPABASE_URL` that points at the production
  project, and `e2e/fixtures/auth.ts` treats production as "not configured", so signed-in specs report
  BLOCKED instead of creating accounts there. Specs run against the local build, never a deployment.
- **Time budget:** each part has a budget (30 min today). When it runs out Playwright stops starting tests
  and still writes its reports, so the summary lists what didn't run instead of the job being killed.
- **Retries:** one. A test that passes only on retry is reported as **flaky** and fails the nightly, so it
  gets a root cause.
- **Summary:** the run page shows passed / failed / flaky / not run / skipped, each bad test by name, and
  the time per spec file (`apps/web/e2e/summary.mjs`).
- **Artifacts:** the HTML report, traces, screenshots and videos of failed attempts, and
  `e2e-results.json`, kept 14 days.
- **Alert:** a failed, flaky or cut-short run opens the issue "E2E nightly failing", or comments on it.
- **Parts:** one today. The suite is about 11 min of test time on 2 workers, so about 6 min of wall time
  plus the build. If a run would pass ~30 minutes, add entries to `matrix.part` with their own spec
  lists. Give the slowest spec files parts of their own, and balance by the per-spec times in the run
  summary, not by file count. Slowest today: outcome-journeys 221 s, jobs-apply 120 s,
  resume-templates 106 s, golden-journeys 100 s, jobslake 73 s, install-banner 26 s, auth 25 s
  (measured 2026-10-15).
- **Signed-in specs** (auth lifecycle, JobsLake candidate search, real-account) need a **separate**
  Supabase test project in the `E2E_SUPABASE_URL`, `E2E_SUPABASE_PUBLISHABLE_KEY` and
  `E2E_SUPABASE_SERVICE_ROLE_KEY` repository secrets. Until one exists they report BLOCKED (skipped).

Start it by hand: GitHub → Actions → **E2E nightly** → **Run workflow** → pick the branch → optionally
enter spec files, e.g. `e2e/auth.spec.ts e2e/jobs-apply.spec.ts`.

## Rules

- Never skip, disable or delete a test to make CI or the nightly green.
- A red nightly is fixed before other work merges. Find the root cause; "flaky" is not one.
- Before merging something risky (sign-in, permissions, database migrations, payments, a new
  cross-feature flow), run the affected specs locally (below) or start the nightly on the branch.

## E2E on your machine

From `apps/web`, against a fresh local production build (Playwright builds and starts it on port 3211):

```bash
npx playwright install chromium          # once (or set PW_CHROMIUM_PATH to an existing Chromium)
npm run e2e -- e2e/auth.spec.ts e2e/jobs-apply.spec.ts --project=chromium
```

Leave out the spec files to run everything. Signed-in specs need `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` for a **test** project in the
environment; pointed at production they report BLOCKED. `npx playwright show-report` opens the report.
