# WonderJobs — UX Baseline Audit

**Phase:** UX Simplification, Phase 1 / Step 1 (baseline audit)
**Audited against:** `main` @ `cc7ef05` (2026-09-21) — the actual codebase, not the requirements spec or `docs/PROGRESS.md`'s claims
**Method:** five parallel, read-only codebase inventories (routes, components, services, server code, tests), each required to cite real file paths and verify behavior in code rather than infer it from copy or docs

This document is the **inventory**. It does not propose a new IA — see `docs/UX_SIMPLIFICATION_DECISIONS.md` for the target experience architecture and `docs/UX_CAPABILITY_MAP.md` for the keep/relocate/replace disposition of every capability listed here.

A number of findings below contradict `docs/PROGRESS.md`'s "done" status for the corresponding requirement. Those are called out explicitly — the tracker recorded a capability as verified working when a live code path does not actually reach it (the job-teaser flow) or when UI copy asserts something the code does not do (several "submits"/"sent" claims). Per `CLAUDE.md`'s "verify before claiming" rule, this audit checked the code, not the tracker.

---

## 1. Routes and layouts

Route groups under `apps/web/src/app/`: `(marketing)` (public), `(auth)` (sign-in/up/reset), `api` (all server routes), `app` (the signed-in product), `auth` (OAuth callback/sign-out), `demo` (enter/exit demo mode), `help` (public), `onboarding`.

- `app/app/layout.tsx` wraps every `/app/*` route in `components/layout/AppShell.tsx`.
- Each `[id]/layout.tsx` under `app/app/{jobs,applications,runs,automation/scheduled}` is a no-op pass-through (`generateStaticParams() => []`) whose only job is telling Next these are fully client-rendered shells.
- **Route guard:** `apps/web/src/proxy.ts` (Next 16's replacement for `middleware.ts`). `PROTECTED = [/^\/app(\/|$)/, /^\/onboarding(\/|$)/]`; no-ops entirely if Supabase Auth isn't configured (local/dev fallback). Verifies/refreshes the session cookie, redirects signed-in visitors away from auth pages, and redirects unauthenticated visitors on a protected path to `/sign-in?next=<path>` — **unless** the demo cookie (`wj_demo=1`) is set, in which case protected routes are served anyway with the client-side demo dataset.
- **Onboarding-completion gating is not server-side.** It happens entirely client-side in `AppShell`'s `Gate` component once Zustand stores hydrate (`mode === "user" && !onboarded` → `router.replace('/onboarding?...')`). A signed-in, not-yet-onboarded user can technically see a flash of the protected page's shell before the client redirect fires.

## 2. Navigation

`components/navigation/nav.ts` is the single source of truth, consumed identically by desktop `Sidebar.tsx` and mobile `MobileSidebarDrawer.tsx`:
- **Primary:** Home, Jobs, Runs, Applications, Calendar, Career DNA, Insights
- **Automation group:** Scheduled Runs, Automation Settings
- **Resources group:** Resume Studio, Interview Prep, Learning, Help & Guide
- **Mobile bottom bar:** Home, Jobs, Runs, Applications, + "More" (opens the full drawer)

Verified: no drift between desktop and mobile nav content — both render the same arrays. `TopBar.tsx`'s avatar menu additionally surfaces Profile, AI provider, Automation settings, Get Help, Install app, Demo/Sign-out, at every width.

**Command palette / "Ask Wonder":** `CommandPalette.tsx` (Cmd/Ctrl+K, and the "Ask Wonder anything…" pill in `TopBar` and `MobileHome`) is a **client-side static list filter** — 3 hardcoded actions, every `nav.ts` entry, and a synthesized "Search jobs for '…'" deep link. There is no chat/LLM behind it. Copy across three surfaces ("Ask Wonder anything…", "Hey, I'm Wonder … what would you like to do?", a decorative mic icon with no voice wiring) implies a conversational assistant that does not exist — a copy/implementation gap, not a broken feature.

## 3. Home / dashboard

Both `app/app/page.tsx` (desktop) and `components/career/MobileHome.tsx` (mobile) render in the DOM simultaneously, toggled by CSS breakpoint — not conditional rendering.

Desktop sections, all backed by real store state (none decorative/placeholder): hero + 3 CTAs, 4 metric tiles (new strong matches, follow-ups due, interviews soon, applications this week — all computed client-side from `useJobsStore`/`useApplicationsStore`), `ActiveRunCard`, "Top Opportunities" (top 3 by match score), "Recent Activity" (`useCareerStore.activity`), and a right rail (Wonder CTA → CommandPalette, Upcoming, Career Insights, `AIProviderCard`).

Mobile: greeting, CommandPalette search bar (decorative mic), run/automation-level card, 4-icon quick-actions grid, recent activity, a second Wonder CTA card.

**Concern — stale-once-running chip:** the mobile "automation state" chips (Automated/Guided/"You're in control") reflect `useAutomationStore.defaultLevel`, not any active run's actual level, and only render in the *no-active-run* branch — once a run starts, `ActiveRunCard` replaces the block and the chips vanish. Not a "live" indicator despite the framing.

## 4. Onboarding

`app/onboarding/page.tsx` → `components/career/OnboardingFlow.tsx`, 4 steps: welcome → goal + locations → DNA details (embeds Resume Import, see §6) + skills/industries → automation level. `finish()` writes `careerGoal`, `preferredLocations`, `headline`, `seniority`, `yearsExperience`, `skills`, `industries` to Career DNA, sets the default automation level, marks `onboarded: true`.

**Skip** is available on every step (with a discard-confirmation once the user has typed anything) and bypasses all validation — it calls `completeOnboarding()` directly with no `updateDNA`, so a skipped user enters the app with a fully empty Career DNA (`EMPTY_DNA` defaults) and no in-flow nudge to come back and fill it in beyond the persistent Career DNA nav item.

Demo-mode users never see onboarding — the seed data ships pre-onboarded.

## 5. Career DNA

`app/app/career-dna/page.tsx`: full editor over every `CareerDNA` field (goal/headline/seniority/years, per-skill 1–5 ratings, industries, locations, salary, work modes, strengths/growth areas), plus `LearnedPreferences` (see §12).

**Re-scoring on edit is real, not cosmetic** — confirmed via the actual subscription wiring: `store/StoreHydrator.tsx` calls `useJobsStore.rescore()` whenever `useCareerStore.dna` changes (from onboarding, the editor's Save, or resume import), and `rescore()` recomputes `computeMatch()` for every loaded job.

## 6. Resume import

`components/career/ResumeImport.tsx`, one implementation reused in two places (onboarding Step 2 and the Career DNA page header — not a duplicate).

`POST /api/career/import-resume` → `server/resume/extractText.ts` (hand-rolled, dependency-free PDF/DOCX/text extraction — no parsing library) → `server/resume/parseResume.ts` (deterministic regex/heuristic field extraction against the same skill lexicon used to parse job postings, explicitly **not an LLM call**). Every filled field carries an `evidence` string (the literal source text it came from); nothing is written to Career DNA until the candidate ticks a field and clicks "Fill in N fields." The uploaded file is read into memory server-side and never persisted — confirmed no DB/storage write exists in the route, consistent with the UI's claim.

No concerns found — this is a well-documented, honestly-scoped capability.

## 7. LinkedIn functionality

**Confirmed absent by design**, and unusually transparently so:
- `content/help.ts` (the public help guide and FAQ) explicitly states Wonder does not search LinkedIn/Indeed/Naukri/Foundit/Glassdoor because they have no public job APIs.
- `domain/jobs/sources.ts` (`JOB_SOURCES`, the real registry powering search) has no `linkedin` entry — this is authoritative; LinkedIn cannot appear as a toggleable/queryable source anywhere in the running app.
- The only code references are (a) a contact-line-exclusion regex in resume parsing (so a LinkedIn URL in a resume isn't misread as the candidate's name), (b) tests asserting non-support, and (c) one cosmetic flavor string in **demo seed data only** (`services/mock/seed.ts`: `"Found on LinkedIn and Naukri"` on a seeded sample application's activity log) — could read as a real capability to someone skimming the demo, worth rewording.

There is no dead code to remove and no duplicate implementation here — it's a single, consistent "not supported, stated plainly" story.

## 8. Job search / list / detail

`app/app/jobs/page.tsx`: client-rendered from `useJobsStore`, 250ms-debounced free text, deep-linkable via `?fit=`/`?saved=1`/`?q=`, client-side sort (best match/date/salary), "Show more" paging (24/page, no true pagination). `JobCard` shows company/location/mode/salary/match badge/quality badge/save toggle.

Job detail tabs: **Overview, Why it's a match, Company, Sources & signals**.

**Concern — the public "shared job link" flow is real but unreachable.** `server/jobs/lookup.ts`/`teaser.ts`/`JobTeaser.tsx` are fully implemented and unit-tested: re-derive a job by id from the live source, build the same Overview/Company/Sources content for a signed-out visitor, blur the match score. But **there is no route guard that redirects an anonymous visit to `/app/jobs/<id>` into this flow.** `lib/mode.ts`'s `getClientMode()` instead silently drops an unauthenticated visitor into demo/local mode, rendering the client-only demo catalog — a real job id won't exist there, so a genuinely shared link (the Share button always builds `${origin}/app/jobs/${job.id}`) shows "Job not found," not the teaser. The teaser only ever activates if something links directly to `/sign-in?next=/app/jobs/<id>` with that exact query string — nothing in the app does. **This contradicts `docs/PROGRESS.md`'s WJ-115/WJ-116 "done" status for this feature** — the code exists and is tested in isolation, but the live path never reaches it.

**Concern — Company tab fabricates data for real jobs**, in violation of the "real data only" project rule. It looks up the job's company in a hardcoded ~39-entry demo company list (`services/mock/catalog.ts`); for any real job whose company isn't in that list (the overwhelming majority of live postings), the fallback ternary defaults company size to **"Startup"** rather than saying "not listed." The signed-out `JobTeaser.tsx` gets this right (omits the line entirely when unknown) — the same gap, two different and inconsistent fallback behaviors, one of which invents a value.

**Concern — bare match-score badges.** `MatchBadge`'s own doc-comment says scores are never shown as a bare number, but neither `JobCard` nor the detail header passes `showLabel`, so both render only `"82% match"` with the category label available only via hover tooltip (inaccessible on touch). The fit label is only visibly guaranteed on the "Why it's a match" tab.

## 9. Multi-source aggregation & dedup

`server/jobs/providers.ts` + `domain/jobs/sources.ts` (`JOB_SOURCES`, single registry): Remotive, Jobicy, Remote OK, Himalayas, Arbeitnow (no credentials needed), Adzuna India (credential-gated, `requiresSetup`), and "Company career sites" — Greenhouse/Lever/Ashby boards for a **hardcoded ~18-company allow-list** (not a general crawler; the UI copy is accurate but doesn't disclose the fixed, small list size).

Dedup (`services/jobs/matching.ts` `deduplicate`/`canonicalKey`) normalizes title|company|location and merges cross-source duplicates, keeping every source id.

Per-source evidence during a run distinguishes **"Needs setup"** (credential-gated, non-fatal, other sources continue) from **"Unavailable"** (fetch failure). The same aggregation/dedup/matching code is reused identically by the interactive client run and the server cron run — no duplicate logic between the two paths, a genuine architectural strength.

Note: Remotive and Arbeitnow ship `enabled: false` by default for feed-quality reasons, distinct from credential-gated sources — the UI doesn't visually distinguish "off by default because thin" from "off because you haven't turned it on."

## 10. Filters

`domain/jobs/filterExplain.ts` (`applyJobFilters`) is the single function backing both the results list and the "Why Was This Filtered" breakdown, applying filters in a fixed precedence (rejected → not-saved → work mode → source → min fit → freshness → min salary → search text) so a job is attributed to exactly one hiding reason.

**Concern — "Show me anyway" doesn't un-hide rejected jobs.** The clear-filters patch touches every filter except `rejected` (which is applied unconditionally), so if "not for me" jobs are among the hidden reasons shown, clicking "Show me anyway" leaves them hidden. There is no bulk "review rejected jobs" list anywhere — the only way back is opening that job's own detail page and clicking "Undo not for me."

**Concern — two unrelated "minimum match" concepts.** Run setup's "Minimum match score" only gates which jobs get auto-saved/AI-prepared during a run; it does not filter the visible `/app/jobs` catalog. The separate Fit filter in the jobs list is the only thing that limits visibility. Nothing in the UI clarifies these are different thresholds.

## 11. Wonder Fit (matching)

`services/jobs/matching.ts::computeMatch` — 6 weighted dimensions (skills 0.32, seniority 0.18, career goal 0.18, location 0.12, industry 0.10, compensation 0.10), each independently explained as an `AlignmentReason`. Final score clamped to [20, 96], capped at 74 for remote-but-geo-restricted roles (a hard business rule, not just a label change). Fit labels: Strong (≥82) / Worth Considering (≥68) / Stretch (≥55) / Low-Fit. Never rendered as a bare number on the "Why it's a match" tab, which always carries the "a guide, not a verdict" disclaimer. (The bare-badge issue is a `JobCard`/header composition gap — see §8 — not a matching-engine issue.)

## 12. Quality signals

`services/jobs/matching.ts::computeQuality` — 9 evidence-based signals (freshness, repost count, cross-source duplicates, application destination, employer-page presence, salary transparency, source reliability, path clarity, last-observed), rolled into a deterministic `high`/`moderate`/`low` confidence with a plain-language summary. Copy is consistently hedged ("observations, not claims about the employer's intent") — no ghost-job accusations. Single implementation, reused verbatim by the signed-out teaser.

## 13. Why This Job / Why filtered

"Why it's a match" tab: score bars + Strong/Good/Weak labels per dimension, real fallback copy when no match exists yet.

"Why Was This Filtered" (`FilteredBreakdown.tsx`): compact strip above results + a full empty-state variant when filters hide everything, both always paired with "Show me anyway" and "Change my preferences" (→ Career DNA). Same caveat as §10: "Show me anyway" doesn't clear rejections.

## 14. Save / not-for-me

Save: bookmark toggle on `JobCard` (list + dashboard) and job detail; mutually exclusive with reject.

Not-for-me: **two-step UI, detail-page only** (no reject affordance on the card itself — a real friction asymmetry given rejecting is arguably a common bulk action while scanning a list). Reason picker with an explicit Skip.

**The learning loop is real, not cosmetic — a genuine positive finding.** `domain/career/learning.ts` requires 3+ same-reason rejections before any ranking signal is created (an explicit over-learning guard), applies a small capped score penalty at match-compute time (never below the 20-point floor), and every active signal is reviewable/dismissible on Career DNA. The code's own comments record that this *used to be* a false claim — the UI told candidates rejecting would improve future ranking while nothing read the rejection data outside the jobs store's own filter — and has since been made real. Worth explicitly protecting from regression in the redesign.

No bulk management of rejected jobs exists (same gap as §10).

## 15. Application preparation

`app/app/applications/[id]/prepare/page.tsx`: 4 tabs (Resume, Cover Letter, Answers, Review). Generation routes through the shared `AIService` abstraction (§21).

**Concern — simulated progress.** The 5-step progress checklist fires steps 1–3 synchronously right before the single real network call (per the code's own comment, to avoid a visual "jump") — it implies granular sub-stage work that isn't actually happening.

**Concern — policy asymmetry.** Resume and cover-letter generation can be toggled off via Automation Settings; screening-answers generation has no matching capability in `domain/automation/policy.ts`, so it can never be disabled the same way.

## 16. Resume / cover-letter / screening generation

One shared `ArtifactEditor` (`components/applications/ArtifactEditor.tsx`) + `RichTextEditor` + versioning model serves **all three** artifact types — genuinely unified, not three separate editors. Autosave (800ms debounce, in-place content rewrite, auto-promotes provenance AI_GENERATED → USER_MODIFIED on first edit), Regenerate (always creates a new version), Compare (plain two-column render, not a real diff), Restore (fully reversible, keeps history).

**Concern — inconsistent with follow-up emails.** The follow-up/thank-you email draft (§18) is a separate, much thinner implementation (plain textarea, no autosave/versioning/compare) despite being conceptually the same thing — AI-drafted, user-edited text.

## 17. Applications (dashboard, timeline, tracking)

`app/app/applications/page.tsx`: status-tab list; `ApplicationTimeline.tsx`: chronological event log with future-dated events marked "upcoming."

"Open application page" opens `job.applyUrl` in a new tab. **"Mark as submitted" is a purely local status transition with no verification** — an honor-system button, by design (Wonder never contacts the employer), but worth being explicit about since it's the only signal application-tracking metrics are built on.

Download materials: `lib/docx.ts` builds a genuine, spec-compliant `.docx` (hand-rolled ZIP + OOXML parts, zero dependency) from the *same* markdown parser that powers the on-screen editor — confirmed not a fake/renamed file. Reused server-side for the Chrome extension (§22).

**Minor duplication:** filename-sanitizing logic is copy-pasted between the applications detail page and the extension's application route.

## 18. Follow-up / thank-you emails

`components/applications/FollowUpAction.tsx`: draft (via the same AI service) → confirm → execute-once (idempotency key `email:{applicationId}:{kind}:...`) → audit (`lib/audit.ts` → `/api/audit` → Supabase `action_audit`, honest no-op when Supabase isn't configured).

**Confirmed misleading copy — the most concrete "claims something the code doesn't do" finding in this audit.** The confirmation modal states: *"It will be sent to {company} on your behalf and recorded on the timeline. This can't be unsent."* The actual `send()` implementation is `await new Promise((r) => setTimeout(r, 700))` — a hard-coded mock delay, with the code's own comment reading *"Mock delivery. A real mail provider plugs in here; the ledger semantics stay the same."* **No email is ever sent.** A real transactional email integration (Resend, via `server/notify.ts`) exists in the codebase but is wired only to the marketing Contact Us form — completely unconnected to this flow.

## 19. Workflow engine ("Run Wonder")

`domain/workflow/status.ts` (10-state machine, explicit transition table, unit-tested), `domain/workflow/stages.ts` (12 fixed stages: profile → search → dedupe → understand → match → quality → rank → prepare → review → apply → track → learn), `domain/workflow/engine.ts` (`WorkflowEngine`, pure TS, runs client-side via `services/workflow/service.ts`; a second, more limited instance runs server-side for cron, see §20).

Every run carries a full stage-by-stage record, a provenance-tagged output map, an idempotency-keyed action ledger, and a verbatim event log (the Logs tab). Rerun-from-stage deep-clones completed stages/outputs and shares the engine-wide idempotency ledger, so a rerun can never resubmit an already-registered external action.

**Confirmed misleading copy, and the audit's single highest-priority finding.** `ActionApprovalList.tsx`'s confirmation modal for `apply`-stage actions reads: *"Submit this application? '{label}' submits your application on the employer's site. This can't be undone from here,"* with a button labeled **"Submit application."** The actual `apply` executor's own comment states the opposite design intent: *"Wonder never submits on an employer's site on the candidate's behalf."* Approving the action only opens the employer's URL and writes a tracker note (`nextAction: "Apply on {company}'s site, then mark as submitted"`) — real submission only ever happens via the candidate's own later click of "Mark as submitted" (§17), which makes no outbound network call at all. `domain/workflow/outcome.ts`'s "handed off" outcome screen gets this right — so the *same product* describes the *same action* accurately in one place and inaccurately in another.

This is a structural strength, not a gap: **the `apply` stage cannot submit to an employer under any automation level or policy setting, in either the client or server engine.** The `review` stage is an unconditional human gate before `apply` ever runs, regardless of policy. The risk is entirely in copy that overstates automation (see also §21's capability descriptions) — not in any latent capability the redesign needs to remove. This directly supports the source brief's "do not implement mass auto-apply" constraint: there is nothing to disable, only language to correct.

**Other confirmed defects:**
- **Live bug:** `WorkflowTimeline.stageStatusLine()` reads `stage.counts.submitted` for the apply stage, but the executor only ever writes `counts.handed_off`/`counts.declined` — the apply-stage timeline line always shows "0 submitted" regardless of actual hand-offs.
- **Dead/decorative field:** `StageDefinition.requiresUser` is declared true on the `review` stage but never read anywhere in the engine (confirmed by repo-wide grep) — the actual pause is hard-coded ad hoc in the `review` executor, not enforced generically.
- **Broken notification link:** `server/workflow/scheduledRun.ts` builds notification hrefs as `/app/run/{id}` (singular) in three places; the real route is `/app/runs/{id}` (plural) — clicking a push/activity notification from a scheduled run 404s.

## 20. Scheduling & server-side cron

`app/app/automation/scheduled/*` + `ScheduleBuilder.tsx` (one component for create and edit): trigger/schedule/stages/search/conditions/actions/level/provider, exactly as speced. Built-in templates deliberately exclude the `apply` stage (except by the user's own explicit stage selection). "Silent" outcome (`run.silent`) is a real, tested state — a schedule whose condition isn't met completes with a full record but no notification.

Server cron (`app/api/cron/scheduled-runs/route.ts`): `CRON_SECRET`-gated, one due schedule per tenant per tick, advances `nextRunAt` **before** running (crash-safe against re-firing), and — the cleanest example of the "prepare vs. submit" boundary being enforced structurally rather than just by policy — **only implements stages through `rank` server-side.** `prepare`/`review`/`apply`/`track`/`learn` have no server executor at all; a scheduled run always stops at `rank` unless a human has an open tab. Timezone/DST handling is explicit and tested. Double-firing between the client ticker and server cron is prevented by one shared `isDue()`/`ranRecently()` rule, confirmed used identically by both.

**Concern — coupling worth flagging, not a bug.** The Schedule Builder lets a user attach the `apply` stage to any schedule at "Continuous" automation with only a soft warning; the guardrail against unattended submission lives entirely in the `apply` executor's structural inability to submit, not in the scheduling UI. If that executor is ever changed without preserving the hand-off design, "scheduled + continuous + apply" is exactly the combination that would need re-auditing.

## 21. Automation policy

`domain/automation/policy.ts`: 12 capabilities, each with a low/medium/high risk tier and a default automatic/ask/off mode; `resolveCapability()` is the single gating function, referenced from exactly one place across engine, UI, and the server snapshot — no duplicate policy logic found.

**Confirmed misleading copy.** `CAPABILITY_META.submit_application`'s description ("Submit a prepared application to an employer") and the Autonomous/Continuous automation-level descriptions ("including submitting applications or sending email — now runs without asking") both overstate what the `apply` stage can ever do (see §19). The code is safer than its own settings-page copy claims.

## 22. Pause / resume / stop, rerun, manual intervention

All confirmed working as specced, no defects found beyond the two copy issues already noted:
- **Pause/resume/graceful stop:** explicit state machine, `finishStopped` preserves every already-written stage output; a partial/recoverable stage failure demotes to `COMPLETED_WITH_WARNINGS` rather than failing the whole run.
- **Rerun from stage:** deep-clones completed stages/outputs, shares the engine-wide idempotency ledger (keyed by `submit:{jobId}:me`, stable across runs) so an already-registered action is never re-executed — it's recorded as `skipped_duplicate` instead.
- **Manual override:** `resolveRunValue()` (override → stage output → input → config) with a small fixed whitelist of editable inputs (career goal, locations, min salary, min match threshold), each carrying a provenance badge and a revert-to-AI-value action.
- **Waiting for user / surviving a closed tab:** `hydrate()` deliberately leaves a `WAITING_FOR_USER` run waiting on reload (every other active status is demoted to STOPPED) — "closing the tab is not a decision." `continueFromUser()` correctly resumes on a fresh session. "Continue without N pending" explicitly marks unapproved actions **not approved** (never silently carried forward or auto-approved) and says so in the UI.

## 23. AI providers / platform AI / BYOK

`services/ai/service.ts` (provider abstraction — app code never calls a vendor SDK directly), three real BYOK adapters (Anthropic via the official SDK; OpenAI and Gemini via direct REST), a deterministic `TemplateAIService` ("WonderJobs AI") that becomes a real platform-billed LLM call only when the deployment sets `WONDERJOBS_AI_KEY`, otherwise honestly falling back to the grounded template draft. Keys are AES-256-GCM encrypted server-side, masked on read, never exposed to the browser. `FallbackProvider` only switches to platform billing on a failure when the user has explicitly opted in — matches the "never switch billing silently" copy. Usage transparency (tokens/cost/request log) is real and disclosed as an estimate.

**Concern — redundant surface area, not a bug.** Three separate provider-selection UIs exist with overlapping purpose: the dashboard `AIProviderCard`, the `ProviderSelector` embedded in Run/Schedule setup, and the full `/app/settings/ai` page — a consolidation candidate for the redesign, not a defect.

No unit tests exist for the three vendor adapters themselves or for the secret encrypt/decrypt round-trip (only the platform-provider and provider-types tests exist).

## 24. Notifications (in-app + push)

Both in-app notifications and Web Push are driven by real data — due follow-ups/interviews and schedule `nextRunAt` timestamps — with no synthetic/demo generator in the persisted path. Push is a genuine, from-scratch RFC 8291/8292 implementation (verified against the RFC's own test vector), not a library wrapper; a deployment without VAPID keys shows no push UI at all rather than a broken one.

**Note, not a bug:** the due-reminder rule (`isDueForReminder`) is reimplemented separately in the server cron path and the client-side ticker rather than shared — an intentional, well-documented duplicate (each owns a different trigger context) but still two codepaths for one business rule.

## 25. Calendar

`GET /api/calendar/[tenantId]/[signature]`: cookie-less, HMAC-signed RFC 5545 feed built exclusively from real follow-ups/interviews/schedule `nextRunAt`. Copy ("treat this link like a password", "not instant") accurately reflects its non-realtime, signed-URL nature.

**Concern — no link rotation.** The signature is a static HMAC of the tenant id with no expiry or revocation; there is no "regenerate calendar link" affordance, and rotating it would require rotating the deployment's whole secret key (which would also break BYOK secrets and the extension token).

## 26. PWA

Manifest, generated icons, `useInstallPrompt()` (Chromium-only, correctly reports unavailable elsewhere rather than faking an install button), and a service worker that is **deliberately not a caching SW** (documented rationale: the app is local-first with its own sync layer, so caching risks stale job/run/application data) — only installability plus an honest offline fallback page and push handlers. No misrepresentation found; this is an intentional design choice, not a gap.

## 27. Chrome extension

A real, working unpacked extension (source at repo root `/extension`, separate from the Next.js app) — not vaporware. Token-based auth (`/api/extension/token`, session-gated, short-lived bearer), reads the candidate's prepared resume/cover letter (same `.docx` generator as the in-app download) and autofills Greenhouse/Lever/Ashby forms plus a generic label-matching fallback. Explicitly and correctly discloses unsupported fields (phone/LinkedIn/address) rather than inventing them. **Never submits** — GET-only API, consistent with the workflow engine's actual apply-stage behavior (the inconsistency is isolated to the `ActionApprovalList` copy in §19, not the extension).

Not on the Chrome Web Store (manual "Load unpacked" install, disclosed on the marketing page) and has zero automated test coverage beyond token sign/verify.

## 28. Help / contact

`content/help.ts` (10-section guide + FAQ) + `app/help/page.tsx` (public, no session required — confirmed via a cookie-less production request) + `HelpAssistant.tsx` → `/api/help/ask`. **Genuine retrieval-first, model-optional design**: pure keyword search over the guide always runs and always produces an answer; a platform-configured model only ever rewrites/cites from the retrieved excerpts (system-prompted to answer only from them), with any model failure silently falling back to pure retrieval. Source is honestly attributed in the UI ("guide" vs "model").

Contact form → real Resend delivery when `RESEND_API_KEY`/`CONTACT_NOTIFY_EMAILS` are configured, honestly logged otherwise.

## 29. Accessibility

`scripts/a11y-audit.mjs` (`npm run a11y`): axe-core via real Playwright/Chromium against 10 public pages, 9 demo-mode app screens, and 3 deliberately-opened interaction states (resume-import dialog, "Why Was This Filtered" empty state, zero-results search) — chosen because "a dialog is exactly where accessibility tends to break." Fails on any serious/critical violation.

**Confirmed gap:** not part of CI (excluded deliberately per the workflow file's own comment — needs a Chromium binary the repo doesn't vendor) — accessibility regressions can land on `main` unchecked. Coverage is demo-mode/public-page only; several authenticated screens (Calendar, Interview Prep, Learning, Insights, Resume Studio, an active help-chat conversation, the AI settings page's connected/not-connected states) are not audited at all.

## 30. Security / audit

BYOK secrets: AES-256-GCM, server-only decrypt (§23). External-action audit trail (`store/actions.ts` + `/api/audit` → Supabase `action_audit`) is real and append-only, but today wired to exactly one action type in the UI (`send_email` follow-ups) — the domain type also lists `submit_application`/`send_recruiter_message`, but no UI component was found invoking the ledger for either.

**Confirmed architectural risk worth flagging (not a Phase-1 fix item, but material to any redesign touching auth):** every table has `enable row level security` set, but **no `CREATE POLICY` exists anywhere in the migrations** (confirmed by full-repo grep). Isolation is enforced entirely in application code — the whole schema is revoked from `anon`/`authenticated` and only the service role (which bypasses RLS regardless) can reach it, with every route filtering by `session.tenantId`. This is a defensible pattern, but "RLS enabled" should not be read as "row-level tenant enforcement exists at the database layer" — if any route ever queried Supabase directly without a tenant filter, nothing at the DB layer would stop a cross-tenant read. A documented legacy/no-auth mode (`wj_uid` cookie, no real authentication) exists for deployments without Supabase Auth configured, which weakens the "audit trail"/"tenant isolation" claims in that mode specifically.

## 31. Tests

**Unit (Vitest, 32 files):** genuinely executed as a required, independent CI job — covers the workflow engine, policy, career learning, jobs matching/normalize/filter-explain, resume extraction/parsing, push/calendar/ics, AI grounding. Notably *not* covered: the three BYOK vendor adapters themselves, and the secrets encrypt/decrypt round-trip.

**E2E (Playwright, 2 spec files, 28 tests total):** `auth.spec.ts` (18 tests, real Supabase accounts, 5 intentionally skipped with disclosed environmental reasons) and `golden-journeys.spec.ts` (10 tests, **demo mode only** — no real, non-seeded account journey is exercised end-to-end). Deliberately excluded from CI (documented reason: needs real time + real Supabase credentials); runs on demand only.

**Confirmed, self-documented coverage gaps, and they cluster on the newest/highest-risk surfaces:** zero E2E coverage for Automation (scheduled runs, policy settings), Career DNA editing, BYOK/AI provider settings, PWA/push flows, Calendar, Help assistant/contact, the Chrome extension, and Resume Studio/Interview Prep/Insights/Learning. Firefox/WebKit/Mobile Safari have never actually run against the app (only Chromium is vendored in this sandbox) despite being declared in `playwright.config.ts`. Test coverage is inversely correlated with feature complexity/risk — worth weighing heavily for any redesign that touches these flows.

---

## Consolidated list of verified defects (for triage, independent of the redesign)

These were each confirmed in code by at least one audit pass (two, for the apply/submit language):

1. **Misleading:** Follow-up email "Send" confirmation claims real delivery; implementation is a 700ms mock with no mail provider wired in (§18).
2. **Misleading, highest priority:** `apply`-stage approval modal claims "submits your application... can't be undone"; the executor never submits — pure hand-off (§19). Same misstatement echoed in the `submit_application` capability description and the Autonomous/Continuous level copy (§21).
3. **Bug:** apply-stage timeline always shows "0 submitted" — reads a count key (`counts.submitted`) the executor never writes (`counts.handed_off` is the real key) (§19).
4. **Bug:** scheduled-run notification links point to `/app/run/{id}` (singular); the route is `/app/runs/{id}` — 404s on click (§19).
5. **Real-data-only violation:** the job-detail Company tab defaults unknown real companies' size to "Startup" instead of saying it's not listed (§8) — the signed-out teaser gets this right; the signed-in view doesn't.
6. **Feature gap, contradicts tracker:** the signed-out job-teaser flow (WJ-115/116) is fully built and tested but has no live entry point — a real shared link 404s to "Job not found" (§8).
7. **Functional gap:** "Show me anyway" doesn't clear "not for me" rejections despite listing them as a hidden reason; no bulk way to review rejected jobs exists at all (§10, §13, §14).
8. **Dead field:** `StageDefinition.requiresUser` is declared but never read by the engine (§19).
9. **Minor:** duplicate filename-sanitizing logic between the applications page and the extension API route (§17, §27).
10. **Minor:** demo-seed flavor text ("Found on LinkedIn and Naukri") could read as a real capability (§7).
11. **Policy asymmetry:** screening-answers generation has no automation on/off capability, unlike resume/cover letter (§15, §21).

## Confirmed working as advertised — protect these from regression

- The "not for me" ranking feedback loop (§14) — genuinely bounded, reviewable, and effective; the code's own history notes this used to be a false claim and has since been fixed.
- Multi-source aggregation, dedup, matching, and quality signals (§9, §11, §12) — single implementation shared by both the interactive and cron run paths.
- Resume import (§6) — evidence-shown, opt-in, file never persisted.
- The full pause/resume/stop/rerun/override subsystem (§22) — no defects found.
- The server cron's structural inability to reach `prepare`/`review`/`apply` (§20) — the cleanest enforcement of "never mass auto-apply" in the codebase.
- The help assistant's retrieval-first design (§28) — always answers from the real guide, model use is additive and disclosed.
- PWA's deliberate non-caching service worker (§26) — an intentional, documented tradeoff, not a gap.
