# Outcome-Based UX — Phase 3 Experience Architecture

The candidate experiences **Find → Decide → Apply → Progress**. The engine keeps running its 12 stages unchanged. An **Experience Orchestrator** sits between them: it reads real engine state and translates it into outcomes, next actions and (when needed) a request for input. It never holds workflow state of its own.

```text
Screens (Home · Jobs · Applications · Career · Wonder)
        │  render ExperienceResult / FindProgress / FindResult
        ▼
domain/experience/   ← Experience Orchestrator (pure, unit-tested)
  outcomes.ts         stage → outcome metadata (config, not logic)
  find.ts             Find progress + result summary from a real WorkflowRun
  searchIntent.ts     natural-language request → search config, with per-field provenance
  orchestrator.ts     describeRun(): { outcome, summary, nextActions, needsUser, transparency }
        │  delegates, never duplicates
        ▼
domain/workflow/* + services/workflow/*   ← existing engine (unchanged)
domain/wonder/*                            ← Ask Wonder intent router (extended)
```

## Outcomes and where they live

| Outcome | Candidate question | Primary surface | Engine stages behind it |
|---|---|---|---|
| **Find** | "What's out there for me?" | `/app/runs/new` ("Find opportunities"), `/app/runs/[id]` (progress → result) | profile, search, dedupe, understand |
| **Decide** | "Where should I spend my time?" | `/app/jobs`, `/app/jobs/[id]`, `/app/jobs/compare` | understand, match, quality, rank |
| **Apply** | "Is my application ready?" | `/app/applications/[id]/prepare` (Application Pack) | prepare, review, apply |
| **Progress** | "What's moving forward?" | Home "Your progress", `/app/applications`, application detail | track |
| *(invisible)* | — | Career Profile "Needs confirmation" only when a real pattern exists | learn |

The stage→outcome mapping (spec §31) is a single `Record<StageKey, Outcome>` in `domain/experience/outcomes.ts` — metadata, not branching logic spread across screens.

## Navigation (unchanged routes, outcome-oriented labels)

- **Home** — What needs my attention?
- **Jobs** — Find opportunities / decide.
- **Applications** — Move applications forward.
- **Career** — Improve my career position.
- **Wonder** — Tell Wonder what you want. Secondary items: *Search history* (`/app/runs`), *Scheduled searches* (`/app/automation/scheduled`), *What Wonder can do* (`/app/automation/settings`). No nav item is named Runs, Workflows, Stages, Automation, Learning, Quality or Matching.

## Find

1. **Entry** — "What are you looking for?" A single natural-language box, prefilled from the Career Profile goal when there is one, with example chips. `deriveSearchIntent()` extracts only what's actually in the text (role phrase → query, "in X, Y or Z" → locations, "remote" → work mode) and shows each derived value with its origin before anything runs. If no role can be derived, the page asks — it never substitutes a placeholder. "How much should Wonder handle?" (4 plain-language choices) sits below; sources, match threshold and AI provider are under "More options".
2. **Execution** — "Wonder is finding opportunities": five plain-language steps mapped from real stage status (searching the market, checking relevance, removing duplicates, comparing with your profile, prioritizing), a real "N opportunities found so far" from the search stage's own count, and Pause / Stop. No step is shown as done unless its stage is.
3. **Result** — "Your search is ready": real totals by fit (strong / worth considering / other) and "new since your last search" only when there is a previous completed search to compare to. Primary "See what deserves your attention", secondary "Explore all results".
4. **Intervention** — "Wonder needs your input" with the stage's real waiting reason and Continue.
5. **Pause / stop / rerun** — "Wonder is paused. [Continue]"; "Search stopped. Everything already found is still available. [Search again]"; "Recheck these opportunities" = `rerunFrom('match')`, reusing search results.

## Decide

Job cards: fit label (never a bare score), **Why Wonder surfaced this** (top evidence-backed reasons), **Things to consider** (weak reasons + caution quality signals), **Wonder's next suggestion** (Prepare / Review / Look closer, derived from fit + application state). Comparison of 2–4 selected jobs across real dimensions, with relative sentences and no overall winner. Per-job "why filtered" names the actual reason with **Show it anyway** / **Change preference**.

## Apply

The Application Pack stays the one preparation concept, with an "Application ready" summary at the top: what Wonder actually prepared (only artifacts that exist), what's still missing, and anything to check first — then "The final action is yours."

## Progress

Home "Your progress": applications active, interviews this week, follow-ups due, employer replies — all counted from real application state, each linked to its next action.

## Progressive disclosure — "See how Wonder worked"

On the run page, a single disclosure reveals the existing `WorkflowTimeline` + `StageDetail` (evidence, overrides, provenance, warnings), external actions (`ActionApprovalList`), the run log, the AI provider/model/billing, automation level, and stage-level controls (restart stage, rerun from a chosen stage). Nothing here is deleted — it's moved one click down.

## Wonder (intent → action → result)

Extends the existing deterministic router (`domain/wonder/*`) — still no model call, no free-text reply. New intents: "What should I focus on today?" (Home attention), "Search again with Director roles" (opens Find prefilled), "Show my application progress", "Show only roles where I match the seniority" (filters to jobs whose seniority reason is a same-level match), "Prepare the strongest two" (opens the top two not-yet-prepared strong matches' packs — never auto-submits).

## Invariants

- The engine, its state machine, idempotency ledger and `resolveCapability` gate are not modified.
- Every number on an outcome screen comes from engine/store state; every derived search field shows its origin.
- No external side effect gains a new code path; the apply stage still only hands off.
- Existing routes keep working; no redirects are needed because no route moves.
