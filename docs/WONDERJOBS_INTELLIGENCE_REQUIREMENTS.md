# WonderJobs — Intelligence & Usability Requirements: Status

**Source documents:**
`WONDERJOBS_UPDATED_REQUIREMENTS_V3_RESUME_LINKEDIN.md` (43 sections + a Resume Import deep-dive + a
LinkedIn Import/Improvement Assistant deep-dive) and `WonderJobs_FULL_PLAYWRIGHT_TEST_PLAN.md` (whose
own Playwright scope is superseded by v3 §32's suite, which supersedes it).

**Purpose of this file:** an honest, per-item status of that mandate, so nobody — a future session, a
reviewer, the product owner — has to guess how much of it actually landed versus how much is still the
requirements doc itself. Per the source document's own rule: *"Never mark PASS without execution."* The
same standard applies here to implementation status: nothing below is marked DONE without a file, a
test, or both to point at.

**This is a multi-session mandate.** It specifies ten implementation phases, a formal LinkedIn OAuth/
import/AI-improvement subsystem, a persistent learning engine across eleven interaction types, cross-
source opportunity memory with change detection, first-class job comparison, a natural-language "Wonder
Agent," a formal source-health model, and a five-browser Playwright suite with 30+ spec files. One pass
closed the two defects that were both (a) explicitly named as "Critical Gaps" and (b) real, verifiable
bugs already in production, with tests. Everything else below is scoped but not started.

---

## Critical Gaps (§3) — the 12 items the spec calls out by name

| # | Gap | Status | Evidence |
|---|---|---|---|
| 1 | Never invent candidate facts in AI-generated content | **DONE** | WJ-098, `docs/AI_GROUNDING_REPORT.md`, 14 tests |
| 2 | Turn "Ask Wonder" into a real intent-driven agent entry point | BACKLOG | No natural-language agent exists; §8's intent JSON, editable-chip preview and agent actions are unbuilt |
| 3 | Implement a real candidate learning loop | **PARTIAL** | Negative loop (rejections → ranking) done, WJ-099. Positive loop (saves/applications → preference suggestions, §17/§35's own worked example) not started |
| 4 | Make "Not for me" actually influence ranking, or remove the claim | **DONE** | WJ-099, `docs/LEARNING_EVALUATION_REPORT.md`, 21 tests |
| 5 | Explain why jobs were shown AND why filtered | **DONE** | "Why This Job" (shown jobs) pre-existing. "Why Was This Filtered" (WJ-101): every catalog job hidden by an active filter or "not for me" is attributed to a specific reason, shown as a breakdown with the spec's required "Show me anyway"/"Change my preferences" actions. **Scope note:** covers jobs hidden by the candidate's own filters and rejections — a job the *search stage itself* never discovered (a source's own query missing it) isn't "filtered" in this sense and isn't covered; that's source coverage transparency (Gap #9), a separate concern |
| 6 | First-class job comparison | BACKLOG | No comparison UI or data model |
| 7 | Evidence-based application recommendations ("Should I spend time on this?") | BACKLOG | Not built |
| 8 | Persistent opportunity memory across searches/sources | BACKLOG | No cross-run job identity; each run's catalog replaces the last (`replaceCatalog`) rather than merging into persistent history |
| 9 | Source coverage/freshness/failure transparency | **PARTIAL** | Run evidence already shows per-source counts and "Needs setup"/"Unavailable" (pre-existing). The formal `Source` model (§21: coverage, freshness, errorRate, legalAccessMethod) doesn't exist |
| 10 | Never claim a simulated external action succeeded | **ALREADY TRUE** | Pre-existing: `WorkflowAction.status` already distinguishes `pending_confirmation`/`confirmed`/`executing`/`succeeded`/`failed`/`skipped_duplicate`; the apply stage is an audited hand-off, never a claimed submission. Re-verified, not changed, this pass |
| 11 | Application Pack (complete workspace) | BACKLOG | Application preparation exists (resume/cover letter/answers) but not restructured into the 11-part Application Pack §15 describes |
| 12 | Comprehensive Playwright E2E suite, actually executed | PARTIAL | `apps/web/playwright.config.ts` + `apps/web/e2e/` exist; `auth.spec.ts` (18 tests) and `golden-journeys.spec.ts` (7 tests, demo mode) have both actually run against chromium: 20 passed, 5 honestly skipped, 0 failed — see `docs/TEST_EXECUTION_REPORT.md`. Firefox/WebKit BLOCKED (no binaries in this sandbox). Automation, Career DNA editing, BYOK/AI settings and PWA/push flows still have no spec file |

## Resume Import (§5.0) — status against its own 28 test cases

Resume import already shipped in an earlier session (WJ-095): PDF/DOCX/text extraction with no external
dependency, mapped into Career DNA with per-field evidence, nothing applied without the candidate ticking
it. That satisfies the *core* of §5.0's acceptance criteria and roughly RESUME-001–005, 011–019, 021,
026–027 in spirit, but was built and tested against the *original* Career DNA/onboarding spec, not
re-verified against this document's exact structured `ResumeImport` model (`experiences[]`, `education[]`,
`certifications[]`, per-field `confidence`, ambiguity handling) or its provenance vocabulary
(`RESUME_IMPORTED`/`DERIVED`/`AI_SUGGESTED`/`REQUIRES_CONFIRMATION`/`USER_PROVIDED` — the existing
implementation uses evidence strings, not this five-state enum). **Not re-scored here as DONE against
v3's specific model**, and RESUME-006–010 (structured employment history/education/certifications
extraction), RESUME-020/022–025 (partial-extraction recovery UX, replacement-resume reconciliation,
mobile flow, tenant-isolation test) and RESUME-028 (AI artifacts grounded in confirmed *resume* data
specifically) are unverified against this doc's acceptance bar.

## LinkedIn Import & Improvement Assistant (§5.0A) — status

**Not started.** This is a large, separate subsystem: an authorized-import mechanism (the spec itself is
explicit that scraping is not an acceptable foundation), a structured `LinkedInImport` model, a
resume/LinkedIn reconciliation UI, and a full profile-improvement-suggestion engine (headline/About/
experience/skills analysis, grounded rewrites, an Improvement Pack, a rejection-learning loop). None of
`LINKEDIN-001` through `LINKEDIN-036` have been attempted. The product/compliance decision the spec asks
for first — *which* authorized mechanism (official API, user-provided export, pasted text) — hasn't been
made, and shouldn't be guessed at in code before it is.

## Phases (§40)

| Phase | Status | Notes |
|---|---|---|
| 0 — Inspect | DONE | This pass and prior sessions read `main`, `CLAUDE.md`, `README.md`, tracker, progress, architecture, tests |
| 1 — Trust | **PARTIAL** | AI grounding (WJ-098) and truthful external-action states (already true, re-verified) done. "Remove fabricated fallback content" done for the template AI path only, not audited across every other UI copy string in the app |
| 2 — UX (staged onboarding, Today dashboard, progressive disclosure, mobile) | BACKLOG | Existing onboarding/Home are the pre-mandate implementation, not restructured to §6/§5's staged flow or §4's three-level disclosure |
| 3 — Wonder Agent | BACKLOG | Not started |
| 4 — Opportunity Intelligence (Why Filtered, comparison, recommendation, memory) | **PARTIAL** | Why Filtered done (WJ-101); comparison, recommendation and memory not started |
| 5 — Learning | **PARTIAL** | Negative/rejection path only (WJ-099) |
| 6 — Application Intelligence (Application Pack) | BACKLOG | Not started |
| 7 — Source Intelligence | BACKLOG | Not started |
| 8 — Automation (natural-language schedules) | BACKLOG | Existing schedule builder (form-based, pre-mandate) works and is tested; not rebuilt as natural-language |
| 9 — Playwright | PARTIAL | Infrastructure + `auth.spec.ts` + `golden-journeys.spec.ts` exist and have actually run (chromium); automation/Career-DNA/BYOK/PWA specs not started |
| 10 — Full regression | N/A until the above exist | `npm run check` (lint/typecheck/unit tests/build) passes as of this pass: 158/158 unit tests, build green |

## Definition of Done (§41) — checked against what actually exists today

Only items this pass or a prior, verified session can support are checked. Unchecked is the honest
default, not an oversight.

- [ ] New users can onboard without documentation — unchanged from pre-mandate onboarding
- [ ] First useful opportunities reached quickly — unchanged
- [ ] Important inferred preferences confirmed before saving — true for resume import (WJ-095); not audited elsewhere
- [ ] Career facts have provenance — partial (resume-import evidence strings exist; not the five-state enum this doc specifies)
- [x] **No AI artifact invents candidate facts** — WJ-098, tested
- [ ] Ask Wonder understands natural-language intent — not built
- [ ] Intent can create/update workflows — not built
- [ ] Intent interpretation is editable — not built
- [x] Why This Job is evidence-based — pre-existing, unchanged
- [ ] Why Filtered is implemented — not built
- [ ] Job comparison works — not built
- [ ] Application recommendation explains trade-offs — not built
- [ ] Opportunity memory works across runs/sources — not built
- [ ] Posting changes are detected — not built
- [x] **Not-for-me feedback affects ranking** — WJ-099, tested
- [x] **Learning requires sufficient evidence** — WJ-099's 3-rejection threshold, tested
- [x] **Important learning changes require confirmation** — learned signals never touch Career DNA; only a candidate action changes what's confirmed, tested
- [ ] Application Pack works end-to-end — not restructured
- [x] External action states are truthful — pre-existing (`WorkflowAction.status`), re-verified
- [x] Simulated actions cannot appear as successful real delivery — pre-existing, re-verified
- [ ] Scheduled workflows are understandable to non-technical users — existing builder is form-based, not natural-language
- [ ] Source failures distinguishable from zero results — partial (evidence already shows this per-run; no formal source-health model)
- [x] Automation remains policy-controlled — pre-existing, unchanged
- [x] BYOK behaviour is explicit — pre-existing, unchanged
- [x] Tenant isolation passes — pre-existing, unit/integration-tested in prior sessions; not re-run as part of this pass
- [x] Playwright suite exists and has actually run (partial) — `auth.spec.ts` (18 tests) + `golden-journeys.spec.ts` (7 tests) against chromium: 20 passed, 5 honestly skipped, 0 failed. Automation, Career DNA editing, BYOK/AI settings and PWA/push flows not written yet
- [x] Golden journeys pass (demo mode) — `golden-journeys.spec.ts`: jobs list/detail/match, save, not-for-me, applications routing, run Wonder — 7/7, stable across a repeated run. A real signed-in account's equivalent journeys (non-seeded data) not covered
- [x] Accessibility passes — `npm run a11y`: 19 pages + 3 interaction states, 0 violations. Found and fixed a real pre-existing moderate heading-order defect in the shared `EmptyState` component (h3 directly under a page's h1) while adding coverage for WJ-101's new empty-state UI
- [ ] Mobile/browser smoke passes — chromium-only verified; firefox/webkit/Mobile Safari BLOCKED (no binaries in this sandbox), Mobile Chrome not independently run
- [x] Production build passes — `npm run build` green this pass
- [x] No P0 defects remain *among what was tested* — the two fixed items were the P0/P1-grade defects found; nothing else was audited for defects this pass
- [ ] No P1 defects remain in core candidate journeys — not fully audited; only the AI-artifact and not-for-me paths were
- [ ] Documentation matches implementation — this file exists specifically so it does, for what's covered; the rest of the mandate is honestly marked backlog above

## Required deliverables (§42) — this file's own checklist

- [x] `docs/WONDERJOBS_INTELLIGENCE_REQUIREMENTS.md` — this file
- [x] `docs/IMPLEMENTATION_TRACKER.md` — updated (WJ-098, WJ-099)
- [x] `docs/TEST_EXECUTION_REPORT.md` — produced, covering the real `auth.spec.ts` and `golden-journeys.spec.ts` executions
- [x] `docs/AI_GROUNDING_REPORT.md` — produced
- [x] `docs/LEARNING_EVALUATION_REPORT.md` — produced

## What a future session should pick up next, in priority order

1. **Automation E2E coverage** (§32) — `auth.spec.ts` and `golden-journeys.spec.ts` (demo mode) are now
   real and green (`docs/TEST_EXECUTION_REPORT.md`); the next highest-leverage addition is a spec for the
   automation surface (scheduled runs, policy settings) and Career DNA editing with a real (non-seeded)
   signed-in account, since those still have zero execution-verified coverage.
2. **Employment-history field in Career DNA** — unblocks the resume "Experience" section (the one
   remaining gap noted in `docs/AI_GROUNDING_REPORT.md`) and is also the prerequisite for §5.0's full
   structured `experiences[]` extraction model.
3. **LinkedIn import mechanism decision** — a product/compliance call (which of the spec's four listed
   mechanisms is actually authorized for this deployment) needs to be made before any LinkedIn code is
   written, not inferred by an implementation session.
4. **Job comparison** (Gap #6) — the next most tractable Critical Gap: a 2–4-job comparison view can
   reuse `computeMatch`'s existing per-dimension reasons directly, similar in shape to this pass's Why-
   Filtered work.
