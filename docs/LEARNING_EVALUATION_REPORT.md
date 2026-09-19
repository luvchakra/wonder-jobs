# WonderJobs — Learning Evaluation Report

**Date:** 2026-09-19
**Scope:** Critical Gap #4 ("Make 'Not for me' actually influence future ranking/search, or remove any
claim that it does") and spec §17/§18/§35.
**Tests:**
`apps/web/src/domain/career/learning.test.ts` (17 tests),
`apps/web/src/services/jobs/matching.learning.test.ts` (4 tests) — 21 total, all passing.

## The defect

The "Not for me" button's toast said, verbatim: **"Wonder will show fewer roles like this."** The
`rejected` map it wrote to was read in exactly one place in the whole codebase: the jobs-list filter that
hides a rejected job from view. It was never read by `computeMatch`, never read by ranking, never fed
into anything resembling a preference. The product was making a specific, false claim about its own
behavior to every candidate who used the feature.

## What was implemented

A minimal, evidence-gated learning loop (`src/domain/career/learning.ts`), wired into `computeMatch`:

1. **Reason capture, optional.** `NotForMeButton` now asks why (`too_junior`, `too_senior`,
   `wrong_industry`, `wrong_location`, `wrong_work_mode`, `compensation`, `skills_mismatch`,
   `not_interested`, `other` — the exact list spec §18 gives), with a prominent **Skip**. Every
   rejection is recorded either way; only a reason lets it target a specific pattern.
2. **Over-learning guard (§35).** `computeLearnedSignals` requires **3 or more** rejections citing the
   *same* reason and the *same* value (same industry, same work mode) before a signal exists at all. One
   rejection — even with a reason — changes nothing. This is tested directly: `rejections(1, …)` and
   `rejections(2, …)` both produce `[]`.
3. **Bounded ranking effect, not an exclusion.** Once a signal exists, `learnedRankingEffect` applies a
   small, fixed score penalty (8–10 points) to matching jobs in `computeMatch` — never enough to drop a
   score below the existing floor (20), and never an outright removal from results. A job affected by a
   learned signal gets a visible highlight chip: *"Similar to roles you've marked not for me."*
4. **Four signal kinds implemented**, each backed by a scoring dimension that already exists in
   `computeMatch`: `avoid_industry`, `avoid_work_mode`, `prefer_lower_seniority` (from repeated
   "too senior"), `prefer_higher_seniority` (from repeated "too junior"). `wrong_location`,
   `compensation`, `skills_mismatch`, `not_interested` and `other` are recorded (visible in rejection
   history, available for future evidence) but don't yet drive an automated rule — see **Known gaps**.
5. **Review surface (§18: "provide a way to review learned preferences").** `LearnedPreferences` on the
   Career DNA page lists every active signal in plain language with its evidence ("Marked 4 Gaming roles
   'not for me — wrong industry'"), and lets the candidate **Turn off** any one of them. A dismissed
   signal's id is remembered (`dismissedSignals`) so it never resurfaces even if more matching rejections
   arrive later.
6. **Undo (§18: "Always provide Undo").** Already existed for the reject action itself
   (`unreject`/`clearRejection`); now also correctly recomputes signals, so undoing enough rejections can
   drop a pattern back below the evidence threshold. Tested directly.
7. **Confirmed vs. suggested.** A signal starts `"suggested"` (already active — see below) and can be
   marked `"confirmed"` by the candidate, which is a visible acknowledgment, not a behavior change: both
   statuses affect ranking identically. This matches the spec's distinction between a *ranking*
   adaptation (safe to apply automatically once evidence is sufficient) and a *Career DNA* change (never
   automatic, always confirmed) — nothing here writes to `dna`.

## Fixture results (spec §35)

| Fixture | Expected | Actual |
|---|---|---|
| 1 rejected Manager role, reason given | No major change | `computeLearnedSignals` → `[]` — confirmed |
| 2 same-pattern rejections | Still no signal | `[]` — confirmed |
| 3 same-pattern rejections | Signal appears, `confidence: "low"` | Confirmed |
| 5 same-pattern rejections | `confidence: "medium"` | Confirmed |
| 8 same-pattern rejections | `confidence: "high"` | Confirmed |
| Rejection with no reason, any count | Never contributes | Confirmed (10 reason-less rejections → `[]`) |
| Two different industries rejected 3× each | Two independent signals, not merged | Confirmed |
| Dismissed signal, more evidence arrives | Never resurfaces | Confirmed |
| Undo drops evidence below threshold | Signal disappears | Confirmed |

The spec's own worked example — "5 Director saves, 5 Manager rejections, 3 Director applications →
suggest increasing Director preference" — describes a **positive**-evidence learning path (saves and
applications, not rejections) that this pass does not implement; see below.

## Known gaps, not fabricated as done

- **Positive learning (saves/applications → suggest a preference increase)** is not implemented. Only
  the negative "not for me" path from Critical Gap #4 was in scope for this pass. The full interaction
  taxonomy in spec §17 (viewed, saved, rejected, reopened, compared, prepared, applied, interview,
  employer rejection, withdrawn, offer, accepted, manual overrides) needs its own signal model; the
  `RejectionRecord`/`LearnedSignal` shapes here are deliberately narrow rather than a premature
  general-purpose "interaction event" system.
- **`wrong_location`, `compensation`, `skills_mismatch`, `not_interested`, `other`** are captured but
  don't drive a ranking rule yet. `wrong_location` in particular already has an explicit, candidate-edited
  preference field (`preferredLocations`) in Career DNA; an implicit duplicate rule on top risks
  conflicting with it rather than helping, so it was left out rather than added speculatively.
- **No promotion path from a learned signal into an explicit Career DNA preference** (e.g., "exclude
  Gaming entirely"). The candidate can only turn a signal off, not convert it into a stronger, permanent
  exclusion. That's the natural next step but wasn't built here.
