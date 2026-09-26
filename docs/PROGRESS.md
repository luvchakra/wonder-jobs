# WonderJobs — Progress tracker

High-level status of the whole application, epic by epic. Every story from the
requirements spec (`WonderJobs_Claude_Code_Implementation_Requirements.md`) and from
later requests is listed here, done or not. Detail per requirement (the `WJ-nnn`
rows, files, verification notes and deviations) lives in
[`IMPLEMENTATION_TRACKER.md`](./IMPLEMENTATION_TRACKER.md); this page is the summary
you read first.

**Rule:** update this file (and the detailed tracker) at the end of every story,
whether the story shipped, was descoped, or is still open. Never mark a story done
before it is verified in a browser or by a test.

Legend: ✅ done · 🟡 in progress / partial · ⬜ backlog · ⛔ blocked on something outside the repo

_Last updated: 2026-09-26 — Help guide and landing brought up to date with what shipped (WJ-165): Ask Wonder and Calendar sections in `/help`, seven new FAQs, a help-assistant fix so it returns the best-matching FAQ, three new landing feature cards, and persona claims trimmed to what the product actually does. Earlier: JobsApply ("Apply with Wonder") is built: Wonder fills employer forms in the candidate's own browser through the extended WonderJobs helper, stops for what only the candidate should answer, and never submits — the candidate submits on the employer's site and confirms (WJ-156…WJ-160, `docs/JOBS_APPLY_TEST_EXECUTION_REPORT.md`). Earlier the same day: Résumé templates are built: eight ATS-friendly templates rendered from a new structured work history in the Career Profile, with PDF and Word downloads behind a validation gate (WJ-153…WJ-155, `docs/RESUME_TEMPLATE_TEST_EXECUTION_REPORT.md`). Earlier the same day: JobsLake is built: the platform job-data layer (source registry, connectors, canonical opportunities with dedupe and provenance, health, runs, credentials, audit), Protocol v1 REST/stream/MCP APIs, the admin portal at `/platform/jobs-lake`, and WonderJobs searching through it (WJ-147…WJ-152, `docs/JOBSLAKE_ARCHITECTURE.md`). Open: migration 0007 on production, `JOBSLAKE_ADMIN_EMAILS`, and a real-account run of the candidate journeys. Before that, 2026-09-24 — the outcome-based UX program (Find → Decide → Apply → Progress) is complete, now including a real-Supabase verification pass that found and fixed WJ-146 (sign-out could lose a just-completed write); see `docs/OUTCOME_UX_FINAL_AUDIT.md`. Before that: the full UX Simplification program (Phases 1–5) is now complete; see `docs/UX_FINAL_AUDIT.md` for the closing audit and final gates. Previous entries below cover stories “AI content grounding (WJ-098)”, “Honest 'not for me' learning loop (WJ-099)”, “Platform AI on any of the three vendors (WJ-100)”, “Why Was This Filtered (WJ-101)”, “Playwright E2E infrastructure + auth.spec.ts and golden-journeys.spec.ts, actually executed (WJ-102)”, “Demo mode no longer overrides a real signed-in session (WJ-103)”, “Mobile nav drawer + parallel CI (WJ-104)”, “Screen-by-screen UX audit (WJ-105, WJ-107)”, “Persistent demo-mode banner (WJ-106)”, “Vendor error detail + Gemini default model (WJ-108, WJ-109)”, “Run outcome and next step (WJ-110)”, “Search the candidate's own role, never a canned one (WJ-111)”, “Fixed the PDF resume reader misdiagnosing normal PDFs as scans (WJ-112)”, “Fixed it again on a real ATS-builder résumé — word-per-object PDFs (WJ-113)” and “Fixed the search query a real imported CV produced — a headline label and an unrecognised seniority word both starved it of results (WJ-114)”._

## At a glance

| Epic | Done | Partial | Backlog | Status |
|---|---:|---:|---:|---|
| 1. Foundation & design system | 5 | 0 | 0 | ✅ |
| 2. Accounts & sessions | 8 | 0 | 2 | 🟡 Google needs provider config; custom SMTP recommended |
| 3. Onboarding & Career DNA | 4 | 0 | 0 | ✅ |
| 4. Job discovery (real sources) | 7 | 0 | 2 | ✅ |
| 5. Matching, quality & explanations | 4 | 0 | 0 | ✅ |
| 6. Run Wonder (workflow engine) | 10 | 0 | 0 | ✅ |
| 7. Applications & materials | 6 | 0 | 1 | ✅ |
| 8. Automation & scheduling | 7 | 1 | 0 | 🟡 cron cadence capped by the Vercel plan |
| 9. AI providers (BYOK + platform) | 8 | 0 | 1 | ✅ |
| 10. Persistence & sync | 4 | 0 | 0 | ✅ |
| 11. Landing & marketing site | 12 | 0 | 0 | ✅ |
| 12. Help center & support | 6 | 0 | 0 | ✅ |
| 13. Secondary product areas | 8 | 3 | 2 | 🟡 early versions |
| 14. Quality, accessibility, performance | 10 | 0 | 1 | ✅ |
| 15. Operations & release | 5 | 0 | 2 | 🟡 |

## JobsApply — Apply with Wonder (complete, 2026-09-25)

- ✅ **Domain + sessions** (WJ-156): state machine, classifier, mapper, destination protection, readiness and duplicates; server-owned sessions with tenant checks and session-scoped revocable helper tokens; `fill_application` capability through `resolveCapability`.
- ✅ **Web** (WJ-157): Apply with Wonder preflight, live session and Needs-you queue, grounded AI drafts, guided mode and pack export, candidate confirmation into Applications, dashboard, remembered answers.
- ✅ **Browser helper** (WJ-158): the existing extension, extended — structure-only reading, gated fill, Stop, domain/CAPTCHA/MFA/sign-in/payment handling, submission evidence; structurally unable to submit.
- ✅ **Admin** (WJ-159): `/platform/jobs-apply` adapters, domain policies, counts-only outcomes.
- ✅ **Tests** (WJ-160): 75 unit/API + 20 Playwright with the real helper on mock portals.
- ⬜ Backlog: Chrome Web Store listing and Chrome side panel; authorized application APIs where a provider grants them; confirmation-email evidence; live-portal adapter monitoring. Auto-submit is deliberately not planned (CLAUDE.md).

## Résumé templates (complete, 2026-09-25)

- ✅ **Career history** (WJ-153): roles, education, certifications, projects, publications and contact details in the Career Profile, each with provenance.
- ✅ **Document, templates, layout, renderers** (WJ-153): ResumeDocument from the profile only; eight versioned templates; deterministic pagination; SVG preview = PDF; DOCX.
- ✅ **Résumé Studio** (WJ-154): gallery, recommendation, preview, generation with validation gate, PDF/DOCX, My resumes, job-specific version from the Application Pack.
- ✅ **Tests** (WJ-155): 304 unit + 30 Playwright + 9 visual baselines.
- ✅ **Rendering QA pass** (WJ-164): all 8 templates × 8 profiles rendered to PDF and DOCX, then read back, rasterized and reviewed. 14 defects fixed, including an emoji printed as "?", doubled bullets, near-empty last pages, Career Shift repeating its achievements, squeezed titles and DOCX spacing. Now: 64/64 clean PDFs, DOCX paginates like the PDF in 64/64, preview matches the PDF to the pixel; 11 regression tests.
- ⬜ Backlog: two-column layouts, importing roles from an uploaded résumé, Letter page size preference.

## JobsLake — platform job acquisition (built, 2026-09-25; production rollout pending)

- ✅ **Protocol v1 domain** (WJ-147): canonical opportunity, dedupe with per-field provenance, SSRF policy, source detection, response mapping, search planner (Fast / Balanced / Maximum coverage), run-derived health and alerts.
- ✅ **Server core** (WJ-148): built-in sources wrap today's fetchers (job ids unchanged); ATS boards, JSON APIs, feeds, structured pages, MCP tools; failure isolation; warm pool; encrypted credentials; audit. Partnership portals listed as Do not use; no scraping.
- ✅ **APIs** (WJ-149): REST v1 + NDJSON stream + MCP (off by default) on one implementation; admin API with allowlist that fails closed.
- ✅ **WonderJobs integration** (WJ-150): streamed search with per-source evidence and breadth, JobsLake dedupe, visible fallback, scheduled runs, "Where this job was found" on job detail, contribution telemetry.
- ✅ **Admin portal** (WJ-151): 13 sections, real metrics only, mobile cards, confirmed destructive actions.
- 🟡 **Verification** (WJ-152): unit + API tests green; 23/23 runnable Playwright journeys pass on a production build; the six signed-in candidate journeys (×2 projects) are written but BLOCKED until a run with a disposable Supabase account is approved.
- ⛔ **Rollout**: apply migration `0007_jobslake.sql` to production and set `JOBSLAKE_ADMIN_EMAILS` (until then JobsLake keeps its history in memory and says so).

## Outcome-based UX — Find → Decide → Apply → Progress (complete, 2026-09-24)

- ✅ **Baseline, capability map, architecture** (WJ-138). `docs/OUTCOME_UX_BASELINE.md`, `OUTCOME_UX_CAPABILITY_MAP.md`, `OUTCOME_UX_ARCHITECTURE.md`.
- ✅ **Find** (WJ-139). One natural-language box, prefilled from the candidate's own goal; shows what it read and where from before running; plain-language progress that only ticks real finished work; "Your search is ready" with real fit counts and "new since last search"; "Wonder needs your input", pause/stop/"Search again"/"Recheck these opportunities"; everything technical under "See how Wonder worked". Scheduling is "How often should Wonder look?"; levels are Help me / Work with me / Work independently / Keep watch.
- ✅ **Decide** (WJ-140). Cards say why Wonder surfaced a job, what to consider, and the next step — only from computed reasons and signals; compare 2–4 jobs without a winner; hidden jobs say why, with Show it anyway / Change preference.
- ✅ **Home progress** (WJ-141). "Your progress" from real applications; "Wonder is working · Next search …" only with a real schedule.
- ✅ **Apply** (WJ-142). Application Pack opens with "Application ready" built from materials that actually exist and who wrote them; honest drafting status replaces staged fake steps; "The final action is yours."
- ✅ **Ask Wonder outcome intents** (WJ-143). Find, search again, change preferences, explain a job, explain a filtering decision, prepare the strongest, today's priorities, application progress. 🟡 One spec example ("Show only roles where I match the seniority") not built — no seniority filter exists to route to.
- ✅ **Real Supabase verification** (WJ-146). Once credentials were available, ran the full account-dependent block of `auth.spec.ts` against the real project — disposable, pre-confirmed accounts via the admin API, deleted afterward, no real email sent, no real tenant data touched. 13/13 runnable tests pass. Caught and fixed a real bug this way: `signOutEverywhere()` wiped local storage and revoked the session before a still-debounced write (e.g. `completeOnboarding()`) reached the server, so it could be lost — exactly the class of regression no demo-mode journey exercises, since none of them sign out. `flushRemote()` is now awaited before sign-out in both places that call it.
- ✅ **Career Profile trust** (WJ-144). Résumé import shows conflicts side by side and never overwrites a confirmed value unticked; "Career Profile" in all visible copy.
- ✅ **Verification** (WJ-145). 30 outcome journeys + 18 golden journeys: 96/96 on a production build across chromium + Mobile Chrome; 408 unit tests; axe clean at serious+ with every outcome screen audited. ⛔ Firefox/WebKit still blocked in this sandbox (no browsers). Real-account auth E2E is no longer blocked — see WJ-146 below.

## UX Simplification — Phase 2: Core Candidate Experience (complete, 2026-09-23)

- ✅ **2.1 Home/Today redesign.** Home now answers "what deserves my attention today?" instead of showing a feature-dump dashboard: Opportunities (real strong/worth-considering jobs not yet acted on), Applications (real follow-ups due, interviews soon, ready-for-review, employer responses), Career (real profile gaps — missing goal/skills, an unreviewed learned signal), and Wonder activity (the active run, or the most recent finished run's own real summary line — never an invented count). Sections only render when they have content; the empty state only claims Wonder "is monitoring" when a schedule is actually enabled. Shared between desktop and mobile via one pure, unit-tested function (`domain/career/attention.ts`) so the two views can never disagree.
- ✅ **2.2 Goal-oriented onboarding.** Step 0 now opens with "What would you like Wonder to help you with?" (5 real options) instead of generic feature bullets; the choice is required and decides where onboarding sends the candidate next (when nothing more specific was already requested via `?next=`) — never an assumed default. No LinkedIn step: see the scope note above.
- ✅ **2.3 Find Jobs.** Jobs list now has 3 primary views — For You / All Jobs / Saved — implemented as presets over the existing filter state so they can never disagree with the "Why Was This Filtered" breakdown; advanced filters (fit override, freshness, salary, sources) live behind a renamed "Refine" panel. Fixed two real gaps the Phase 1 audit flagged along the way: job cards only had Save, not "not for me" (added a one-click icon, reusing the existing reject/undo/toast pattern), and match scores showed as a bare "96% match" instead of the evidence-based fit label (now shows "Strong Opportunity" etc., with the percentage on hover and on the "Why it's a match" tab).
- ✅ **2.4 Application Pack.** `app/app/applications/[id]/prepare` is now titled "Application Pack" and gives each application one coherent workspace: resume/cover letter/answers tabs (unchanged, already unified), a real fit summary, a "missing candidate information" card (shared with the browser extension so the two can't disagree), and a "Review Application" shortcut. The terminal action is renamed "Continue to Employer" and now actually performs the hand-off (opens the employer's real application URL in a new tab) with honest copy about what did and didn't happen — replacing a more passive, less accurate "Mark ready for submission" label.
- ✅ **2.5 Applications timeline-first view.** `/app/applications` now defaults to a Timeline: a "Needs attention" section (the same real computation Home uses — due follow-ups, interviews soon, ready-for-review, employer responses) above a 4-column real pipeline (Preparing/Applied/Interview/Outcome). The previous tab/list view is kept, one toggle away, for anyone who wants the flat CRM-style list. No fabricated "recruiter contacted" stage — a real recruiter-response event shows as a badge on an Applied card instead.
- ✅ **2.6 Career Profile unification.** `/app/career-dna` is now organized into Career direction, Experience, Skills, Preferences, Strengths & growth areas, Resume, Sources, and Needs confirmation — one page, spec's vocabulary. "Experience" and "Sources" both carry an honest disclosure of their real limits (no field-by-field employment history; per-field provenance isn't tracked) rather than implying more than the data supports. No LinkedIn import UI was added — none exists to build against (see the scope note above) — but the page now says so explicitly under Sources instead of staying silent about it.
- ✅ **2.7 Acceptance.** Full regression pass on the combined state: `npm run check` green (lint, typecheck, 307 unit tests, production build of all 59 routes), the demo-mode Playwright suite (`e2e/golden-journeys.spec.ts`, 10 tests) green — one test was updated (not silenced) because it encoded the *old* Applications default the redesign deliberately replaced; a fresh, non-demo onboarding run was driven end-to-end and its values confirmed to persist into the real Career DNA store with the chosen goal routing correctly; responsive checks at tablet width (768px) showed clean reflow with no overflow. A first-time candidate can now: understand the product from the landing page, build a Career Profile through goal-oriented onboarding, find relevant jobs with an evidence-based fit label instead of a bare score, see why each job is shown (and why others are filtered), prepare an Application Pack and hand off to the employer, and track every application on a real, prioritized timeline.
- **Scope note:** the Phase 2 spec assumes "supported LinkedIn data" feeding onboarding and the Career Profile. Phase 1's audit confirmed LinkedIn has no public API and no integration exists anywhere in the codebase — this is deliberate and disclosed (see `docs/UX_BASELINE_AUDIT.md` §7), not a gap. Career Profile unification proceeds with Resume import + manual entry only; the LinkedIn UI slots (Current/Suggested/Why/Evidence) are omitted rather than faked, per the project's real-data-only rule and this spec's own "never fabricate candidate facts" instruction.

## UX Simplification — Phases 3–5: Wonder/Automation, Mobile/Migration, Final QA (complete, 2026-09-24)

- ✅ **4.1 Primary nav restructure.** The app now has exactly 5 primary destinations everywhere — Home, Jobs, Applications, Career, Wonder — on desktop sidebar, tablet collapsed rail, and the mobile bottom bar (which now shows all 5 directly, no "More" 6th tab). Automation (Scheduled Runs, Automation Settings) is grouped under "Wonder"; Insights, Resume Studio, Interview Prep and Learning are grouped under "Career". Calendar has no nav slot at all (by design, per the Phase 1 IA decision) but stays reachable from Home's "Upcoming" and the command palette. No routes changed, so no redirects were needed — this was purely a navigation/grouping change, not a URL change.
- ✅ **3.2 Automation-level relabeling.** The 4 automation levels now answer "How much should Wonder do for you?" in plain language — Assist me / Work with me / Work independently / Keep working — instead of internal jargon (Assist/Guided/Autonomous/Continuous), with each description stating exactly what changes at that level and reaffirming Wonder never submits to an employer, messages a recruiter, or sends email on its own. Underlying level ids and `resolveCapability`'s gating logic are unchanged, so no persisted candidate state moves.
- ✅ **3.1/3.3 Ask Wonder real natural-language interface + natural-language scheduling.** "Ask Wonder anything…" no longer just fuzzy-matches page names — it's a deterministic pattern-based intent router (not a chatbot: no model call, no free-text reply, no hidden reasoning) that recognizes a fixed set of real questions and resolves each against the candidate's own live data: "what applications need my attention" (real count, reusing the same computation Home/Applications already show), "what skills am I missing" (a real gap between the candidate's Career DNA and the skills their own strong/worth-considering matches ask for — never a canned list), "improve my linkedin headline" (an honest LinkedIn-not-connected redirect to Career Profile, not a fabricated feature), "why isn't the Stripe job showing" (names the specific active filter hiding it, or says honestly it isn't in the catalog at all), and "search for backend engineer roles weekly" (natural-language scheduling: picks the closest real schedule template by the frequency word used and hands the candidate's own search text into the New Scheduled Run form as an editable starting value — nothing is created until the candidate reviews and confirms it themselves). Anything that doesn't match a specific pattern still falls back to a plain job search, exactly as before.
- ✅ **3.6 Remaining misleading-action-copy fixes.** Fixed the two highest-priority drift cases the Phase 1 audit found plus one more discovered while fixing them: the apply-stage confirmation modal (`ActionApprovalList`) no longer claims to "submit" — it says "Continue to the employer's site?" and reuses the hand-off action's own accurate label; the follow-up/thank-you email confirmation (`FollowUpAction`) no longer claims Wonder sends or delivers anything — it's now an explicit hand-off (draft → copy → send yourself → mark as sent), with a new Copy button and disclosure text explaining Wonder has no recruiter/employer email address to send to; and `CAPABILITY_META`'s descriptions for the three external-effect capabilities (`send_recruiter_message`, `submit_application`, `send_email`) no longer overclaim. Also fixed two smaller bugs surfaced along the way: the apply stage's workflow-timeline line always showed "0 submitted" (read the wrong counts key) and scheduled-run notifications linked to a nonexistent singular `/app/run/{id}` route.
- ✅ **4.2 Visual state matrix audit.** All 13 required states (loading/empty/success/warning/error/disabled/waiting-for-user/running/paused/stopped/completed/completed-with-warnings/failed) audited against the real implementation and written up in `docs/UX_VISUAL_STATE_MATRIX.md`. Confirmed one shared state machine drives run and stage status alike with a human label and a distinct icon per state (never color alone), and no raw enum value ever reaches a screen. One real gap fixed: `Toast` had no `warning` tone, so a genuine warn-before-proceeding message in the schedule builder was shown as neutral "info" — added the tone and moved that one call site to it.
- ✅ **4.3/4.4 Migration guardrails + capability preservation.** Verified every pre-redesign route still exists (checked against the build's own route table — nothing moved, so no redirects were needed) and cross-checked every row of `docs/UX_CAPABILITY_MAP.md` against the current code. Two previously undetected real defects fixed along the way: the job detail Company tab's "Startup" fallback for an unrecognized company (a real-data-only violation the original audit flagged as High, now says "Company size not listed"), and "Show me anyway" not disclosing that it never un-hides a job marked "not for me" (now says so explicitly). Also fixed a demo-seed string implying a "LinkedIn" job source that doesn't exist. Full breakdown, including the handful of pre-existing gaps outside this session's scope that are documented rather than silently dropped, in `docs/UX_MIGRATION_VERIFICATION.md`.
- ✅ **Mobile responsive verification.** Checked 12 primary screens plus the Ask Wonder and FollowUpAction modals at a real 390×844 viewport for horizontal overflow (none found), confirmed the bottom nav and drawer never drift from each other, and drove the full Application Pack flow on mobile end-to-end. One real defect found and fixed: Run Wonder's "Continue" button used `position: sticky` inside the scrolling card column and could paint over the AI Provider/Search Details cards near the bottom of a mobile-height viewport — verified with real scroll-position screenshots, fixed by making it a genuinely fixed bottom bar with reserved padding beneath it, desktop unaffected. Full writeup in `docs/UX_MOBILE_VERIFICATION.md`.
- ✅ **Phase 5 golden journeys.** Added 8 new E2E tests (GJ-011..GJ-018) closing the gap between the pre-existing suite's coverage and all 11 required journey categories (new candidate, find job, search, application, tracking, Ask Wonder, automation, intervention, advanced mode, mobile, trust). 36/36 pass across chromium + Mobile Chrome. Full mapping, browser-matrix status (firefox/webkit/Mobile Safari BLOCKED — not vendored in this sandbox) and a pre-existing, out-of-scope `auth.spec.ts` environment gap are documented in `docs/TEST_EXECUTION_REPORT.md`.
- ✅ **Phase 5 final audit.** `docs/UX_FINAL_AUDIT.md` closes out the whole program against its own questions (simplicity, discoverability, capability preservation, agent experience, trust, automation, power users, Career Profile, Jobs, Applications, mobile) and an explicit final-gates checklist. Every gate this sandbox can verify passes (build/typecheck/lint/338 unit tests/36 Playwright tests/no P0-P1 defects/capabilities reachable/no fabricated facts/no false external-action claims/candidate approval controls intact/accessibility & responsive & mobile). Three residual items are disclosed rather than hidden: the full firefox/webkit/Mobile Safari matrix and `npm run a11y` aren't runnable in this sandbox (no vendored browsers beyond Chromium; a11y needs real Supabase + time), and the signed-out job-teaser redirect was verified by code inspection rather than a live click-through (no Supabase configured here).

**UX Simplification program: complete.** All 5 phases shipped, verified (`npm run check` green throughout, 338 unit tests, 36 Playwright E2E tests across chromium + Mobile Chrome), and documented across `docs/UX_BASELINE_AUDIT.md`, `UX_CAPABILITY_MAP.md`, `UX_SIMPLIFICATION_DECISIONS.md`, `UX_VISUAL_STATE_MATRIX.md`, `UX_MIGRATION_VERIFICATION.md`, `UX_MOBILE_VERIFICATION.md`, `TEST_EXECUTION_REPORT.md` and `UX_FINAL_AUDIT.md`.

## UX Simplification — Phase 1 baseline audit (2026-09-23)

- ✅ **Step 1 (baseline audit + capability map) complete.** `docs/UX_BASELINE_AUDIT.md` inventories all 25 requested capability areas against the actual `main` branch (verified in code, not inferred from this tracker or the spec); `docs/UX_CAPABILITY_MAP.md` gives every capability a Keep/Relocate/Replace disposition against a new 5-item primary nav (Home/Find Jobs/Applications/Career/Wonder); `docs/UX_SIMPLIFICATION_DECISIONS.md` documents the target experience architecture, progressive-disclosure mapping, and the decisions needed to reconcile audit findings with it. Screen migration (Step 2) has not started.
- The audit surfaced several **real defects independent of the redesign**, most notably: misleading confirmation-modal copy claiming the `apply` stage "submits your application" when it structurally never does (pure hand-off — confirmed safe, just mis-described); a mocked follow-up-email "send" whose confirmation copy claims real delivery; the job-detail Company tab fabricating "Startup" for real companies not in the demo catalog (a real-data-only rule violation); and the signed-out job-teaser flow (previously logged as done, WJ-115/116) being fully built and tested but structurally unreachable from a real shared link. Full list in the baseline audit's "Consolidated list of verified defects" section.
- These are tracked for follow-up, not yet fixed — see the open questions at the end of `docs/UX_SIMPLIFICATION_DECISIONS.md` for sequencing.

## 1. Foundation & design system (spec §2–4)

- ✅ Monorepo (`apps/web`), Next.js 16 App Router, TypeScript, Tailwind v4 tokens — WJ-001..003
- ✅ Motion utilities: reduced-motion, low-power hint, ScrollReveal, keyframes — WJ-004
- ✅ Desktop sidebar, top bar, mobile bottom nav, command field — WJ-005, WJ-006
- ✅ Shared states (loading / empty / error), toasts — WJ-057, WJ-058
- ✅ Official logo rolled out across the app in light and dark ink, with generated favicon/PWA icons — WJ-092

## 2. Accounts & sessions (spec §5, later requests)

- ✅ Sign-up / sign-in with email + password or magic link (Supabase Auth, PKCE) — WJ-063
- ✅ Cookie sessions verified server-side; proxy guards `/app/*` and `/onboarding`; API routes 401 without a session
- ✅ Per-user state namespaces; sign-out revokes, clears and forgets local copies
- ✅ Demo mode under the avatar menu (`/demo`, `/demo/exit`, deep links `/demo?next=/app/jobs`)
- ✅ A persistent demo-mode banner, visible on every `/app/*` screen (not just the avatar menu), with a one-click "Exit demo & sign in" — WJ-106
- ✅ A real session always wins over a leftover demo cookie — fixed a real bug where trying the demo before signing in kept showing seeded demo data under a real account, since demo mode was checked before the signed-in session and sign-in never cleared it — WJ-103
- ✅ Forgot password → emailed recovery link → `/reset-password` → signed in (25-check Playwright run, incl. single-use token, expired link, mismatch, old-password rejection) — WJ-079
- ✅ Password reveal toggle on sign-in, sign-up and reset — WJ-080
- ✅ "Continue with Google" on sign-in and sign-up (OAuth via Supabase, friendly message until the provider is enabled) — WJ-081
- ✅ Friendly auth errors (unconfirmed email, wrong password, rate limits, mailer refusals)
- ⛔ Google provider enablement: needs a Google Cloud OAuth client and the Supabase provider switched on (operator step, see README)
- ⬜ Custom SMTP: Supabase's built-in mailer only sends to project members and ~2 mails/hour; connect a provider before real sign-ups

## 3. Onboarding & Career DNA (spec §5.1, §6)

- ✅ 4-step onboarding writing real Career DNA (goal, level, years, skills, industries, locations, "about you")
- ✅ Career DNA page with editing; matches re-scored on every change
- ✅ New accounts start empty (no invented history); onboarding gated in the app shell
- ✅ Import Career DNA from a resume: PDF / Word / pasted text, every suggestion shown with the words it came from, applied only when the candidate ticks it; the file is never stored — WJ-095
- ✅ Fixed the PDF reader wrongly rejecting normal, text-based resumes as scans: a stream-scanning bug lost every stream after the first (so an embedded font's ToUnicode data was never found), and glyph-code text from a subsetted font wasn't decoded to real characters at all — both fixed and verified against real Chromium-generated PDFs — WJ-112
- ✅ Fixed the same error recurring on a real ATS-builder résumé: that generator draws every word as its own text object and signals a new line only via the page's coordinate transform, not the vertical move the reader assumed every generator used — now handles both conventions and correctly fills name, headline, experience, level, skills and industries from the user's own CV — WJ-113
- ✅ Fixed a run on that same imported CV failing "No jobs matched your search" for any query: the auto-derived search read a headline's own meta-label ("Target: Senior Director…") as a literal search term, and treated "SVP" as a required title word instead of a seniority level — both fixed, verified with real live-source calls returning real postings instead of zero — WJ-114

## 4. Job discovery — real sources (spec §8–9, "don't show dummy data")

- ✅ Server-side source adapters: Greenhouse / Lever / Ashby company boards, Jobicy, Remote OK, Himalayas, Arbeitnow, Remotive, Adzuna India (keys) — `server/jobs/providers.ts`
- ✅ `/api/jobs/search` + `/api/jobs/sources` with per-source evidence ("Needs setup" for credentialed sources)
- ✅ Deterministic normalizer (skills, seniority, industry, work mode, salary) with unit tests
- ✅ De-duplication across sources; catalog persisted per account (top 300 + saved)
- ✅ Jobs list with debounced search, filters, sort, paging — WJ-025..027
- ✅ Save / not-for-me, reflected everywhere — WJ-030
- ✅ Free-text job search from the global command field
- ✅ Shared job links (`/app/jobs/<id>`) work signed-out: `/sign-in`/`/sign-up` show that specific job's full real detail (re-derived from its id via `server/jobs/lookup.ts`, no public jobs store) — description, requirements, company, hiring-quality signals, in the same tabbed layout a signed-in candidate sees — with only the genuinely personal parts (match score, save, apply) locked and explained as needing an account — WJ-115, WJ-116
- ⬜ Adzuna keys on the deployment (operator step)
- ⬜ LinkedIn / Indeed / Naukri / Glassdoor: no public APIs; not claimed, not searched

## 5. Matching, quality & explanations (spec §10–11)

- ✅ Explainable per-dimension Wonder Fit with labels (never a bare score) — WJ-028
- ✅ Calibration on live postings: stem-aware skill matching, pay-unknown neutral, remote-region cap, thresholds 82/68/55
- ✅ Evidence-based quality signals with confidence language (no "ghost job" claims) — WJ-029
- ✅ "Why it's a match" and "Sources & signals" tabs on job detail
- ✅ "Not for me" actually influences future ranking: 3+ same-reason rejections become a bounded, dismissible ranking signal (previously the toast claimed this and nothing read the data) — WJ-099
- ✅ "Why Was This Filtered": a breakdown panel above Jobs results (and in place of a blank empty state) attributing every hidden catalog job to the specific active filter hiding it, with "Show me anyway" and "Change my preferences" — WJ-101

## 6. Run Wonder — workflow engine (spec §7, §12–15)

- ✅ Run setup (goal, automation level, provider, search details) — WJ-009
- ✅ Explicit state machine with validated transitions (unit-tested) — WJ-018
- ✅ Live stage progress from real engine state — WJ-011
- ✅ Pause / resume, graceful stop preserving outputs — WJ-012, WJ-013
- ✅ Rerun from a stage with shared idempotency ledger — WJ-014
- ✅ Manual stage overrides with provenance badges — WJ-015, WJ-016
- ✅ Waiting-for-user survives a closed tab; Continue re-runs the gated stage — engine `hydrate` / `continueFromUser`
- ✅ Pending approvals on Continue are recorded as "not approved" ("Continue without N pending")
- ✅ Apply stage is an audited hand-off (Wonder never submits on an employer's site)
- ✅ Run history with stage-by-stage detail — WJ-017
- ✅ Every finished run ends with a plain-words outcome and the next action (review prepared applications, finish hand-offs, browse the catalog / refine Career DNA when nothing passed the match threshold, rerun) instead of a bare timeline — WJ-110
- ✅ The search query comes from the candidate's own headline/goal (never a canned "product manager"), Continue waits until there is one, and every run states what it searched, where and across which live sources — WJ-111

## 7. Applications & materials (spec §16–19)

- ✅ Applications dashboard with status tabs and deep links — WJ-031
- ✅ Application timeline — WJ-032
- ✅ Prepare flow: resume, cover letter, screening answers, review — WJ-033..036
- ✅ Artifact editor: rich-text (rendered, not raw markdown), autosaving as you type, regenerate, compare, restore versions — WJ-118
- ✅ "Open application page" + "Mark as submitted" + submission reminder
- ✅ Download the current resume/cover letter as a real .docx, client-side, no dependency — WJ-119
- ✅ Chrome extension that fills employers' application forms (Greenhouse/Lever/Ashby + generic) with the prepared materials; install from the landing page, `/extension` or the application page — WJ-120
- ✅ Follow-up / thank-you emails: draft → confirm → execute-once → audit — WJ-064
- ⬜ Email delivery: a mail provider (the send step is the seam)

## 8. Automation & scheduling (spec §20–24)

- ✅ Automation levels with risk-based capability gating (unit-tested) — WJ-019
- ✅ Automation policy page (automatic / ask me / off per capability) — WJ-020
- ✅ Scheduled runs: list, enable/disable, run now, duplicate, delete — WJ-021
- ✅ Schedule builder and 5 workflow templates — WJ-022, WJ-023
- ✅ Silent outcome when a schedule's condition is not met — WJ-024
- ✅ Server-side cron fires due schedules with the app closed: `/api/cron/scheduled-runs`, one run per tenant per tick, `nextRunAt` advanced before the run so nothing re-fires in a loop — WJ-094
- ✅ Schedule times evaluated in the schedule's own timezone, DST-aware (unit-tested) — WJ-094
- 🟡 Cadence is capped by the Vercel plan: Hobby allows one cron run a day, so it ships as a daily backstop and the browser still fires schedules on time while a tab is open. `CRON_INTERVAL_MINUTES` ≤ 60 (Pro) hands scheduling to the server outright and the client ticker stands down. Neither can double-fire — one shared `isDue` rule.

## AI content grounding (WJ-098)

- ✅ `TemplateAIService` (the deterministic draft every candidate sees without a configured model, and the seed a real model is asked to refine) no longer fabricates candidate facts: an invented "Experience highlights" section, an invented "shipped end to end" story, an invented notice period, and an invented second industry are now `[bracketed placeholders]` or omitted — see `docs/AI_GROUNDING_REPORT.md`
- ✅ Regression fix: `generateCoverLetter` crashed for a candidate with zero industries set (`dna.industries[0].toLowerCase()`) — a real minimal-profile crash, not just a wording issue
- ✅ 14 deterministic grounding tests against minimal and evidenced candidate fixtures
- ⬜ Resume "Experience" section still can't be grounded automatically — Career DNA has no employment-history field (no companies/titles/dates); needs the resume-import extraction model extended, not an AI-service change

## 9. AI providers — BYOK and platform (spec §25–27, request #1)

- ✅ Provider abstraction; app code never calls a vendor SDK directly — WJ-037
- ✅ WonderJobs AI used by default for every account (platform key `WONDERJOBS_AI_KEY`); template fallback clearly labelled — WJ-038, WJ-082
- ✅ Platform key runs on any of the three vendors, operator's choice: `WONDERJOBS_AI_PROVIDER=anthropic` (default, `claude-sonnet-5`) / `openai` (`gpt-5-mini`) / `gemini` (`gemini-2.5-flash`) — previously hardcoded to Anthropic in both call sites despite BYOK already supporting all three — WJ-100
- ✅ Anthropic / OpenAI / Gemini BYOK adapters — WJ-039..041
- ✅ Keys encrypted at rest (AES-256-GCM), masked on read, per-tenant, revocable — WJ-062
- ✅ Failure handling with retry / change provider / switch to WonderJobs AI — WJ-042
- ✅ Usage transparency (tokens, cost, request log) — WJ-043
- ✅ AI settings page tells operators exactly which environment variable to set (no admin page exists) — WJ-082
- ✅ Help assistant uses the platform model when configured, retrieval otherwise
- ⬜ Platform admin page (usage across accounts, key rotation from the UI)

## 10. Persistence & sync (request "wire it up to Supabase")

- ✅ Dedicated `wonderjobs` schema, RLS on, service-role only; migrations 0001–0003 bundled with a drift test
- ✅ Local-first store hydration, one batched `GET /api/state`, dirty tracking, batched `PUT` via `put_state` RPC
- ✅ Audit table for external actions; contact messages table (0003)
- ✅ `POST /api/admin/migrate` applies bundled migrations from the deployment

## 11. Landing & marketing site (spec §28–34, request #7)

- ✅ Scroll-linked parallax hero (rAF, transforms only, reduced-motion aware) — WJ-045, WJ-046
- ✅ Staged hero entrance animation and floating dashboard card — WJ-083
- ✅ Source strip (only sources actually searched), agent section, journey story, feature grid — WJ-047..050
- ✅ Device showcase: desktop + phone frames for Home / Jobs / Runs / Applications with scroll-linked lift, each deep-linking into the demo — WJ-084
- ✅ Personas (labelled illustrative), provider section, final CTA — WJ-051..053
- ✅ No "watch video" CTA anywhere; hero secondary CTA opens the live demo
- ✅ Contact section at the end: form → `/api/contact` → `wonderjobs.contact_messages` (honeypot, rate limit, honest local-mode message) — WJ-085
- ✅ Contact email notifications: `CONTACT_NOTIFY_EMAILS` (comma-separated) + optional `RESEND_API_KEY`; logged instead of sent when no key — WJ-089
- ✅ Footer with Product / Resources / Company / Account columns and a legal row, every link real — WJ-054
- ✅ About, Privacy, Terms, Security, Cookies pages — WJ-086
- ✅ Browser-extension section + `/extension` install page — WJ-120
- ✅ Link previews: branded 1200×630 `opengraph-image`, `metadataBase` for absolute URLs, per-page og:title, and a shared job link that previews the real role — WJ-121
- ✅ Nav links to Screens, Help and Contact
- ✅ Landing visual QA at desktop and mobile — WJ-071
- ✅ Demo links wherever a screen has a demo counterpart
- ✅ Landing brought up to date with what shipped (WJ-163): JobsLake employer boards in the source strip, résumé templates, Apply with Wonder (fills the form, leaves what's yours, you submit), Keep watch; control table adds "Fill the employer's application form" from the real policy gate; marketing nav collapses to the menu below 1024px
- ✅ Landing refresh (WJ-165): feature grid adds Track every application, Share a role and Your calendar and phone; mentions speaking your search and Word downloads; personas trimmed to claims the product backs (no employer-time-zone follow-ups, internship labels, deadline tracking or relocation matching)

## 12. Help center & support (request #5)

- ✅ `/help`: user guide (16 sections) + FAQ, sticky section nav, public — WJ-087; brought up to date with what shipped (WJ-165): new Ask Wonder and Calendar, notifications and the app sections, seven new FAQs
- ✅ Help assistant returns the best-matching FAQ in a section, not the first one sharing a few words (WJ-165)
- ✅ "Get Help" in the avatar menu and on the profile page
- ✅ Help assistant chatbot: answers from the guide and links the matching section; platform model when configured — WJ-088
- ✅ `/api/help/ask` (retrieval + optional model, rate-limited, public)
- ✅ Roadmap / known limitations published in the guide (kept in sync with this file)
- ✅ Public with no sign-in, and linked from the landing nav and footer, the app sidebar and command palette, the auth and reset screens, onboarding and the 404 page — WJ-093

## 13. Secondary product areas (spec §35–38)

- ✅ Profile & settings, notifications from real follow-ups/interviews
- ✅ Calendar built from follow-ups, interviews and schedules
- ✅ Insights, Learning, Resume Studio, Interview Prep pages exist and organise real data
- ✅ Global command field, keyboard navigation, dialogs
- ✅ Mobile dashboard (spec §6) and run status card
- ✅ Mobile nav drawer: hamburger (top left of TopBar) or the bottom bar's "More" tab opens the same full menu the desktop Sidebar shows (Calendar, Career DNA, Insights, Automation, Resources — not just the 4 bottom-bar shortcuts), closed by default, closes on navigating, Escape or backdrop tap — WJ-104
- ✅ Upgrade / Pro records interest only (no billing connected) — stated in the UI
- 🟡 Resume Studio: organises materials; deeper AI coaching planned
- 🟡 Interview Prep: prep packs; mock-interview AI planned
- 🟡 Insights: derived from real runs/applications; trend history grows with use
- ✅ Calendar subscribe feed: signed, cookie-less iCalendar URL that Google/Outlook/Apple Calendar poll — real interviews, follow-ups and scheduled runs, no OAuth app to register — WJ-091
- ⬜ Two-way calendar sync (writing back to Google/Microsoft) — needs an OAuth client per provider
- ✅ PWA installability: manifest, generated icons (192/512/maskable), "Install app" in the avatar menu (Chromium only — iOS/Firefox have no install-prompt API, so nothing renders there rather than faking it), a deliberately non-caching service worker (this app is local-first and real-time already; a caching SW would risk stale job/application data) — WJ-090
- ✅ Push notifications: RFC 8291/8292 Web Push with no dependency (verified against the RFC's own test vector), per-browser subscriptions in Postgres, opt-in from Profile, delivered by the scheduled-run cron — WJ-096
- ✅ Follow-up and interview reminders are raised by the cron too, so they arrive with the app closed; the browser still raises them while open and neither repeats the other — WJ-097

## 14. Quality, accessibility, performance (spec §39–47)

- ✅ 40 unit tests (engine, policy, normalizer, migrations, matching, contact notifications) — WJ-072, WJ-073
- ✅ Playwright end-to-end scripts: auth + demo, full run, review restore, forgot password
- 🟡 Real `@playwright/test` E2E suite (`apps/web/playwright.config.ts` + `apps/web/e2e/`, distinct from the ad-hoc scripts above): `auth.spec.ts` (18 tests, real Supabase accounts, no mocking) and `golden-journeys.spec.ts` (7 tests, demo mode — jobs, job detail/match, not-for-me, applications, run Wonder) both actually executed against chromium — 20 passed, 5 honestly skipped, 0 failed across both files, stable across repeated runs. Firefox/WebKit BLOCKED (no binaries in this sandbox). Found and fixed a real defect along the way: `GET /demo` was mutating session state (entering demo mode, which bypasses the sign-in requirement) on Next.js's automatic Link-prefetch request, not just on a real visit. See `apps/web/docs/TEST_EXECUTION_REPORT.md`. Automation, Career DNA editing, BYOK/AI settings and PWA/push flows still have no E2E coverage
- ✅ Security QA of BYOK routes and cross-tenant isolation — WJ-074
- ✅ Keyboard navigation, reduced motion, screen-reader workflow states — WJ-059..061
- ✅ Performance pass: local-first hydration, batched sync, React Compiler, `bom1` functions, static id routes — WJ-077
- ✅ Analytics events per spec §47 with secret filtering — WJ-068
- ✅ Mobile and desktop visual QA — WJ-069, WJ-070
- ✅ `npm run check` (lint, typecheck, tests, build) green before every push — WJ-076
- ✅ Automated accessibility audit: `npm run a11y` (axe-core, 18 pages, reduced-motion emulated), 0 violations — WJ-075
- ⬜ Wire `npm run a11y` into CI (it needs a Chromium binary the repo doesn't vendor; run locally with `npx playwright install chromium` first, or reuse an existing install via `PW_CHROMIUM_PATH`)
- ✅ Screen-by-screen UX audit for legible required fields and reversible actions, now covering every screen — WJ-105, WJ-107. Found and fixed real bugs beyond copy: duplicate interview-prep question, prepare-flow progress bar and Retry, cross-artifact state bleed, a `getByLabel` regression from the audit's own required-field markers, a shared `Button` that stayed clickable when `disabled` was combined with `href`, `CareerInsightCard` fabricating a "product roles" comparison for every metric insight, no confirmation before approving a high-risk `apply`-stage external action, and several workflow actions that failed silently with no toast.

## 15. Operations & release

- ✅ Vercel project builds from `apps/web`, functions in `bom1`, production reachable (protection = preview only)
- ✅ Environment documented (`.env.example`, README)
- ✅ Migrations applied to the production project via `/api/admin/migrate`
- ✅ CLAUDE.md working rules (start from latest `main`, run `check`, update trackers)
- ✅ `.github/workflows/ci.yml`: lint/typecheck/unit-tests/build run as 4 parallel jobs (not one sequential job) on every push/PR, so CI/merge wall-clock time is roughly the slowest single check rather than their sum. The Playwright suite and accessibility audit are deliberately not in automatic CI (too slow to gate every push, and E2E needs real Supabase credentials) — run them on demand with `npm run verify` (everything), `npm run e2e`, or `npm run a11y` — WJ-104
- ✅ Production verified after each push (auth, demo, sources, per-user state)
- ✅ Production walk-through with disposable real accounts (`e2e/real-account.spec.ts`, WJ-162): migration 0007, cron secret, admin allowlist, site URL and VAPID keys configured; two defects it found fixed (JobsLake id collision failing searches, a sync race dropping a just-saved résumé — WJ-161)
- ⬜ Operator-side: Resend API key + contact addresses; rotate the Supabase service-role key (shared in chat once)
- ⬜ Operator-side: set `WONDERJOBS_AI_KEY`, `ADZUNA_APP_ID/KEY`, enable Google provider, Site URL + Redirect URLs, custom SMTP
- ⬜ Uptime / error monitoring beyond Vercel's built-in logs
