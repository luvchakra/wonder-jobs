# Outcome-Based UX — Phase 1 Baseline

Audited against `claude/wonder-jobs-update-26qrf8` on 2026-09-24 (up to date with `origin/main`@`cc7ef05`), **after** the UX Simplification program (`docs/UX_FINAL_AUDIT.md`). This baseline doesn't repeat that program's inventory (`docs/UX_BASELINE_AUDIT.md`); it records where today's product stands against the outcome model in *Outcome-Based Experience Orchestration*: **Find → Decide → Apply → Progress**.

## Routes (unchanged since the previous program, verified from the production build's route table)

`/app` (Home) · `/app/jobs`, `/app/jobs/[id]` · `/app/applications`, `/app/applications/[id]`, `/app/applications/[id]/prepare` · `/app/career-dna` · `/app/insights`, `/app/resume-studio`, `/app/interview-prep`, `/app/learning` · `/app/runs`, `/app/runs/new`, `/app/runs/[id]` · `/app/automation/settings`, `/app/automation/scheduled`, `/app/automation/scheduled/new`, `/app/automation/scheduled/[id]` · `/app/calendar` · `/app/settings/ai` · `/app/profile` · `/onboarding` · public pages, auth pages, `/demo`.

## Workflow states (engine — preserve as-is)

- Stages (`domain/workflow/stages.ts`): profile → search → dedupe → understand → match → quality → rank → prepare → review → apply → track → learn.
- Run/stage status (`domain/workflow/status.ts`): PENDING, RUNNING, WAITING_FOR_USER, PAUSED, STOPPING, STOPPED, COMPLETED, COMPLETED_WITH_WARNINGS, FAILED, CANCELLED — one explicit transition table, unit tested.
- Engine operations: `startRun`, `pause`, `resume`, `continue`, `stop`, `cancel`, `restartStage`, `rerunFrom(stage)`, overrides, action confirm/reject — all idempotency-ledgered.

## Current user journeys vs. the outcome model

| Outcome | What the candidate does today | Gap against the outcome model |
|---|---|---|
| **Find** | Home → **"Run Wonder"** → a setup page led by "Career Goal", an automation-level card, an AI-provider card, and a collapsed "Search details" card → run detail page whose default tab is the **12-stage timeline** + a per-stage detail panel. | The primary term is "Run Wonder" (spec: never primary). Entry is a configuration page, not "What are you looking for?". Execution is shown **as stages** — exactly what §6 says not to lead with. A finished run's summary (`describeOutcome`) is already outcome-worded, but still references stages ("Open 'Searching job sources' in the timeline", "Rerun from stage"). |
| **Decide** | Jobs list with For You/All/Saved presets and a Refine panel; job detail with Overview / Why it's a match / Company / Sources & signals; aggregate "Why Was This Filtered"; Ask Wonder can explain one job's visibility. | Job cards show a fit label + highlight chips, **not** "Why Wonder surfaced this / Things to consider / next suggestion". **No comparison** exists anywhere. Per-job "why filtered" names the filter but offers no "Change preference / Show it anyway" pair in-line. |
| **Apply** | Application Pack (`/prepare`) with Resume / Cover Letter / Answers / Review tabs, fit summary, missing-information card, "Continue to Employer" hand-off. | Already the right concept. Missing an at-a-glance "Application ready — Wonder prepared ✓… / Before you continue" summary at the top. |
| **Progress** | Applications defaults to a Needs-attention list + 4-column pipeline; detail page is timeline-first with follow-ups. Home surfaces follow-ups/interviews/ready-for-review. | Home has no compact "Your progress" block (active / interviews this week / follow-ups due / employer replied). |

## Terminology audit (occurrences in `apps/web/src`, excluding tests)

| Term | Count | Spec position |
|---|---:|---|
| "Run Wonder" | 21 | Not primary terminology → "Find opportunities" / "Search with Wonder" |
| "Rerun from stage" / "Restart stage" | 4 / 2 | Primary UX says "Search again" / "Recheck"; stage-level controls move to Advanced |
| "Scheduled Runs" / "Scheduled runs" | 4 / 6 | "Scheduled searches" |
| "Automation Settings" | 13 | Nav label → "What Wonder can do" (route unchanged) |
| "Your Active Run" / "No active run" | 1 / 1 | "Wonder is finding opportunities" / "Find opportunities" |
| Automation levels "Assist me / Work with me / Work independently / Keep working" | — | Spec §21: "Help me / Work with me / Work independently / Keep watch" |

## Reusable components (keep, re-home)

`WorkflowTimeline`, `StageDetail`, `WorkflowControls`, `OverrideEditor`, `ActionApprovalList`, `RunErrorBanner` → move behind **"See how Wonder worked"** on the run page (not deleted). `describeOutcome` (`domain/workflow/outcome.ts`) → reuse as the orchestrator's result summary, with stage language removed. `computeHomeAttention` / `computeApplicationAttention`, `explainJobVisibility`, `resolveWonderQuery`, `computeMissingSkills` → reuse from the orchestrator. `JobCard`, `FitLabel`, `ArtifactEditor`, `AutomationLevelSelector`, `ScheduleBuilder` → keep.

## Duplicated/competing surfaces

- Run progress is rendered three ways (horizontal timeline on Home's `ActiveRunCard`, vertical on mobile Home, full timeline on the run page) — all stage-shaped. The outcome model wants one plain-language progress view everywhere, with the timeline only in Advanced.
- AI provider appears on three surfaces (known, pre-existing — `docs/UX_MIGRATION_VERIFICATION.md`).

## Trust findings surfaced by this audit

- **Resume import can overwrite confirmed Career Profile data without showing it.** `ResumeImport.tsx` pre-ticks every field the resume yielded — including fields the candidate has already filled — and shows only the resume's value, never the current one. Spec §28: "Never silently overwrite confirmed information. Conflicts must be surfaced." Fix in this program.
- LinkedIn still has no integration (no public API) — nothing to import; conflicts can only arise between the resume and what's already in the profile.
- Learning today is driven only by "Not for me" (`domain/career/learning.ts`). Spec §29 wants positive signals too; there is no persisted positive-signal learning, so the product must not claim any.

## Navigation map (current)

Primary (all viewports): Home · Jobs · Applications · Career · Wonder. Secondary: **Wonder** → Scheduled Runs, Automation Settings · **Career** → Insights, Resume Studio, Interview Prep, Learning · **Resources** → Help & Guide. Command palette ("Ask Wonder") reaches everything plus Calendar and AI settings.
