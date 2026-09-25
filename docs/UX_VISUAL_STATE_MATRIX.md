# UX Simplification — Phase 4.2: Visual State Matrix

Audited against the actual `apps/web/src` implementation on `claude/wonder-jobs-update-26qrf8` (2026-09-23), not inferred from any spec. For each of the 13 required states: what surfaces exhibit it, the exact human-language copy/pattern used, and whether it's ever conveyed by color alone (it must not be — spec's accessibility rule, verified against `docs/UX_BASELINE_AUDIT.md`'s existing findings).

Two vocabularies carry almost all of this:
- **`domain/workflow/status.ts`'s `RunStatus`** (`STATUS_META`) — used identically for both a run and every one of its stages (spec §43: "one state machine, no drift").
- **Generic UI primitives** in `components/common/States.tsx` (`Skeleton`, `PageLoading`, `EmptyState`, `ErrorState`) and `components/feedback/Toast.tsx` — used across every page rather than each screen inventing its own loading/empty/error look.

## 1. Loading

- `components/common/States.tsx::PageLoading` / `Skeleton` — shimmer placeholders shaped like the real content, `aria-busy="true"` `aria-label="Loading"` (never a bare spinner with no text alternative).
- Used at every route's top-level `<Suspense fallback={<PageLoading />}>` boundary (`app/app/jobs/page.tsx`, `app/app/applications/page.tsx`, `app/app/automation/scheduled/new/page.tsx`, etc.).
- Button-level loading: `Button`'s `loading` prop swaps the icon for a spinner and sets `aria-busy` — used on every async action (Draft, Generate, Send, Approve...) so a click's in-flight state is never silent.

## 2. Empty

- `components/common/States.tsx::EmptyState` — icon + title + one-sentence body + a real next action (never just "No data").
- Examples verified in code: "No jobs discovered yet — Run Wonder to search your sources." (`app/app/jobs/page.tsx`), "No applications yet — Save a job and prepare an application, or let a Wonder run prepare materials for your strongest matches." (`app/app/applications/page.tsx`), "No runs yet — Your run history, with stage-by-stage records, will appear here." (`app/app/runs/page.tsx`). Each names the real cause and the real fix, per the project's "when a real value is unavailable, say so" rule.

## 3. Success

- `toast.success()` (green, `CheckCircle2`) — e.g. "Marked as sent — Recorded on the application timeline." (`FollowUpAction.tsx`).
- `STATUS_META.COMPLETED` → "Completed" (`tone: "success"`), rendered via `RunStatusPill`/`StageStatusIcon` with a filled check icon, never a green dot alone.

## 4. Warning

- `STATUS_META.COMPLETED_WITH_WARNINGS` → "Completed with warnings" (`tone: "warning"`), a distinct `AlertTriangle` icon in `StageStatusIcon` (not the same shape as failed or completed).
- Per-stage: `stage.warnings[0]` rendered directly under the stage row in `WorkflowTimeline.tsx`.
- Per-source evidence: `"Needs setup"` (tone warning) when a job source is missing credentials (`services/workflow/executors.ts`), distinct from `"Unavailable"` (tone danger) for a source that actually failed — the project's real-data-only rule requires this distinction, and the code makes it.
- **Fixed in this pass:** `Toast` only had `success`/`info`/`error` tones, so `ScheduleBuilder`'s "No search term set — click Save again to continue" (a genuine warn-before-proceeding message, not routine information) was shown with neutral "info" styling. Added a fourth `warning` tone (`AlertTriangle`, warning-600) to `components/feedback/Toast.tsx` and moved that one call site to it; the other 10 existing `toast.info(...)` call sites were individually checked and are genuinely neutral/informational (e.g. "Marked not for me", "Schedule removed", "Notifications are off") and correctly left as `info`. Unit tested (`Toast.test.ts`).

## 5. Error

- `components/common/States.tsx::ErrorState` — a bordered danger-toned card with a title, a real error body and a retry/alternate action; used on `app/app/runs/new/page.tsx`, `app/app/applications/[id]/prepare/page.tsx`, and inside `components/workflow/RunErrorBanner.tsx`.
- `STATUS_META.FAILED` → "Failed" (`tone: "danger"`), with `stage.error?.message` (the real thrown error, never a generic "Something went wrong") shown via `stageStatusLine()`.
- `toast.error()` for a failed in-place action (e.g. "Couldn't record this — You can retry from the history below." in `FollowUpAction.tsx`).

## 6. Disabled

- `Button`: `disabled:opacity-50 disabled:pointer-events-none`, `aria-disabled`, `tabIndex={-1}` when disabled — never just a lower-opacity clickable button.
- `Input`/`Select`/`Textarea`: shared `disabled:opacity-60` from the common `field` class.
- Always paired with a reason in copy, not a bare disabled control: e.g. the Application Pack's "Continue to Employer" stays disabled with an explicit missing-materials list until every artifact exists (`app/app/applications/[id]/prepare/page.tsx`).

## 7. Waiting for user

- `STATUS_META.WAITING_FOR_USER` → "Waiting for you" (`tone: "info"`), a distinct `UserRound` icon in `StageStatusIcon`.
- `stage.waitingReason` (a real, specific reason, e.g. "Review results before continuing") rendered under the stage row.
- `ActionApprovalList`'s per-action `"Needs your approval"` badge for a pending external action, with Approve/Decline controls right there — never a state the candidate has to go find.

## 8. Running

- `STATUS_META.RUNNING` → "Running" (`tone: "brand"`), a spinning `Loader2` icon (shares its spin animation with `STOPPING`, which additionally shows "Stopping" so the two are never visually identical without the label). Live progress bar (`role="progressbar"` with real `aria-valuenow`) shown only while active.

## 9. Paused

- `STATUS_META.PAUSED` → "Paused" (`tone: "warning"`), a filled `Pause` icon.

## 10. Stopped

- `STATUS_META.STOPPED` → "Stopped" (`tone: "neutral"`), reached only via `STOPPING` — the run finishes its current unit before landing here, and completed stage outputs are preserved (`WJ-013`), so "Stopped" never implies lost work.

## 11. Completed

- Covered under **Success** above — the same `STATUS_META.COMPLETED`.

## 12. Completed with warnings

- Covered under **Warning** above — the same `STATUS_META.COMPLETED_WITH_WARNINGS`.

## 13. Failed

- Covered under **Error** above — the same `STATUS_META.FAILED`.

## Findings

- **One real gap found and fixed:** the missing `warning` toast tone (see §4). Low risk, additive (a new tone alongside the existing three, one call site moved to it), unit tested, `npm run check` green.
- **No raw enum leaks found.** Every place a `RunStatus`/`StageStatus` reaches JSX goes through `RunStatusPill` or `StageStatusIcon`, both of which read `STATUS_META` for the label — grepped every `{...status}` interpolation in `.tsx` files to confirm none prints an unconverted enum value.
- **No color-only signaling found.** Every status representation pairs a distinct icon shape (not just a color) with a text label — verified by reading `StageStatusIcon`'s full switch statement.
- **Per-source evidence already distinguishes "Needs setup" from "Unavailable"** exactly as `CLAUDE.md`'s real-data-only rule requires; this predates this audit and needed no change.
