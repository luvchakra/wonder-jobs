# WonderJobs — UX Capability Map

Companion to `docs/UX_BASELINE_AUDIT.md` (the inventory this is derived from) and `docs/UX_SIMPLIFICATION_DECISIONS.md` (the target IA this maps against). Every capability the baseline audit found is listed exactly once below, with its disposition against the new experience architecture (Home / Find Jobs / Applications / Career / Wonder, settings kept but demoted out of primary nav).

**Disposition legend:**
- **Keep** — capability and its current implementation stay as-is; no new work required, at most a label/entry-point change already noted in Relocate.
- **Relocate** — same implementation, different destination in the IA (new nav position, different tab/level of progressive disclosure).
- **Replace** — the implementation, copy, or wiring needs to change before or during migration (a bug fix, a copy fix, a missing capability, or a consolidation of duplicates). Every Replace row is also logged as a defect in the baseline audit or as a consolidation decision in the decisions doc.

A capability can carry more than one mark (e.g. Keep the logic, Relocate the entry point, Replace the copy).

---

## Home

| Capability | Current location | Service/API | Current entry | Keep | Relocate | Replace | Risk |
|---|---|---|---|:---:|:---:|:---:|---|
| Metric tiles (matches/follow-ups/interviews/apps this week) | `app/app/page.tsx` | `useJobsStore`, `useApplicationsStore` | `/app` | ✅ | | | Low — real, store-backed data |
| Active run card | `components/workflow/ActiveRunCard.tsx` | `useWorkflowStore` | `/app`, `/app` mobile | ✅ | | | Low — single shared component, no duplication |
| Top opportunities | `app/app/page.tsx` | `useJobsStore` | `/app` | ✅ | | | Low |
| Recent activity | `app/app/page.tsx`, `MobileHome.tsx` | `useCareerStore.activity` | `/app` | ✅ | | | Low |
| "Ask Wonder" CTA (command palette) | `TopBar.tsx`, `app/app/page.tsx`, `MobileHome.tsx` | `CommandPalette.tsx` (static filter, no LLM) | `/app` (3 surfaces) | | ✅ Keep as a router, but re-scope copy | ✅ | Medium — copy implies chat that doesn't exist; either fix copy to "search & go to" framing, or explicitly scope a real assistant as future work. Do not ship the new IA repeating the same over-promise on 3 surfaces. |
| Mobile "automation state" chips | `MobileHome.tsx` | `useAutomationStore.defaultLevel` | `/app` mobile | | | ✅ | Low — either make it genuinely live (reflect the active run's level once one exists) or relabel as "your default level" |
| AI provider summary card | `components/ai/AIProviderCard.tsx` | `useAIStore` | `/app` | | ✅ Relocate as one of 3 provider surfaces — see Settings | | Medium — part of the 3-surface consolidation, see Wonder/Settings section |

## Find Jobs

| Capability | Current location | Service/API | Current entry | Keep | Relocate | Replace | Risk |
|---|---|---|---|:---:|:---:|:---:|---|
| Job search (free text, debounced) | `app/app/jobs/page.tsx` | `useJobsStore` | Jobs nav, command palette | ✅ | | | Low |
| Job list / cards | `components/jobs/JobCard.tsx` | `useJobsStore` | Jobs, Home, Run results | ✅ | | | Low |
| Job detail (Overview / Why / Company / Sources) | `app/app/jobs/[id]/page.tsx` | `server/jobs/lookup.ts` | Job card click | ✅ | | | Low, except Company tab (below) |
| Filters (mode/source/fit/freshness/salary/saved) | `components/jobs/JobFilters.tsx` | `domain/jobs/filterExplain.ts` | Jobs list | ✅ | | | Low |
| Multi-source aggregation & dedup | `server/jobs/providers.ts`, `services/jobs/matching.ts` | `/api/jobs/search`, `/api/jobs/sources` | Jobs, Run search stage | ✅ | | | Low — single implementation shared by client and cron runs |
| Wonder Fit (matching + explanation) | `services/jobs/matching.ts` | n/a (client compute) | "Why it's a match" tab, badges | ✅ | | | Low |
| Match-score badge visibility | `components/jobs/MatchBadge.tsx` | n/a | `JobCard`, detail header | | | ✅ | Medium — bare "% match" with label hover-only; make the fit label visible by default, not just in a tooltip |
| Quality signals | `services/jobs/matching.ts::computeQuality` | n/a | Detail "Sources & signals", badge | ✅ | | | Low |
| "Why This Job" (Why it's a match) | Job detail "why" tab | n/a | Job detail | ✅ | | | Low |
| "Why Was This Filtered" | `components/jobs/FilteredBreakdown.tsx` | `domain/jobs/filterExplain.ts` | Jobs list (compact + empty states) | ✅ | | ✅ | Medium — "Show me anyway" must actually clear rejections, or say explicitly that it doesn't |
| Bulk review of rejected ("not for me") jobs | *(does not exist)* | `store/jobs.ts::reject/unreject` | n/a | | | ✅ New surface needed | Medium — currently the only undo path is opening a specific job's detail page; the new IA should give this a real destination (e.g. a "Not for me" filter view with per-item Undo) |
| Save / not-for-me actions | `store/jobs.ts` | n/a | Card (save only), detail (both) | ✅ | | ✅ | Medium — add a not-for-me affordance on the card itself, not detail-only, to remove the friction asymmetry with Save |
| "Not for me" learning loop | `domain/career/learning.ts` | `useCareerStore.learnedSignals` | Silent (affects ranking) + Career DNA review | ✅ | | | **Protect from regression** — real, bounded, previously mis-claimed and since fixed |
| Company tab company-size fallback | `app/app/jobs/[id]/page.tsx` | `services/mock/catalog.ts` (demo list) | Job detail "Company" tab | | | ✅ | **High — real-data-only violation.** Fix to say "not listed" for unknown real companies, matching the signed-out teaser's correct behavior |
| Signed-out shared-job teaser | `server/jobs/lookup.ts`, `teaser.ts`, `JobTeaser.tsx` | n/a | *(currently unreachable)* | ✅ implementation | ✅ wire the route | | **High — feature is built and tested but dead.** Needs the proxy/mode logic to actually redirect an anonymous `/app/jobs/<id>` visit into `/sign-in?next=...` instead of silently falling into demo mode |
| Run-setup "minimum match score" vs. jobs-list "Fit" filter | `app/app/runs/new/page.tsx`, `JobFiltersBar` | n/a | Run setup, Jobs filters | ✅ both stay | | ✅ | Medium — two different thresholds with the same name in different places; disambiguate the copy in the new IA |

## Applications

| Capability | Current location | Service/API | Current entry | Keep | Relocate | Replace | Risk |
|---|---|---|---|:---:|:---:|:---:|---|
| Applications dashboard (status tabs) | `app/app/applications/page.tsx` | `useApplicationsStore` | Applications nav | ✅ | | | Low |
| Application timeline | `components/applications/ApplicationTimeline.tsx` | n/a | Application detail | ✅ | | | Low |
| Application preparation (Resume/Cover/Answers/Review) | `app/app/applications/[id]/prepare/page.tsx` | `services/ai/service.ts` | "Add & prepare", card link | ✅ | | ✅ | Medium — simulated progress steps should be honest (single spinner) or genuinely track sub-stages |
| Shared artifact editor (rich text, autosave, regenerate, compare, restore) | `components/applications/ArtifactEditor.tsx` | `store/applications.ts` | Prepare tabs | ✅ | | | **Protect from regression** — one real implementation for all 3 artifact types |
| Follow-up/thank-you email drafting | `components/applications/FollowUpAction.tsx` | `TemplateAIService`, `store/actions.ts` | Application detail "Reach out" | | ✅ consider folding into the shared editor pattern | ✅ | **High — misleading copy.** "This can't be unsent" claims real delivery; implementation is a 700ms mock. Either wire the existing Resend integration in, or change the copy/labels to something honest ("Mark as sent") until it does |
| Download materials (.docx) | `lib/docx.ts`, `lib/zip.ts` | n/a | Application detail | ✅ | | | Low — genuine, spec-compliant, dependency-free |
| "Open application page" / "Mark as submitted" | `app/app/applications/[id]/page.tsx` | n/a (local status only) | Application detail | ✅ | | ✅ copy clarity | Medium — self-reported with no verification, by design; make that explicit in the new IA's copy rather than implying tracking accuracy |
| External-action audit ledger | `store/actions.ts`, `/api/audit` | Supabase `action_audit` | Behind follow-up send only | ✅ | | | Low, but currently only wired to one of three declared action types — note for future work, not this phase |
| Extension cross-sell hint | `ExtensionHint` in application detail | `lib/useExtensionInstalled.ts` | Application detail | ✅ | | | Low |
| Chrome extension (autofill) | `/extension` page, `app/api/extension/*`, `/extension` source at repo root | Token/profile/application routes | Marketing page, application detail hint | ✅ | | | Low — real, working, correctly discloses limits and never submits |

## Career

| Capability | Current location | Service/API | Current entry | Keep | Relocate | Replace | Risk |
|---|---|---|---|:---:|:---:|:---:|---|
| Career DNA editor | `app/app/career-dna/page.tsx` | `useCareerStore` | Career DNA nav | ✅ | | | Low |
| Re-scoring on Career DNA change | `store/StoreHydrator.tsx`, `services/jobs/matching.ts` | n/a | Automatic | ✅ | | | **Protect from regression** — confirmed real, subscription-driven |
| Resume import | `components/career/ResumeImport.tsx`, `server/resume/*` | `/api/career/import-resume` | Onboarding step 2, Career DNA header | ✅ | | | Low — well-scoped, evidence-shown, file never persisted |
| Learned preferences review | `components/career/LearnedPreferences.tsx` | `useCareerStore.learnedSignals` | Career DNA page | ✅ | | | Low |
| Onboarding | `components/career/OnboardingFlow.tsx` | `useCareerStore`, `useAutomationStore` | First `/app` visit | ✅ | | | Low, except the server-side gating gap noted below |
| Onboarding server-side gate | `apps/web/src/proxy.ts` (absent) | n/a | n/a | | | ✅ | Medium — completion gating is currently client-only; a not-yet-onboarded session can see a flash of `/app/*` before redirect |
| Insights (Career Insights card + `/app/insights`) | `app/app/insights/page.tsx`, `useCareerStore.insights` | n/a | Home right rail, Insights nav | | ✅ under Career | | Low — currently primary nav; fits "improve my career profile" better than a standalone top-level item |
| Resume Studio | `app/app/resume-studio/page.tsx` | n/a | Resources nav group | | ✅ under Career | | Low — organizes real materials already; deeper coaching is a future story, not a Phase-1 concern |
| Interview Prep | `app/app/interview-prep/page.tsx` | n/a | Resources nav group | | ✅ under Career | | Low — same as above |
| Learning | `app/app/learning/page.tsx` | n/a | Resources nav group | | ✅ under Career | | Low |
| LinkedIn functionality | *(does not exist, by design)* | n/a | n/a | ✅ non-existence is correct | | | Low — nothing to build; keep the honest "no public API" disclosure in Help. Fix the one demo-seed flavor string that implies otherwise |

## Wonder (automation / runs)

| Capability | Current location | Service/API | Current entry | Keep | Relocate | Replace | Risk |
|---|---|---|---|:---:|:---:|:---:|---|
| Run setup | `app/app/runs/new/page.tsx` | `WorkflowService.startRun` | "Run Wonder" CTA | ✅ | | | Low |
| Run detail (Progress/Results/Logs) | `app/app/runs/[id]/page.tsx` | `useWorkflowStore` | Run list, Active run card | ✅ | | | Low |
| Workflow engine (state machine, stages) | `domain/workflow/engine.ts`, `status.ts`, `stages.ts` | n/a | Underlies all runs | ✅ | | | **Protect from regression** — no defects found in the core engine |
| Pause / resume / graceful stop | `WorkflowEngine.pause/resume/stop` | n/a | `WorkflowControls.tsx` | ✅ | | | Low |
| Rerun from stage | `WorkflowEngine.rerunFrom` | n/a | Run detail (terminal runs), error banner Retry | ✅ | | | Low |
| Manual stage override | `components/workflow/OverrideEditor.tsx`, `resolve.ts` | n/a | Run detail per-stage | ✅ | | | Low |
| Waiting-for-user / pending approvals | `WorkflowEngine.requestUser/continueFromUser` | n/a | Run detail, sticky mobile bar, push | ✅ | | | Low |
| Apply-stage action approval | `components/workflow/ActionApprovalList.tsx` | n/a | Run detail "apply" stage | ✅ underlying behavior | | ✅ copy | **High — misleading copy, highest-priority fix.** "Submits your application... can't be undone" must be rewritten to describe the real effect (opens the employer's page, hands off) before or during migration |
| Apply-stage "submitted" count | `components/workflow/WorkflowTimeline.tsx` | n/a | Run timeline (dashboard + detail) | | | ✅ | Medium — reads a count key the executor never writes; always shows 0 |
| Scheduled runs (list/enable/duplicate/delete) | `app/app/automation/scheduled/page.tsx` | `useWorkflowStore` | Automation nav group | | ✅ under Wonder, out of primary nav | | Low |
| Schedule builder | `components/automation/ScheduleBuilder.tsx` | n/a | New/edit scheduled run | | ✅ under Wonder | | Low |
| Workflow templates | `services/mock/templates.ts` | n/a | Scheduled runs gallery | | ✅ under Wonder | | Low |
| Silent/no-op schedule outcome | `domain/workflow/engine.ts::conditionMet` | n/a | Schedule condition evaluation | ✅ | | | Low — genuinely tested and honest |
| Server-side cron | `app/api/cron/scheduled-runs/route.ts`, `serverExecutors.ts` | Vercel Cron | Invisible (background) | ✅ | | | **Protect from regression** — the cleanest structural enforcement of "never mass auto-apply" in the codebase (server engine has no `prepare`/`review`/`apply` executor at all) |
| Scheduled-run notification links | `server/workflow/scheduledRun.ts` | n/a | Push, activity feed | | | ✅ | Low effort, real bug — `/app/run/{id}` should be `/app/runs/{id}` |
| Automation levels (Assist/Guided/Autonomous/Continuous) | `domain/automation/policy.ts` | n/a | Automation Settings, Run setup, Schedule builder | ✅ behavior | | ✅ copy | **High — misleading copy** on Autonomous/Continuous descriptions, paired with the capability-description fix below |
| Automation policy (per-capability automatic/ask/off) | `components/automation/AutomationPolicy.tsx` | `resolveCapability` | Automation Settings | ✅ | ✅ under Wonder, "advanced" tier | ✅ | Medium — `submit_application` capability description overstates what the code does; screening-answers generation has no capability at all (policy asymmetry) |
| Notifications (in-app) | `store/career.ts::notify`, `TopBar` bell | Real follow-up/interview/schedule data | Always present | ✅ | | | Low |
| Push notifications | `server/push/webPush.ts`, `PushNotifications.tsx` | `/api/push/subscribe` | Profile page (only if VAPID configured) | ✅ | | | Low — genuine RFC-compliant implementation |
| Calendar subscribe feed | `app/app/calendar/page.tsx`, `/api/calendar/*` | `server/ics.ts` | Calendar nav | | ✅ Relocate: fold into Home "Upcoming" + a Settings-level subscribe action | | Medium — no link-rotation affordance; flag as a known limitation, not blocking |

## Settings / advanced (not primary nav)

| Capability | Current location | Service/API | Current entry | Keep | Relocate | Replace | Risk |
|---|---|---|---|:---:|:---:|:---:|---|
| AI provider selection & BYOK | `app/app/settings/ai/page.tsx`, `BYOKForm.tsx` | `/api/ai/keys*` | Avatar menu, 3 redundant surfaces | ✅ underlying capability | ✅ consolidate the 3 surfaces into: one settings page + one lightweight inline picker | | Medium — `AIProviderCard`, `ProviderSelector`, and the full settings page overlap; pick one canonical settings destination and keep the inline picker minimal |
| Usage transparency (tokens/cost/log) | `/app/settings/ai` | n/a | AI settings page | ✅ | | | Low |
| Profile & account settings | `app/app/profile/page.tsx` | n/a | Avatar menu | ✅ | | | Low |
| PWA install | `lib/pwa.ts`, `components/pwa/*` | n/a | Avatar menu (Chromium only) | ✅ | | | Low — honest about iOS/Firefox unavailability |
| Help center & assistant | `app/help/page.tsx`, `HelpAssistant.tsx` | `/api/help/ask` | Global, public, avatar menu | ✅ | | | Low — genuine retrieval-first design |
| Contact | `app/api/contact/route.ts` | Resend (optional) | Landing page | ✅ | | | Low |

## Cross-cutting (not owned by one nav destination)

| Capability | Current location | Service/API | Current entry | Keep | Relocate | Replace | Risk |
|---|---|---|---|:---:|:---:|:---:|---|
| Route protection | `apps/web/src/proxy.ts` | n/a | Every navigation | ✅ | | ✅ onboarding gate | Medium — see Career section above |
| Navigation config (single source of truth) | `components/navigation/nav.ts` | n/a | Sidebar, drawer | ✅ | ✅ this file is exactly what Step 2 rewrites | | Low — verified no desktop/mobile drift today; must not regress when the new 5-item nav replaces it |
| Demo mode | `app/demo/route.ts`, `services/mock/seed.ts` | n/a | "Explore the demo" links | ✅ | | ✅ one string | Low — fix the LinkedIn flavor-text string; otherwise keep as-is |
| Accessibility audit | `scripts/a11y-audit.mjs` | n/a | `npm run a11y` (manual) | ✅ | | ✅ wire into CI, expand page coverage | Medium — not blocking Phase 1, but the new IA's screens should be added to `DEMO_PAGES` as they ship |
| Security/audit — RLS posture | Supabase migrations | n/a | n/a | ✅ current app-layer isolation is defensible | | | **Flag, don't fix in Phase 1** — document that "RLS enabled" ≠ "RLS enforced"; relevant if the redesign touches auth/session code |
| Tests (unit + E2E + a11y) | `apps/web/src/**/*.test.ts`, `apps/web/e2e/*` | n/a | CI (unit only) | ✅ | | ✅ add coverage for touched flows | High — E2E/a11y coverage gap concentrates exactly on the flows a redesign is most likely to touch (automation, Career DNA, BYOK, PWA); each screen migrated in Step 2+ should get at least a golden-journey E2E addition, not just a passing unit-test suite |
