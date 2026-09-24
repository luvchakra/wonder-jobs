# Test Execution Report

## Outcome-based UX (2026-09-24) — `e2e/outcome-journeys.spec.ts` + regression of `e2e/golden-journeys.spec.ts`

Run against a production build (`npm run check`'s `next build`, then `next start -p 3211`), `PLAYWRIGHT_BASE_URL=http://localhost:3211 npx playwright test e2e/golden-journeys.spec.ts e2e/outcome-journeys.spec.ts --project=chromium --project="Mobile Chrome"`.

**96/96 PASS** (48 tests × 2 projects, ~2.1 min). Demo mode throughout; each test gets a fresh context and seed.

| Spec ID | Test asserts | chromium | Mobile Chrome |
|---|---|---|---|
| FIND-001 | Career Profile → Home "Find opportunities" → request prefilled from the candidate's own goal → search → "Strong opportunities" → `/app/jobs?fit=strong` lists results | PASS | PASS |
| FIND-002 | Natural-language request shows derived roles/places/industry with "from your words" before running; run header echoes the request | PASS | PASS |
| FIND-003 | Plain-language steps tick "— done" while running; result's strong count vs "Strong on the shortlist" is consistent | PASS | PASS |
| FIND-004 | Stop → "Search stopped" + "Everything already found is still available." + Search again | PASS | PASS |
| FIND-005 | "Wonder needs your input" with the real reason; Continue clears that question and the search reaches its result | PASS | PASS |
| DECIDE-001 | Card "Why Wonder surfaced this"; `?tab=why` deep link opens "Why it fits" | PASS | PASS |
| DECIDE-002 | "Sources & signals" shows hiring signals with the observation disclaimer | PASS | PASS |
| DECIDE-003 | A rejected job's page says why it's hidden; Show it anyway restores it | PASS | PASS |
| DECIDE-004 | Compare two from the list → table with both, no winner language | PASS | PASS |
| DECIDE-005 | Save persists across reload | PASS | PASS |
| DECIDE-006 | Two "Too senior" rejections → no learned preference; third → "Rank more senior roles lower" with its evidence; survives reload | PASS | PASS |
| APPLY-001 | Prepare from a job → Pack summary counts only real materials; generating a résumé → "N of 3 materials ready" + "AI-generated draft" | PASS | PASS |
| APPLY-002 | Editing a material autosaves and the summary switches it to "Edited by you" | PASS | PASS |
| APPLY-003 | "Application ready" → Review and continue → hand-off disabled until the review box is ticked | PASS | PASS |
| APPLY-004 | Hand-off opens the employer page (stubbed) and returns to the application, still offering "Mark as submitted" — nothing marked submitted by Wonder | PASS | PASS |
| PROGRESS-001 | Application timeline renders | PASS | PASS |
| PROGRESS-002 | Home "Your progress" shows interview/follow-up counts and links to Applications | PASS | PASS |
| WONDER-001 | "Show my application progress" → real counts → Applications; dialog closes | PASS | PASS |
| WONDER-002 | "Find me IAM jobs" → Find prefilled with "IAM jobs" only | PASS | PASS |
| WONDER-003 | "Search again with Director roles" → Find prefilled | PASS | PASS |
| WONDER-004 | After rejecting a job, "Why didn't you show the … role?" → "Hidden because it's …" → job page with Show it anyway | PASS | PASS |
| WONDER-005 | "What should I focus on today?" → "Today: …" from real data → Home | PASS | PASS |
| AUTOMATION-001 | Keep watch via the simple chooser → schedule with "Only if strong matches > 0"; Home shows "Wonder is working" | PASS | PASS |
| AUTOMATION-002 | Run now → a scheduled search executes to a result | PASS | PASS |
| AUTOMATION-003 | Unmet condition → quiet outcome explained on the result and "quiet — nothing to report" on the schedule | PASS | PASS |
| ADVANCED-001 | "See how Wonder worked" expands to stats and the run log | PASS | PASS |
| ADVANCED-002 | Breakdown total = engine's unique opportunities; strong/worth = the matching step's evidence; shortlist ≤ strong | PASS | PASS |
| MOBILE-001 | 390px Find → result → job → pack, no horizontal scroll at any step | PASS | PASS |
| MOBILE-002 | 390px "Wonder needs your input" answered from the mobile bar | PASS | PASS |
| MOBILE-003 | 390px Application Pack summary and review | PASS | PASS |

Golden journeys GJ-001..GJ-018: 36/36 PASS in the same run. Three were updated for deliberate UI changes (GJ-002/GJ-012 count top-level result cards now that cards carry their own "why" lists; GJ-013 matches the exact provenance badge; GJ-014 clicks the listbox option, which is no longer a nested button).

Defects the outcome journeys found and that were fixed before this run: a result headline counting only the capped shortlist's strong matches while the breakdown under it counted every strong fit; Ask Wonder resolving a specific job title to the first shorter title it contained; the palette re-opening itself after Enter. Accessibility (`npm run a11y`, 25 pages + 5 interaction states, now including every outcome screen): no serious/critical violations, after fixing two pre-existing ones it surfaced (Ask Wonder listbox structure/contrast; job skill badges directly inside `<ul>`).

Browser matrix unchanged: firefox, webkit and Mobile Safari are BLOCKED (not vendored in this sandbox).

`auth.spec.ts`'s real-account block ran once Supabase credentials became available, against the real project (`https://tybkklggpifpsmsidhok.supabase.co`), single-worker: **13/13 PASS**, 5 skipped (the suite's own documented environmental limits: real email delivery, OAuth, clock control). Each test's account was a disposable, pre-confirmed (`email_confirm: true`, never actually emailed) user created via the Supabase admin API and deleted — along with its `app_state`/`action_audit` rows — immediately after; no real tenant data was read or modified, and a post-run listUsers check confirmed no test accounts remained.

This run found a real bug: **AUTH-007** (sign out, sign back in, same account) failed because a build without the fix let `signOutEverywhere()` wipe local storage and revoke the session before a debounced write — `completeOnboarding()`, made moments earlier in the same test — reached the server. `flushRemote()` was fire-and-forget; it now returns its request, and both sign-out call sites (`TopBar`, `/app/profile`) await it first. Re-run after the fix: 13/13 pass. This class of regression — losing state at the exact moment of sign-out — has no demo-mode equivalent, since no golden or outcome journey signs out; it was only reachable through this real-account suite.

---

## UX Simplification Phase 5

Run against `claude/wonder-jobs-update-26qrf8` (2026-09-24), `e2e/golden-journeys.spec.ts`, using this sandbox's pre-installed Chromium (`/opt/pw-browsers/chromium`). Status values: `PASS`, `FAIL`, `BLOCKED` (can't run for an environmental reason, not a code defect), `NOT_APPLICABLE`.

### 11 golden journeys — one row per required journey, mapped to its actual test(s)

| # | Journey | Test IDs | Status | Notes |
|---|---|---|---|---|
| 1 | New candidate | GJ-011 | PASS | `/onboarding` renders the real 5-goal picker (Phase 2.2); "Get Started" is disabled until a goal is chosen, never assumed; the chosen goal advances to the real career-goal capture step. |
| 2 | Find job | GJ-002, GJ-003 | PASS | Pre-seeded catalog opens into a real job detail page with an evidence-based fit label and a working save toggle. |
| 3 | Search | GJ-012 | PASS | A free-text query narrows the real catalog (verified against a distinctive single-employer term, since a common word can still fill a full page of 24 at this catalog size). |
| 4 | Application | GJ-006, GJ-013 | PASS | An existing submitted application opens its real timeline; a "preparing" application generates a real, deterministic (WonderJobsAI template, no network) resume artifact with a visible `AI-generated` provenance badge. |
| 5 | Tracking | GJ-005 | PASS | Applications defaults to a real timeline/pipeline (Preparing/Applied/Interview/Outcome), with the tab/list view still reachable for power users. |
| 6 | Ask Wonder | GJ-014 | PASS | Phase 3.1's natural-language router: "what applications need my attention" resolves to a real, count-backed action (not a static nav shortcut) and navigates correctly on click. |
| 7 | Automation | GJ-007, GJ-015 | PASS | Starting a run lands on its own real timeline page; Automation Settings shows the Phase 3.2 plain-language level labels and a real, persisted (survives reload) per-capability policy control. |
| 8 | Intervention | GJ-016 | PASS | A real run is paused mid-flight (chunked execution keeps this responsive) and resumed without its progress resetting — verified on both desktop and mobile viewports, where a second, identical control also lives in a live-region status bar (`StageDetail.tsx`). |
| 9 | Advanced mode | GJ-017 | PASS | AI provider settings show BYOK entry points for all 3 real providers (Anthropic/OpenAI/Gemini) alongside WonderJobs AI, plus real usage-transparency copy (est. BYOK cost). |
| 10 | Mobile | GJ-008, GJ-009, GJ-010 | PASS | Forced 390×844 viewport: hamburger drawer carries every secondary destination, the bottom bar shows exactly the 5 real primary destinations with no "More" catch-all, drawer closed by default, no separate Profile tab. |
| 11 | Trust | GJ-018 | PASS | The Phase 3.6 hand-off rewrite's honest disclosure ("Wonder never sends on your behalf", "doesn't have Google's email address and can't send it") is visible in the same place Wonder offers to help — the trust-building disclosure isn't buried. |

### Full run, both projects this sandbox can execute

`npx playwright test --project=chromium --project="Mobile Chrome" e2e/golden-journeys.spec.ts`

**36/36 PASS** (18 tests × 2 projects, ~1.6 min). GJ-001 through GJ-010 are the pre-existing suite (demo entry, jobs, applications, run start, mobile drawer); GJ-011 through GJ-018 are new, added in this phase to cover the 4 journey categories the existing suite didn't reach (new candidate, search, application preparation, Ask Wonder, automation policy, intervention, advanced mode, trust).

One real cross-viewport finding surfaced while writing GJ-016: on mobile widths, Pause/Resume renders twice (once in the main `WorkflowControls` panel, once in a `role="status"` live-region summary in `StageDetail.tsx`) — both are the same real action (`svc.pause`/`svc.resume`), so the test uses `.first()`; this is intentional duplication for accessibility announcements, not a bug, and is noted here rather than silently worked around.

### Browser matrix

| Project | Status | Notes |
|---|---|---|
| chromium | PASS | 18/18 |
| Mobile Chrome | PASS | 18/18 |
| firefox | BLOCKED | `browserType.launch: Executable doesn't exist at /opt/pw-browsers/firefox-.../firefox` — this sandbox vendors Chromium only (documented in `playwright.config.ts`'s own header comment). Not a code defect; the config declares the project so the full required matrix exists and is documented. |
| webkit | BLOCKED | Same root cause as firefox — WebKit isn't vendored here either. |
| Mobile Safari | BLOCKED | WebKit-based; same root cause. |

### Other existing E2E coverage (`e2e/auth.spec.ts`) — checked for regressions, not new work this phase

Run for completeness since it shares infrastructure with the golden journeys; no auth.spec.ts test was modified in this phase.

- **6 PASS** — landing page essentials, sign-up form fields/validation, password reveal, empty-field disabled-submit (none need a real Supabase account).
- **11 SKIPPED** — the suite's own `test.skip(!supabaseConfigured())` guard: real-account-lifecycle tests (sign-in, sign-out, session persistence, tenant isolation) and environmentally-blocked tests (real email confirmation, magic link, OAuth, clock-dependent session refresh) correctly report as skipped rather than a fabricated pass, because this sandbox has no `NEXT_PUBLIC_SUPABASE_URL`/keys configured.
- **1 FAIL — AUTH-015** (`protected routes redirect to sign-in without a session`): expects `/app` to redirect to `/sign-in` with no session, but got `/app` directly. This is **not a regression from this session's work** — `proxy.ts`'s `authConfigured()` correctly no-ops the entire route guard when Supabase isn't configured (see `CLAUDE.md`'s own documented "legacy/no-auth mode" — acceptable for local/dev, never marketed as equivalent to real tenant isolation). The test is written for a Supabase-backed environment and correctly fails without one; this is an environment-configuration gap, not a code defect, and is unrelated to any file touched in Phases 2–5. Flagging rather than "fixing" by either changing `proxy.ts`'s documented fallback behavior or loosening the test's real assertion.

### Verification gates checked

- `npm run check` (lint, typecheck, 338 unit tests, production build) green at the point these golden journeys were run.
- No console or page errors surfaced during any Playwright run in this phase (checked across all Phase 2–4 manual verification passes; the golden-journey suite itself doesn't assert this globally, but no test failure in this report traces to a console error).
- Every new test asserts against real seeded data or a real computed value (a count, a real provenance label, a real persisted policy setting) — never a hardcoded expectation that would pass regardless of what the app actually did.
