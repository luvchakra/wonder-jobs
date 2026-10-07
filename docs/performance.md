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

## After (measured 2026-10-07, first runs after #73 merged)

### The merge gate

| Check | Before, median | After, cold cache | After, warm cache |
|---|---|---|---|
| Build | 65 s | 56–61 s | **25–34 s** (`next build` 4–5 s) |
| Lint | 44 s | 47–57 s | **17–24 s** (ESLint 2 s) |
| Typecheck | 40 s | 42–44 s | **30–33 s** (`next typegen` + `tsc` 7 s) |
| Unit tests | 35 s | 38–41 s | 25 s |
| Dependency audit | 27 s | 26–29 s | 24 s |
| Changes (new, runs first) | — | 7 s | 6–7 s |
| **Whole gate, to the last required job** | **76 s** | 72–78 s | **46–54 s** |
| Docs/Markdown-only PR | 62–85 s (everything ran) | **16 s** (Changes + CI; #75) | same |

"Cold" is the first run after a lockfile change (the caches key on it). Measured on #73's own run and its
merge to `main`. "Warm" restores `main`'s caches: Dependabot's rebased `actions/checkout` PR (a different
commit, so a prefix hit) and a manual run on `main` (an exact hit). With warm caches every job is mostly
`npm ci` (13–19 s); the work itself is 2–7 s.

### Vercel

| | Before | After |
|---|---|---|
| Production, created → live | 49–83 s (median 59.5 s), TypeScript up to 26 s of it | **42 s**, "Skipping validation of types" |
| Merge → live | 55–88 s (median 63 s) | **48 s** |
| Preview of a working branch, created → live | 65 s and 85 s (#70, #71 heads) | 40 s (#73 head) |
| Deployments per merge | 1 production + 1 per open Dependabot PR (3 after #71, queued up to 100 s) | **1 production**; Dependabot rebased 5 PRs at 18:30–18:31 and Vercel built none of them |
| Docs-only merge to production | skipped (rule predates this work) | skipped: cancelled by the ignore step 9 s after creation (#75) |

### E2E (off the gate)

Two shards of 124 tests on full Chromium: 4–7.5 min per shard, of which installing Chromium and its system
libraries takes 2–3.5 min. It ran on #73 (the CI-file change) and on its merge: all passing.

### Notes from the first runs

- The first E2E run on a GitHub runner failed 12 tests the sandbox passes. Playwright had picked its
  headless shell, which can't load the browser-helper extension and renders the résumé gallery 18 px
  taller. The job now points `PW_CHROMIUM_PATH` at full Chromium, as the sandbox does.
- Two advisories published after #71 (sharp <0.35.5, source-map-js ≤1.2.1) failed the audit on every PR;
  #73 carried the lockfile-only fix.
- Dependabot adds labels as it opens a PR, and each `labeled` event starts a run that cancels the previous
  one. The last run is complete; the cancelled ones cost a few runner-seconds.
- Docs-only previews still built: working branches are reset to `main` after each squash merge, so a
  preview's previous deployment is never in Vercel's shallow clone, and the script built to be safe.
  Previews now compare with the newest squash-merge commit below them (that is `main`) when that
  happens; production still builds whenever its previous commit is unknown. Tested on shallow clones
  of synthetic histories (11 cases, including a branch that merged `main`).
- GitHub's runner queue added 5 minutes to one run (a job with no steps, waiting for a runner). That
  is outside this pipeline.
