# Build-to-deploy performance

How long a change takes from push to live, where that time goes, and what runs when. Every number
here comes from a real run (GitHub Actions job and step timings, Vercel build logs), not an estimate.

## What runs when (since WJ-227)

| Trigger | Runs | Gates the merge? |
|---|---|---|
| Pull request touching code | Changes → Lint, Typecheck, Unit tests, Build, Dependency audit (parallel) → `CI` | Yes, `CI` |
| Pull request touching only docs/Markdown | Changes → `CI` (the five jobs are skipped, which counts as passed) | Yes, `CI` |
| Pull request with the `e2e` label | the above plus E2E, 2 shards → `E2E` and `CI` | Yes, a red E2E fails `CI` |
| Pull request changing `.github/workflows` or `.github/scripts` | everything, E2E included | Yes |
| Push to `main` (a merge) | same as the PR; also saves the build caches PRs restore | No (already merged) |
| Nightly, 02:47 IST | everything, E2E included, on `main` | No; a failure opens or comments on one issue |
| Actions → CI → Run workflow | everything, E2E included | No; same alert |

E2E runs the Chromium desktop and Pixel 7 projects. Specs that need a real Supabase account report
BLOCKED (skipped) unless the repository has `E2E_SUPABASE_URL`, `E2E_SUPABASE_PUBLISHABLE_KEY` and
`E2E_SUPABASE_SERVICE_ROLE_KEY` secrets.

**Force the full suite on a PR:** add the `e2e` label. **On main:** Actions → CI → Run workflow.

**Vercel** builds production for every merge to `main`, and a preview for every push to a working
branch. It no longer builds previews of Dependabot branches, of a squash-merge commit, or of a change
that only touches docs (production skips docs-only changes too).

## Before (measured 2026-10-05, the last five merges, #67–#71)

### The merge gate (the pull-request run of `CI`)

| Check | Min | Median | Max | On the critical path? |
|---|---|---|---|---|
| Build | 55 s | 65 s | 77 s | **Yes, slowest in all five runs** |
| Lint | 31 s | 44 s | 50 s | No |
| Typecheck | 38 s | 40 s | 43 s | No |
| Unit tests | 34 s | 35 s | 38 s | No |
| Dependency audit | 23 s | 27 s | 29 s | No |
| CI (summary) | 2 s | 3 s | 4 s | Yes, after the slowest |
| **Whole gate, first job queued to CI done** | 62 s | **76 s** | 85 s | |

Build's own steps: `npm ci` 9–16 s, then `next build` 40–58 s, which split into compile 37 s (no build
cache: "No build cache found"), TypeScript 17 s and static pages 1 s. The TypeScript pass repeated what
the Typecheck job had already checked.

### Vercel production deploy (merge commit c42cc5b)

| Phase | Time |
|---|---|
| Queue → build start | 1 s |
| Clone | 1.7 s |
| Build cache restore | 2.2 s |
| Setup + ignored-build-step script | 5.4 s |
| `npm install` | 7.3 s |
| Compile | 16.0 s |
| TypeScript (again) | **25.9 s** |
| Page data + static pages | 3.8 s |
| Finalize + output copy | 2.6 s |
| Deploy outputs | 14.1 s |
| **Created → live** | **82.7 s** |
| Build cache save and upload (after live; doesn't delay this deploy) | 37.6 s |

An earlier, smaller merge (23bae71) took 50.6 s created → live, with TypeScript at 7.6 s.

### Deployments per merge

One production build, plus one preview per push to the PR branch (used to try a change), plus one
preview per open Dependabot PR: Dependabot rebases every open PR when `main` moves. After #71 that was
three previews. **Vercel builds one deployment at a time here**, so they queued: 1 s, 77 s and 100 s
waits. A merge landing in that window would wait the same way before its production build started.

### Local production build (4 cores)

| Build | Wall | Compile | TypeScript |
|---|---|---|---|
| Clean (no `.next`) | 110 s | 70 s | 24 s |
| Warm, nothing changed | 9.7 s | 0.9 s | 4.0 s |
| Warm, one file edited | 12.6 s | 1.7 s | 6.2 s |

Also measured locally: ESLint 28 s cold, 2 s with a content-keyed cache (still 2 s after every file's
timestamp changed, as on a fresh checkout); `tsc` 20 s cold, 4.3 s with its incremental build info.

E2E (Chromium desktop + Pixel 7, 248 tests, 2 workers): 6.3 min, plus about 1.5 min to build. It ran
nowhere automatically before this change.

## What changed, and why

1. **Build cache in CI.** Build restores Turbopack's `.next/cache` on every run and saves it from `main`
   (key: lockfile hash + commit, restoring the newest with the same lockfile). Cold compile was 37 s.
2. **Types checked once.** On CI and Vercel, `next build` skips its TypeScript pass
   (`typescript.ignoreBuildErrors` when `CI` or `VERCEL` is set). The Typecheck job now runs
   `next typegen` before `tsc`, so it also validates the route types only the build used to check. Tested
   with a mistyped route handler: plain `tsc` passed it, `next typegen` + `tsc` failed it, a local
   `next build` failed it, and `CI=1 next build` skipped it. Local builds still check types.
3. **Lint and Typecheck caches.** ESLint's cache (content strategy) and `tsc`'s build info, restored on
   every run and saved from `main`, both keyed on the lockfile.
4. **Jobs by what changed.** A first job (`.github/scripts/ci-changes.sh`) diffs the PR from its merge
   base, or a push from its `before`. Docs/Markdown only: nothing runs. CI files: everything. Schedule,
   manual, or a diff it can't compute (zero or unknown base): everything. Tested against synthetic
   commits for each case (18 cases).
5. **E2E off the gate, but running.** Nightly, manual and `e2e`-labelled. Two even shards (124 tests
   each), `fail-fast: false`, summarised by `E2E`. Failures alert through one GitHub issue.
6. **One production deploy, not four.** `vercel.json` turns off Dependabot previews (`dependabot/*` and
   `dependabot/**`); the ignored-build-step script skips them too, and skips previews of squash-merge
   commits. Tested across every `VERCEL_ENV` × branch × commit subject (45 cases + 8 edge cases).
7. **Concurrency.** A new push to a PR cancels its older run; pushes to `main` are never cancelled; the
   event name is in the group so a nightly run never cancels a merge's run.

## Trade-offs and rollback

- **E2E is not on the merge gate.** It wasn't before either, but now it runs nightly: a regression only
  E2E catches can reach production and sit there up to about 24 hours before the nightly run opens an
  issue. Add the `e2e` label to any risky PR to gate it.
- **Vercel no longer type-checks.** Production only deploys merged commits, and merging needs `CI`
  (which includes Typecheck) green. A commit pushed straight to `main`, skipping the PR, would deploy
  even with type errors; CI would still report them on that commit.
- **Dependabot PRs have no preview deployment.** CI still runs on them.
- **Rollback:** revert this PR. Or individually: delete the `typescript` line in `next.config.ts`, the
  `git` line in `apps/web/vercel.json`, or the cache steps in `ci.yml`.

## After

Recorded from the first real runs after merge (see the table below once filled).
