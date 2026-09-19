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

_Last updated: 2026-09-19 — story "Server-side cron for scheduled runs (WJ-094)"._

## At a glance

| Epic | Done | Partial | Backlog | Status |
|---|---:|---:|---:|---|
| 1. Foundation & design system | 5 | 0 | 0 | ✅ |
| 2. Accounts & sessions | 8 | 0 | 2 | 🟡 Google needs provider config; custom SMTP recommended |
| 3. Onboarding & Career DNA | 3 | 0 | 1 | ✅ |
| 4. Job discovery (real sources) | 7 | 0 | 2 | ✅ |
| 5. Matching, quality & explanations | 4 | 0 | 0 | ✅ |
| 6. Run Wonder (workflow engine) | 10 | 0 | 0 | ✅ |
| 7. Applications & materials | 6 | 0 | 1 | ✅ |
| 8. Automation & scheduling | 7 | 0 | 0 | ✅ |
| 9. AI providers (BYOK + platform) | 8 | 0 | 1 | ✅ |
| 10. Persistence & sync | 4 | 0 | 0 | ✅ |
| 11. Landing & marketing site | 12 | 0 | 0 | ✅ |
| 12. Help center & support | 6 | 0 | 0 | ✅ |
| 13. Secondary product areas | 8 | 3 | 2 | 🟡 early versions |
| 14. Quality, accessibility, performance | 9 | 0 | 1 | ✅ |
| 15. Operations & release | 5 | 0 | 2 | 🟡 |

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
- ⬜ Resume import to pre-fill Career DNA

## 4. Job discovery — real sources (spec §8–9, "don't show dummy data")

- ✅ Server-side source adapters: Greenhouse / Lever / Ashby company boards, Jobicy, Remote OK, Himalayas, Arbeitnow, Remotive, Adzuna India (keys) — `server/jobs/providers.ts`
- ✅ `/api/jobs/search` + `/api/jobs/sources` with per-source evidence ("Needs setup" for credentialed sources)
- ✅ Deterministic normalizer (skills, seniority, industry, work mode, salary) with unit tests
- ✅ De-duplication across sources; catalog persisted per account (top 300 + saved)
- ✅ Jobs list with debounced search, filters, sort, paging — WJ-025..027
- ✅ Save / not-for-me, reflected everywhere — WJ-030
- ✅ Free-text job search from the global command field
- ⬜ Adzuna keys on the deployment (operator step)
- ⬜ LinkedIn / Indeed / Naukri / Glassdoor: no public APIs; not claimed, not searched

## 5. Matching, quality & explanations (spec §10–11)

- ✅ Explainable per-dimension Wonder Fit with labels (never a bare score) — WJ-028
- ✅ Calibration on live postings: stem-aware skill matching, pay-unknown neutral, remote-region cap, thresholds 82/68/55
- ✅ Evidence-based quality signals with confidence language (no "ghost job" claims) — WJ-029
- ✅ "Why it's a match" and "Sources & signals" tabs on job detail

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

## 7. Applications & materials (spec §16–19)

- ✅ Applications dashboard with status tabs and deep links — WJ-031
- ✅ Application timeline — WJ-032
- ✅ Prepare flow: resume, cover letter, screening answers, review — WJ-033..036
- ✅ Artifact editor: edit, regenerate, compare, restore versions
- ✅ "Open application page" + "Mark as submitted" + submission reminder
- ✅ Follow-up / thank-you emails: draft → confirm → execute-once → audit — WJ-064
- ⬜ Email delivery: a mail provider (the send step is the seam)

## 8. Automation & scheduling (spec §20–24)

- ✅ Automation levels with risk-based capability gating (unit-tested) — WJ-019
- ✅ Automation policy page (automatic / ask me / off per capability) — WJ-020
- ✅ Scheduled runs: list, enable/disable, run now, duplicate, delete — WJ-021
- ✅ Schedule builder and 5 workflow templates — WJ-022, WJ-023
- ✅ Silent outcome when a schedule's condition is not met — WJ-024
- ✅ Server-side cron fires due schedules with the app closed: `/api/cron/scheduled-runs` every 15 minutes, one run per tenant per tick, `nextRunAt` advanced before the run so nothing re-fires in a loop — WJ-094
- ✅ Schedule times evaluated in the schedule's own timezone, DST-aware (unit-tested) — WJ-094
- ✅ The client-side scheduler stands down when the server owns firing, so the two never race; it still covers deployments with no `CRON_SECRET`

## 9. AI providers — BYOK and platform (spec §25–27, request #1)

- ✅ Provider abstraction; app code never calls a vendor SDK directly — WJ-037
- ✅ WonderJobs AI used by default for every account (platform key `WONDERJOBS_AI_KEY`, Anthropic, `claude-sonnet-5`); template fallback clearly labelled — WJ-038, WJ-082
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
- ✅ Nav links to Screens, Help and Contact
- ✅ Landing visual QA at desktop and mobile — WJ-071
- ✅ Demo links wherever a screen has a demo counterpart

## 12. Help center & support (request #5)

- ✅ `/help`: user guide (12 sections) + FAQ, sticky section nav, public — WJ-087
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
- ✅ Upgrade / Pro records interest only (no billing connected) — stated in the UI
- 🟡 Resume Studio: organises materials; deeper AI coaching planned
- 🟡 Interview Prep: prep packs; mock-interview AI planned
- 🟡 Insights: derived from real runs/applications; trend history grows with use
- ✅ Calendar subscribe feed: signed, cookie-less iCalendar URL that Google/Outlook/Apple Calendar poll — real interviews, follow-ups and scheduled runs, no OAuth app to register — WJ-091
- ⬜ Two-way calendar sync (writing back to Google/Microsoft) — needs an OAuth client per provider
- ✅ PWA installability: manifest, generated icons (192/512/maskable), "Install app" in the avatar menu (Chromium only — iOS/Firefox have no install-prompt API, so nothing renders there rather than faking it), a deliberately non-caching service worker (this app is local-first and real-time already; a caching SW would risk stale job/application data) — WJ-090
- ⬜ Push notifications (the SW above has no push subscription handling yet; a server-side sender and per-tenant subscription storage are still needed)

## 14. Quality, accessibility, performance (spec §39–47)

- ✅ 40 unit tests (engine, policy, normalizer, migrations, matching, contact notifications) — WJ-072, WJ-073
- ✅ Playwright end-to-end scripts: auth + demo, full run, review restore, forgot password
- ✅ Security QA of BYOK routes and cross-tenant isolation — WJ-074
- ✅ Keyboard navigation, reduced motion, screen-reader workflow states — WJ-059..061
- ✅ Performance pass: local-first hydration, batched sync, React Compiler, `bom1` functions, static id routes — WJ-077
- ✅ Analytics events per spec §47 with secret filtering — WJ-068
- ✅ Mobile and desktop visual QA — WJ-069, WJ-070
- ✅ `npm run check` (lint, typecheck, tests, build) green before every push — WJ-076
- ✅ Automated accessibility audit: `npm run a11y` (axe-core, 18 pages, reduced-motion emulated), 0 violations — WJ-075
- ⬜ Wire `npm run a11y` into CI (it needs a Chromium binary the repo doesn't vendor; run locally with `npx playwright install chromium` first, or reuse an existing install via `PW_CHROMIUM_PATH`)

## 15. Operations & release

- ✅ Vercel project builds from `apps/web`, functions in `bom1`, production reachable (protection = preview only)
- ✅ Environment documented (`.env.example`, README)
- ✅ Migrations applied to the production project via `/api/admin/migrate`
- ✅ CLAUDE.md working rules (start from latest `main`, run `check`, update trackers)
- ✅ Production verified after each push (auth, demo, sources, per-user state)
- ⬜ Operator-side: set `WONDERJOBS_AI_KEY`, `ADZUNA_APP_ID/KEY`, enable Google provider, Site URL + Redirect URLs, custom SMTP
- ⬜ Uptime / error monitoring beyond Vercel's built-in logs
