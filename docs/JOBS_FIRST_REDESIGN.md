# Jobs-first redesign

_Approved 2026-10-03 ("now work on this plan and implement this; anything that may impact relevant jobs or perfect match making needs to be brought forward and fixed")._

## Principle

**Signed in = looking at relevant jobs.** `/app` *is* the job list. When jobs can't be shown, the same
screen shows exactly one thing — the step that unblocks them — done in place. Nothing else competes
for attention until jobs are on screen. Applications, cover letters and answers are prepared later,
from a job, by the candidate.

## The readiness ladder (`domain/jobs/readiness.ts`)

Computed from the candidate's own data every time the jobs screen opens. At most one blocker, first
match wins:

| Blocker | Shown | Fix, in place |
|---|---|---|
| `profile` — no headline, goal, skills or work history | "Add your CV" (or "Fill your profile from your CV" when one is uploaded) | Upload → Fill Career Profile review; or type the role you want |
| `role` — no role can be read, or only a level ("Senior Director") | "What role are you looking for?" | One field, prefilled with their own latest job title |
| `sources` — no source can be searched | Which are off / not available | Turn them on |

Relevance notes (not blockers; one shown at a time, each with one fix):

| Note | Why it matters | Fix |
|---|---|---|
| `stale_schedule` | A scheduled search looks outside the candidate's field (the reported "product manager" search on an IAM director's account) | Search for the profile's own terms instead |
| `generic_skills` | Every skill is one most roles share, so matching can't place the field | Read specific skills from the CV |
| `role_without_field` | A role that's only a level matches every field | Add the field |
| `no_location` | Nearby jobs can't rank first | Their own location, Remote, or elsewhere |

Every suggestion is the candidate's own value; nothing is a canned default (CLAUDE.md: real data only).

## Searching without a button (`autoSearchDecision`, `lib/useJobSearch.ts`)

Signed-in accounts only (the demo keeps its sample catalog). Search on open when there has never been
a search, the profile's search changed, the catalog is empty, or the last search is over 12 hours old.
Never while blocked or already searching; a search that failed in the last 10 minutes shows its reason
instead of retrying. A search that found nothing is repeated once wider — location dropped, then level
words — and the screen says what was let go.

Searches are **search-only** (`SEARCH_ONLY_STAGES`: profile → search → dedupe → match → quality → rank).
Before this, every Find run also prepared applications for the top three and paused for review.

## Delivery

| PR | Scope | Status |
|---|---|---|
| 1 (WJ-180) | Readiness ladder + notes; `/app` is the job list; auto-search + widening; search-only runs; sources searched in parallel; no artificial delays; Home and Jobs merged in the nav; `/app/jobs` redirects | ✅ |
| 2 (WJ-181) | Jobs page: one search box (typing narrows the jobs found; "Search every source for …" searches for the words, place read from them; mic), one chip row (For you · Strong · All · Saved), "Search as" role chips, cards with Save / Not for me / Prepare (Compare is a mode in Refine), one Refine sheet (sort, work mode, posted, salary, sources, compare); the "hidden" breakdown moved below the list; Find folded in — `/app/runs/new`, `?q=` and `?role=` links land on the jobs screen and search | ✅ |
| 3 (WJ-182) | Navigation: Jobs · Applications (Calendar, Insights, Interview Prep, Learning) · Profile (Career Profile, Résumés) · Settings (Job sources — new, Scheduled searches, What Wonder can do, AI provider, Search history, Account); each place's pages are tabs at its top (`SectionTabs`) and a group in the mobile menu; the sidebar shows only the four places; every URL unchanged | ✅ |
| 4 (WJ-183) | CV-first onboarding (upload → confirm three lines → jobs) replacing the tick-every-line first import | ✅ |

## Decisions

- **Compare** is a mode under Refine (PR 2); the cards carry three actions until it's on.
- **A search the candidate asked for wins**: it stops a running search-only run (what that run found is kept) and starts; a run doing more than searching is left alone and the candidate is told.
- **Source on/off** for searching is Settings → Job sources (PR 3); Refine → Sources only narrows the list.
- **Ask Wonder** (top bar) stays as is.
- The old Home's content: "needs you" items become one line above the jobs (counted by kind); "Wonder keeps looking" shows when a schedule is on; upcoming/insights/AI-provider cards move with PR 3.

## Not changed

Matching, quality and ranking stay deterministic (no model decides relevance). `resolveCapability`
still gates every AI-touching and external-effect capability; the apply stage still can't submit.
