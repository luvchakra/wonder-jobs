# UX Simplification — Phase 4.3 + 4.4: Migration Guardrails & Capability Preservation

Verified against the actual `apps/web/src` implementation on `claude/wonder-jobs-update-26qrf8` (2026-09-23), after Phases 2–4 of the redesign. Cross-checked line-by-line against `docs/UX_CAPABILITY_MAP.md` (every capability the original baseline audit found, with its Keep/Relocate/Replace disposition).

## 4.3 Migration guardrails

**Every route from before the redesign still exists — verified against the production build's own route table**, so no deep link (a bookmark, a shared link, a push-notification href) can 404:

`/app`, `/app/jobs`, `/app/jobs/[id]`, `/app/applications`, `/app/applications/[id]`, `/app/applications/[id]/prepare`, `/app/career-dna`, `/app/insights`, `/app/resume-studio`, `/app/interview-prep`, `/app/learning`, `/app/runs`, `/app/runs/[id]`, `/app/runs/new`, `/app/automation/scheduled`, `/app/automation/scheduled/[id]`, `/app/automation/scheduled/new`, `/app/automation/settings`, `/app/calendar`, `/app/settings/ai`, `/app/profile`, `/extension`, `/help`.

Every redesign phase (2.1–2.7, 4.1) edited pages **in place** rather than moving them to new paths — confirmed by re-running `npm run build` and diffing its route table against the list above. **No redirects were needed and none were added**, because nothing moved. The one exception already fixed in Phase 3.6: `server/workflow/scheduledRun.ts` was generating notification links to a route that never existed (`/app/run/{id}`, singular) instead of the real `/app/runs/{id}` — not a migration regression, a pre-existing bug, corrected there.

The golden-journey E2E suite (`e2e/golden-journeys.spec.ts`) continues to exercise real navigation through the primary nav, not just route existence, and was kept green (with 4 tests updated, not silenced, where a phase deliberately changed a default view — see Phase 2.7 and 4.1's own notes) throughout every phase of this work.

## 4.4 Capability preservation — verified against `UX_CAPABILITY_MAP.md`

Every row in the capability map was re-checked against the current code. Summary by outcome:

### Fixed during this work (Phases 2–4)
- "Ask Wonder" CTA copy over-promising a real assistant → Phase 3.1 gave it a real (deterministic, non-chatbot) natural-language router.
- Match-score badge showing a bare "% match" → Phase 2.3, now the evidence-based fit label by default.
- Save/not-for-me friction asymmetry (save on card, reject detail-only) → Phase 2.3 added a card-level reject icon.
- Application preparation's simulated progress steps → covered by Phase 2.4's Application Pack rebuild.
- Follow-up email misleading "can't be unsent" copy → Phase 3.6, reframed as a real hand-off.
- Apply-stage approval modal misleading "submits... can't be undone" copy → Phase 3.6.
- Apply-stage "0 submitted" count bug → Phase 3.6 (`counts.handed_off` was written, `counts.submitted` was read).
- Automation levels' misleading Autonomous/Continuous copy → Phase 3.2 relabeling.
- Automation policy's `submit_application`/`send_email`/`send_recruiter_message` descriptions overstating real external effects → Phase 3.6.
- Scheduled-run notification links to a nonexistent route → Phase 3.6.
- Scheduled runs/schedule builder/templates relocated under Wonder, Insights/Resume Studio/Interview Prep/Learning relocated under Career → Phase 4.1 nav restructure.
- Toast had no `warning` tone, so a real warn-before-proceeding message displayed as neutral "info" → Phase 4.2.

### Fixed in this pass (previously undetected regressions/gaps, not covered by an earlier phase's spec)
- **Company tab company-size fallback (`app/app/jobs/[id]/page.tsx`)** — a real-data-only violation the baseline audit flagged as **High**: when a job's company isn't in the demo `COMPANIES` catalog (i.e. any company not one of the ~15 seeded demo employers), the size label silently fell through to `"Startup"` — a fabricated fact about a real company. Fixed to say `"Company size not listed"` when the company record is unknown, matching the existing (already-correct) pattern used for HQ (`company?.hq ?? job.location`).
- **"Show me anyway" not disclosing that it never un-hides a rejected job** — the button (`FilteredBreakdown.tsx`) genuinely clears every preference filter (verified: reuses the exact same patch object `JobFiltersBar`'s own "Clear filters" uses) but by design never reverses a candidate's own "not for me" — that needs its own explicit undo. It previously said neither. Added an explicit note (a caption in the empty-state variant, a tooltip in the compact variant) whenever a rejection is among the hidden reasons: "Won't bring back the N job(s) you marked not for me — undo that from the job itself."
- **Demo-seed flavor text fabricating a LinkedIn source** — `services/mock/seed.ts` had a demo application timeline event reading "Found on LinkedIn and Naukri," implying two job sources ("LinkedIn", "Naukri") that don't exist anywhere in the real source list (`domain/jobs/sources.ts`: Company career sites, Remotive, Jobicy, Remote OK, Himalayas, Arbeitnow, Adzuna India). Fixed to name two real sources ("Found on Jobicy and the company career site"), so demo data stays representative of what the product can actually do — the specific instance the baseline audit had flagged as a "one string" fix.

### Verified present and working, no change needed
- Multi-source aggregation & dedup, Wonder Fit matching + explanation, quality signals, "Why This Job," "Why Was This Filtered" (aggregate breakdown), job list/detail/filters, save actions, "not for me" learning loop.
- Applications dashboard, timeline, shared artifact editor, download-as-.docx, external-action audit ledger, extension cross-sell hint, Chrome extension (autofill).
- Career DNA editor, re-scoring on change, resume import, learned-preferences review, onboarding flow.
- Run setup, run detail, the workflow engine's state machine, pause/resume/graceful stop, rerun-from-stage, manual stage override, waiting-for-user/pending approvals, silent/no-op schedule outcomes, the server-side cron's structural inability to auto-apply.
- Notifications (in-app and push), Calendar subscribe feed — confirmed still reachable via Home's "Upcoming → View all" link (`app/app/page.tsx`) even with no primary/secondary nav slot, per the Phase 1 IA decision.
- AI provider selection & BYOK, usage transparency, profile/account settings, PWA install, Help center & assistant, contact form.
- Route protection (`proxy.ts`) and the navigation config's single source of truth (`components/navigation/nav.ts`) — read directly, both intact.
- The signed-out shared-job teaser (`server/jobs/teaser.ts`, `JobTeaser.tsx`, `AuthForm.tsx`): `proxy.ts` already redirects an unauthenticated, non-demo visit to a protected route (including `/app/jobs/[id]`) to `/sign-in?next=<path>`, and both `/sign-in` and `/sign-up` already call `publicJobTeaser(next)` to render the shared job. This wiring is present and correct by code inspection. **Not exercisable live in this sandbox**, because Supabase isn't configured here (`authConfigured()` returns false, so `proxy.ts` no-ops entirely) — this is an environment limitation, not a code defect; flagging rather than claiming a live-verified pass.

### Known, deferred — pre-existing gaps outside this session's assigned phases, not regressions
These were flagged as Medium risk in the original capability map and were never claimed as deliverables of Phases 2–5; they're documented here so "capability preservation" doesn't quietly imply they were fixed:
- Onboarding completion gate is client-only (`proxy.ts` has no onboarding check) — a not-yet-onboarded session can see a brief flash of `/app/*` before the client redirect.
- AI provider selection has three overlapping surfaces (`AIProviderCard`, `ProviderSelector`, the full `/app/settings/ai` page) rather than one consolidated destination plus one inline picker.
- `generate_screening_answers` has no entry in `domain/automation/policy.ts::CAPABILITIES` — a real policy asymmetry versus `generate_resume`/`generate_cover_letter`, which do.
- Supabase RLS posture (policies revoked from `anon`/`authenticated`, no `CREATE POLICY` rows) — already tracked in `CLAUDE.md` itself as a known gap, not a design goal.
- Calendar subscribe feed has no link-rotation affordance.

## Verification

`npm run check` (lint, typecheck, 338 unit tests, production build of all routes) green after the two capability fixes above. No E2E assertions referenced the old "Startup" fallback or the old LinkedIn/Naukri seed string, so nothing needed updating there. Manually verified in a browser: the Company tab renders correctly with real data and no console errors.
