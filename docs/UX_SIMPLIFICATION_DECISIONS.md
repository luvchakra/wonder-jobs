# WonderJobs — UX Simplification: Experience Architecture & Decisions

Companion to `docs/UX_BASELINE_AUDIT.md` (what exists today, verified in code) and `docs/UX_CAPABILITY_MAP.md` (where every capability goes). This document is the target **experience architecture** and the **decisions** made to get there — it is Step 2 of Phase 1 per the source brief; screen migration itself is a later phase and out of scope here.

---

## 1. Target mental model → primary navigation

| Mental model | Primary nav item | What lands there |
|---|---|---|
| Find my next role | **Find Jobs** | Search, filters, Wonder Fit, quality signals, Why This Job, Why filtered, save/not-for-me |
| Prepare an application | **Applications** (Prepare sub-flow) | Resume/cover-letter/answers generation, the shared artifact editor, review |
| Manage my applications | **Applications** | Dashboard, timeline, hand-off, download, follow-ups |
| Improve my career profile | **Career** | Career DNA, resume import, learned preferences, Insights, Resume Studio, Interview Prep, Learning |
| Let Wonder work for me | **Wonder** | Run setup/detail, pause/resume/stop/rerun/override, scheduling, automation policy |

**Primary navigation (5 items):** Home, Find Jobs, Applications, Career, Wonder.

**Decision — mobile bottom bar shows all 5 primary items directly, no "More."** Today's bottom bar shows 4 of 7 primary-nav entries plus a "More" drawer that duplicates the desktop sidebar. Once Automation/Resources move under Wonder/Career (below) and Settings items are demoted out of primary nav entirely, there are exactly 5 top-level destinations — small enough to fit the bottom bar without a catch-all, and it removes the one navigation surface (`MobileSidebarDrawer`) that exists purely to compensate for a primary nav that's too flat.

Everything currently in the "Automation" and "Resources" nav groups is **not deleted, only relocated** — see the mapping below and the capability map for the row-by-row disposition.

## 2. Route/nav relocation map

| Today | Nav group | New destination |
|---|---|---|
| `/app` | Primary | **Home** (unchanged) |
| `/app/jobs`, `/app/jobs/[id]` | Primary | **Find Jobs** (unchanged) |
| `/app/applications`, `/app/applications/[id]`, `/prepare` | Primary | **Applications** (unchanged) |
| `/app/runs`, `/app/runs/new`, `/app/runs/[id]` | Primary | **Wonder** (relocated — "Run Wonder" is the flagship action of "Let Wonder work for me") |
| `/app/career-dna` | Primary | **Career** (relocated) |
| `/app/insights` | Primary | **Career** (relocated — fits "improve my career profile" better than a standalone top-level item) |
| `/app/calendar` | Primary | **Home** ("Upcoming" surface) + a subscribe action under Settings (relocated — calendar is a view onto Applications/Wonder data, not a fifth thing to manage) |
| `/app/automation/settings` | Automation | **Wonder**, advanced tier (relocated) |
| `/app/automation/scheduled`, `/new`, `/[id]` | Automation | **Wonder**, advanced tier (relocated) |
| `/app/resume-studio` | Resources | **Career** (relocated) |
| `/app/interview-prep` | Resources | **Career** (relocated) |
| `/app/learning` | Resources | **Career** (relocated) |
| `/app/settings/ai` | (avatar menu) | **Settings**, out of primary nav (relocated, and consolidated — see Decision 2 below) |
| `/app/profile` | (avatar menu) | **Settings** (unchanged position) |
| `/help` | (avatar menu, public) | Unchanged — stays public and reachable everywhere |

This satisfies the brief's "Settings/advanced configuration remains available but is not primary navigation" — nothing loses a destination, several things lose their standalone top-level slot.

## 3. Progressive disclosure

| Level | Question | Existing surfaces that already answer it |
|---|---|---|
| **1 — What should I do?** | Home's consolidated recommendation, `RunOutcome`'s plain-words outcome + next action, an application's `nextAction` text | Keep as the default, always-visible view |
| **2 — Why?** | "Why it's a match" tab, "Why Was This Filtered" breakdown, quality-signal summaries, `LearnedPreferences`' "Wonder learned this from your feedback" | One tap/click deeper than Level 1, never the default view |
| **3 — How did Wonder work?** | Run detail's Progress/Logs tabs, per-source search evidence ("Needs setup"/"Unavailable"/"N jobs"), "Sources & signals" tab | Reachable from a run or a job, not surfaced unprompted |
| **4 — What exactly should Wonder do?** | Automation policy editor, schedule builder, manual stage override, AI provider/BYOK settings | Explicit "Settings"/"Wonder → Advanced" destination, never required to use the product |

**Decision — chain-of-thought stays hidden, and this is already true today.** The Logs tab renders structured `RunEvent`s (stage transitions, evidence, warnings), never a raw model transcript; `TemplateAIService`/BYOK calls return only a final drafted artifact. No change is required to satisfy "do not expose chain-of-thought" — this is a constraint to preserve during migration, not a gap to close.

## 4. Product loop → screen mapping

`Understand → Find → Decide → Prepare → Act → Track → Learn → Find again`

| Loop stage | Screens/capabilities |
|---|---|
| Understand | Onboarding, Career DNA, resume import |
| Find | Find Jobs (search, filters, multi-source aggregation) |
| Decide | Wonder Fit, quality signals, Why This Job, save/not-for-me |
| Prepare | Applications → Prepare (resume/cover-letter/answers, shared artifact editor) |
| Act | Apply-stage hand-off, "Open application page," the Chrome extension, "Mark as submitted" |
| Track | Applications dashboard + timeline |
| Learn | Not-for-me learning loop, Learned Preferences, Career Insights |
| Find again | Back to Find Jobs, now re-ranked by learned signals |

This loop is already implemented end-to-end in the current codebase (verified in the baseline audit) — the redesign's job is to make the *navigation* reflect this loop, not to build new mechanics for it.

## 5. Non-negotiable capabilities — confirmed present, confirmed a destination

Every capability the source brief lists as non-negotiable was found real (not stubbed) in the baseline audit and has a destination above. None are being removed or descoped by this architecture:

| Capability | Verified real? | New destination |
|---|---|---|
| Career DNA | ✅ | Career |
| Resume import | ✅ | Career (Career DNA header, onboarding) |
| LinkedIn capability | ✅ *(confirmed correctly absent — no public API exists; this is not a gap)* | Help/FAQ disclosure only |
| Multi-source aggregation | ✅ | Find Jobs |
| Deduplication | ✅ | Find Jobs (invisible, backs the catalog) |
| Wonder Fit | ✅ | Find Jobs |
| Quality signals | ✅ | Find Jobs |
| Why This Job? | ✅ | Find Jobs |
| Why filtered? | ✅ | Find Jobs |
| Save/not-for-me | ✅ | Find Jobs |
| Application preparation | ✅ | Applications |
| Resume/cover-letter/screening generation | ✅ | Applications |
| Application tracking | ✅ | Applications |
| Scheduling | ✅ | Wonder |
| Pause/resume/stop | ✅ | Wonder |
| Rerun | ✅ | Wonder |
| Manual intervention | ✅ | Wonder |
| Automation policy | ✅ | Wonder |
| Auditability | ✅ *(present but under-wired — only `send_email` currently uses the ledger)* | Wonder / Applications (unchanged wiring for Phase 1) |
| Platform AI | ✅ | Settings (consolidated, see Decision 2) |
| BYOK | ✅ | Settings (consolidated, see Decision 2) |
| Privacy/security | ✅ *(with the RLS-posture caveat logged in the audit)* | Unchanged |
| Candidate approval for consequential external actions | ✅ *(structurally enforced — the `review` stage is an unconditional gate and `apply` cannot submit)* | Wonder |

**Mass auto-apply:** confirmed structurally impossible today under any automation level, policy setting, or trigger (manual, scheduled, or cron) — the server engine has no executor at all past `rank`, and the client `apply` executor never calls out to an employer. The non-goal is already met by the architecture; the only outstanding work is correcting copy that claims otherwise (Decision 4).

## 6. Key decisions

1. **"Ask Wonder" / command palette copy will be scaled back to match what it does.** It's a real, useful static router/search box, not a conversational assistant. Building an actual assistant is out of scope for this phase; the decision is to stop implying one exists across three surfaces (TopBar, Home right rail, Mobile Home) until/unless that's a deliberately scoped future story.
2. **Consolidate the three AI-provider UI surfaces into one canonical Settings page plus one minimal inline picker**, rather than three overlapping surfaces (`AIProviderCard` dashboard summary, `ProviderSelector` in Run/Schedule setup, the full `/app/settings/ai` page). The inline picker (used inside Run setup and the Schedule builder) stays, since a provider choice genuinely belongs at the point of use; the dashboard summary card is redundant with both and is dropped in favor of a link.
3. **Follow-up/thank-you email drafting is a consolidation candidate, not a Phase-1 requirement.** It's conceptually the same "AI-drafted, user-edited text" as resume/cover-letter/answers but uses a separate, thinner implementation. Recommended for a later pass once the mock-delivery issue (Decision 6) is resolved either way — no point building versioning/autosave onto a send flow that doesn't yet send anything.
4. **Every place that uses "submit" language for what is actually a hand-off gets corrected before or alongside migration, not deferred.** This is a trust issue, not a cosmetic one — it's the same category of problem `CLAUDE.md`'s "real data only" rule exists to prevent, just applied to *claimed actions* instead of *claimed data*. Concretely: the `ActionApprovalList` approval modal, the `submit_application` capability description, the Autonomous/Continuous automation-level descriptions, and the apply-stage timeline's "0 submitted" bug (wrong count key) all need to say what the code actually does — opens the employer's page and hands off, never submits.
5. **The job-detail Company tab's "Startup" fallback for unknown real companies is a real-data-only violation and gets fixed regardless of the redesign's timeline.** It should behave like the signed-out teaser already correctly does: say company size isn't listed rather than inventing a value.
6. **The follow-up-email "send" flow needs either real delivery or honest copy — not both mock delivery and delivery-implying copy.** Given the existing Resend integration already used for the Contact form, wiring it in is a bounded, low-risk option; if that's out of scope for now, the confirmation copy ("This can't be unsent") must be changed to something accurate ("Marks this as sent on your timeline") until it is.
7. **The signed-out job-teaser flow gets wired up, since the implementation and tests already exist and the only missing piece is a redirect.** This closes the gap between `docs/PROGRESS.md`'s claimed WJ-115/116 status and actual behavior — a shared job link currently 404s to "Job not found" instead of showing the intended teaser.
8. **"Not for me" gets a first-class, bulk-reviewable destination, and "Show me anyway" is fixed to actually restore rejected jobs (or is relabeled if that's not the intended behavior).** Today the only way to undo a rejection is finding that job's own detail page again — a genuine usability gap for what the audit confirmed is a real, working ranking-feedback feature worth surfacing better, not just preserving.
9. **Onboarding-completion gating moves server-side when `proxy.ts` is next touched.** Not urgent on its own, but any work that revisits routing/navigation for the new IA should close this rather than carry the client-only gate forward unexamined.
10. **Settings/advanced stays fully reachable, just off primary nav** — Automation Settings, Scheduled Runs, AI provider/BYOK, Profile, and PWA install all remain one tap away (via Wonder's advanced tier or the avatar menu), per the brief's explicit instruction that advanced configuration is not removed, only demoted.

## 7. Implementation rules carried forward into Step 2+

- **Reuse existing services — confirmed nothing here requires a backend rewrite.** `services/jobs/matching.ts`, `domain/workflow/*`, `services/ai/*`, `server/jobs/providers.ts`, `domain/automation/policy.ts`, and the entire persistence layer (`store/*`, `server/*`) are sound and stay untouched by the navigation/IA change. The redesign is screen composition and routing, not service logic.
- **Deep links to preserve or safely redirect:** `/app/jobs?q=`/`?fit=`/`?saved=1`, `/app/jobs/<id>` (plus the not-yet-live `?next=` teaser path), `/app/runs/<id>`, `/app/applications/<id>` and `/prepare`, `/app/automation/scheduled/<id>`, `?switch=wonderjobs` (BYOK-failure prompt), `/onboarding?next=`. Every one of these must resolve correctly once routes move under the new nav groupings — a redirect map, not a route rename that breaks bookmarks, is the expected mechanism for anything that changes URL.
- **Every preserved capability has a destination** — cross-checked against `docs/UX_CAPABILITY_MAP.md`; no capability listed in the baseline audit is left without a Keep/Relocate/Replace row.
- **Run `npm run check` (lint/typecheck/tests/build) before any push**, per `CLAUDE.md` — unchanged.
- **Update `docs/IMPLEMENTATION_TRACKER.md` and `docs/PROGRESS.md`** as Step 2+ work lands — this document and the capability map are the planning artifacts; the trackers remain the record of what's actually shipped.

## 8. Exit criteria status

Per the source brief: *"The capability map is complete and the new experience architecture is documented before major screen migration begins."*

- ✅ `docs/UX_BASELINE_AUDIT.md` — full inventory across all 25 requested areas, verified against `main` @ `cc7ef05`, not assumed from specs or trackers.
- ✅ `docs/UX_CAPABILITY_MAP.md` — every capability disposed (Keep/Relocate/Replace) against the 5-item primary nav.
- ✅ This document — target mental model, primary nav, progressive disclosure, product loop, non-negotiables checklist, and the decisions needed to reconcile the audit's findings with the new architecture.

**Step 1 exit criteria are met.** Screen migration (Step 2) has not started, per the brief's own sequencing.

## 9. Open questions before Step 2 starts

1. Should the confirmed defect/misleading-copy list (baseline audit, "Consolidated list of verified defects") be fixed as a standalone hygiene pass before screen migration, or bundled screen-by-screen as each one is touched? (Decisions 4–8 above assume "before or alongside," not "deferred indefinitely," but the sequencing is a product call.)
2. Is real follow-up-email delivery (wiring the existing Resend integration) in scope for this simplification effort, or is a copy fix sufficient for now (Decision 6)?
3. Is the three-surface AI-provider consolidation (Decision 2) in scope for Phase 1, or a later cleanup once the new IA's Settings destination exists?
4. Confirm the mobile bottom-bar decision (5 items, no "More") against actual device testing — five roughly-equal-width tabs is a design/ergonomics call, not just an IA one.
