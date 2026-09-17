# WonderJobs — Implementation Tracker

Maintained per spec §48. Status values: `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `NEEDS_REVIEW`.
"DONE" means: UI exists, interaction works, data/state is wired, error/empty states exist where relevant,
responsive behavior works, no obvious console/runtime errors (Rule 5).

Repo layout: `apps/web` (Next.js 16, App Router, TS, Tailwind v4). Vercel Root Directory = `apps/web`.

| ID | Area | Requirement | Status | Notes |
|---|---|---|---|---|
| WJ-001 | Foundation | Inspect existing architecture and identify reusable components | DONE | Repo was a fresh `create-next-app` shell; nothing to reuse. Restructured into an `apps/web` npm workspace to match the connected Vercel project's Root Directory. |
| WJ-002 | Foundation | Establish WonderJobs design tokens | DONE | `src/app/globals.css` — color/radius/shadow/motion tokens mapped into Tailwind v4 `@theme`. |
| WJ-003 | Foundation | Responsive layout system | DONE | Mobile-first Tailwind; AppShell verified at 390/768/1024/1280/1440. |
| WJ-004 | Foundation | Shared motion/animation utilities | DONE | `lib/motion.ts` (reduced-motion, low-power hint, animated numbers, shared clock), `ScrollReveal`, CSS keyframes in globals.css. |
| WJ-005 | Navigation | Desktop sidebar | DONE | `components/navigation/Sidebar.tsx`. |
| WJ-006 | Navigation | Mobile bottom navigation | DONE | `components/navigation/MobileNav.tsx`. |
| WJ-007 | Home | Desktop dashboard | DONE | `app/app/page.tsx` — hero, metrics, active run, top opportunities, activity, right rail. |
| WJ-008 | Home | Mobile dashboard | DONE | Same page, responsive grid collapses to single column; verified via screenshot at 390px. |
| WJ-009 | Workflow | Run Wonder setup | DONE | `app/app/runs/new` — goal, automation level, provider, search details. |
| WJ-010 | Workflow | Workflow timeline | DONE | `components/workflow/WorkflowTimeline.tsx` — one component, horizontal (dashboard) and vertical (run detail) variants; no duplicated logic (Rule spec §41). |
| WJ-011 | Workflow | Live stage progress | DONE | Engine emits progress/counts per chunk; UI subscribes via the workflow store (real state, not simulated — Rule 9). |
| WJ-012 | Workflow | Pause/resume | DONE | `WorkflowEngine.pause/resume`; covered by unit test. |
| WJ-013 | Workflow | Graceful stop | DONE | STOPPING → finish current unit → STOPPED, preserves completed stage outputs; unit test asserts outputs survive. |
| WJ-014 | Workflow | Rerun from stage | DONE | `WorkflowEngine.rerunFrom` inherits outputs/overrides, shares the idempotency ledger so already-submitted applications are never resubmitted; unit test covers this. |
| WJ-015 | Workflow | Manual stage override | DONE | `OverrideEditor` + `applyOverride`; overridden values flow into later stages via `resolveRunValue`. |
| WJ-016 | Workflow | Stage provenance | DONE | `Provenance` type (AI_GENERATED/USER_PROVIDED/USER_MODIFIED/SYSTEM_DERIVED) shown as badges throughout. |
| WJ-017 | Workflow | Workflow history | DONE | `app/app/runs` list + seeded execution records with stage-by-stage detail. |
| WJ-018 | Workflow | State machine validation | DONE | `domain/workflow/status.ts` — explicit transition table, `assertTransition` throws `InvalidTransitionError`; unit tested. |
| WJ-019 | Automation | Automation levels | DONE | Assist/Guided/Autonomous/Continuous; `resolveCapability` enforces risk-based gating (unit tested). |
| WJ-020 | Automation | Automation policy | DONE | `app/app/automation/settings` — automatic/ask me/off per capability, grouped by risk. |
| WJ-021 | Automation | Scheduled runs | DONE | `app/app/automation/scheduled` — list, enable/disable, run now, duplicate, delete. |
| WJ-022 | Automation | Scheduled workflow builder | DONE | `ScheduleBuilder` — trigger/schedule/stages/search/conditions/actions/level/provider. |
| WJ-023 | Automation | Workflow templates | DONE | `services/mock/templates.ts` — 5 templates, duplicate supported. |
| WJ-024 | Automation | Silence/no-op outcome | DONE | Runs set `silent: true` when nothing meaningful happened; notification logic skips them; scheduled-run cards say "quiet — nothing to report". |
| WJ-025 | Jobs | Jobs search UI | DONE | Debounced search, filters (mode/fit/freshness/salary/source), sort, paging. |
| WJ-026 | Jobs | Job cards | DONE | `components/jobs/JobCard.tsx`, shared across Home/Jobs/Run results. |
| WJ-027 | Jobs | Job detail | DONE | Overview / Why it's a match / Company / Sources & signals tabs. |
| WJ-028 | Jobs | Wonder Fit (match) | DONE | `services/jobs/matching.ts` — explainable per-dimension scoring, fit labels (never raw score alone). |
| WJ-029 | Jobs | Job quality signals | DONE | `computeQuality` — evidence-based signals, confidence language, no "ghost job" claims. |
| WJ-030 | Jobs | Save/not-for-me actions | DONE | Wired through `store/jobs.ts`; reflected everywhere a job appears. |
| WJ-031 | Applications | Application dashboard | DONE | Status-tab dashboard with deep links from Home/Jobs. |
| WJ-032 | Applications | Application timeline | DONE | `components/applications/ApplicationTimeline.tsx`. |
| WJ-033 | Applications | Application preparation | DONE | `app/app/applications/[id]/prepare` — Resume/Cover Letter/Answers/Review, real generation progress. |
| WJ-034 | Applications | Resume generation UI | DONE | `ArtifactEditor` — edit, regenerate, compare, restore versions. |
| WJ-035 | Applications | Cover letter UI | DONE | Same `ArtifactEditor`, `cover_letter` type. |
| WJ-036 | Applications | Screening answers UI | DONE | Same `ArtifactEditor`, `answers` type. |
| WJ-037 | AI | Provider abstraction | DONE | `services/ai/service.ts` (`AIProvider`/`AIService`) — application code never talks to a vendor SDK directly. |
| WJ-038 | AI | WonderJobs AI | DONE | `WonderJobsAIProvider` — deterministic templates, no key required, no per-token billing. |
| WJ-039 | AI | Anthropic BYOK | DONE | Server adapter via `@anthropic-ai/sdk`, `claude-opus-5` default model. |
| WJ-040 | AI | OpenAI BYOK | DONE | Server adapter via fetch (Chat Completions). |
| WJ-041 | AI | Gemini BYOK | DONE | Server adapter via fetch (generateContent). |
| WJ-042 | AI | Provider failure handling | DONE | Understandable errors + retry/change-provider/switch-to-WonderJobsAI actions; opt-in `FallbackProvider` never switches billing silently. |
| WJ-043 | AI | Usage transparency | DONE | `app/app/settings/ai` — per-provider token/cost totals, recent request log. |
| WJ-044 | Landing | Landing page shell | DONE | `app/page.tsx`, `MarketingNav`, `MarketingFooter`. |
| WJ-045 | Landing | Hero | DONE | `ParallaxHero` — headline, CTAs, microcopy. |
| WJ-046 | Landing | Parallax hero | DONE | Real scroll-linked transforms (rAF, translate3d only), reduced-motion and low-power aware. |
| WJ-047 | Landing | Source platform strip | DONE | Only sources with a real (mock) adapter are shown (`JOB_SOURCES.integrated`). |
| WJ-048 | Landing | AI career agent section | DONE | `AgentSection`. |
| WJ-049 | Landing | Search/analyze/prepare/track story | DONE | `JourneySection` — scroll-activated stage transitions via IntersectionObserver. |
| WJ-050 | Landing | Feature grid | DONE | `FeatureGrid`, links into the real product pages. |
| WJ-051 | Landing | Persona section | DONE | `PersonaSection` — clearly labelled as illustrative, not real testimonials (spec §33). |
| WJ-052 | Landing | AI provider section | DONE | `ProviderSection`. |
| WJ-053 | Landing | Final CTA | DONE | `FinalCTA`. |
| WJ-054 | Landing | Footer | DONE | `MarketingFooter`. |
| WJ-055 | Landing | Scroll reveal system | DONE | `ScrollReveal` (IntersectionObserver, respects reduced motion). |
| WJ-056 | UX | Gen-Z professional copy | DONE | Copy follows the spec's do/avoid list throughout product + marketing. |
| WJ-057 | UX | Loading/empty/error states | DONE | `common/States.tsx` (Skeleton/EmptyState/ErrorState/PageLoading) used on every data-bearing screen. |
| WJ-058 | UX | Toasts/feedback | DONE | `components/feedback/Toast.tsx`. |
| WJ-059 | Accessibility | Keyboard navigation | DONE | Roving-tabindex Tabs, dialog-based Modal, command palette arrow-key nav, visible focus ring token. |
| WJ-060 | Accessibility | Reduced motion | DONE | `useReducedMotion`, global `prefers-reduced-motion` CSS override, parallax fully disabled. |
| WJ-061 | Accessibility | Screen-reader workflow states | DONE | `aria-live` region on run detail, `role="progressbar"`, status never color-only (icon + label pairs). |
| WJ-062 | Security | BYOK secret handling | DONE | AES-256-GCM at rest, masked on read, per-tenant isolation, never logged (verified with curl + log grep), revocable. |
| WJ-063 | Security | Authorization checks | DONE | Server-side session cookie scopes every key/complete route to its own tenant; verified cross-tenant isolation with curl. |
| WJ-064 | Security | External action audit | DONE | `WorkflowAction.history` records created/confirmed/executing/succeeded/failed with timestamps. |
| WJ-065 | Performance | Image optimization | DONE | No raster imagery — all hero/scene art is inline SVG; no `next/image` payloads to optimize. |
| WJ-066 | Performance | Job list performance | DONE | Debounced search, paged rendering (24/page), memoized filtering. |
| WJ-067 | Performance | Animation performance | DONE | Parallax uses `translate3d`/`will-change` only, rAF-batched, no layout-triggering properties. |
| WJ-068 | Analytics | Core product events | DONE | `lib/analytics.ts` — all spec §47 events wired at their call sites; secrets/resume/answer text excluded by a forbidden-key filter. |
| WJ-069 | QA | Mobile visual QA | DONE | Screenshotted Home, Jobs, Landing, Onboarding at 390×844; no horizontal overflow observed. |
| WJ-070 | QA | Desktop visual QA | DONE | Screenshotted all major screens at 1440×900+; see PR/session notes. |
| WJ-071 | QA | Landing-page visual QA | DONE | Full-page screenshot at desktop + mobile; parallax verified via scroll before capture. |
| WJ-072 | QA | Workflow state QA | DONE | 13 unit tests cover the state machine, policy gating, pause/resume, graceful stop, rerun, overrides, partial failure, fatal failure. |
| WJ-073 | QA | Automation/rerun QA | DONE | Rerun test asserts inherited outputs and a skipped-duplicate external action. |
| WJ-074 | QA | Security QA | DONE | curl-based end-to-end check of the BYOK routes (save/verify/complete/list/delete) plus log-grep for key leakage. |
| WJ-075 | QA | Accessibility QA | NEEDS_REVIEW | Structural a11y (labels, roles, focus, contrast tokens) is in place; no automated axe/Lighthouse pass was run in this environment. |
| WJ-076 | Release | Production build validation | DONE | `npm run check` (lint + typecheck + vitest + `next build`) passes clean from the workspace root. |
| WJ-077 | Release | Performance validation | NEEDS_REVIEW | No Lighthouse/Web Vitals run captured in this environment; architecture follows the performance rules in §40. |
| WJ-078 | Release | Final UX polish | IN_PROGRESS | Core flows are DONE end to end; further passes (micro-copy, empty-state photography, additional breakpoints) can continue iteratively. |

## Deviations from the spec

- **Sources**: `LinkedIn, Indeed, Naukri, Foundit, Glassdoor, Wellfound` are mock adapters (`services/jobs/sources.ts`, `MockSourceAdapter`) backed by a deterministic generated job universe (~1,100 canonical roles). No real scraping/API integration exists yet; the `JobSourceAdapter` interface is the seam for swapping in real adapters later (per §2: "typed service/interface and realistic mock adapter").
- **BYOK secret store**: in-memory (`server/secrets.ts`), keyed by an httpOnly session cookie. This resets on cold start. The `SecretStore` interface is DB-ready (e.g. Supabase + RLS); swapping the implementation requires no route changes.
- **Auth**: no real login exists yet — the app assigns an anonymous per-browser session cookie. Wiring a real identity provider is out of scope for this pass but the `getSession()` seam in `server/auth.ts` is where it plugs in.
- **Scheduled runs**: the mock backend does not run a server-side cron; "Run now" executes immediately in the browser via the same `WorkflowEngine`. A production deployment needs a scheduler (e.g. a cron-triggered serverless function) calling the same `WorkflowService.startRun`.

## Working notes

- Repo was moved from the repo root into `apps/web` (npm workspaces) after the connected Vercel project's Root Directory (`apps/web`) was discovered to not exist, causing every prior deploy to fail at the clone step. `vercel.json` in `apps/web` pins the build command.
