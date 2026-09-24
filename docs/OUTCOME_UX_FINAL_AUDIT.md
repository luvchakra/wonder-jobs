# Outcome-Based UX — Final Audit

Branch `claude/wonder-jobs-update-26qrf8`, 2026-09-24. Closes the outcome-based UX program (Find → Decide → Apply → Progress) against the spec's §51 council questions and §52 Definition of Done. Companion docs: `OUTCOME_UX_BASELINE.md` (where it started), `OUTCOME_UX_CAPABILITY_MAP.md` (where every capability went), `OUTCOME_UX_ARCHITECTURE.md` (how it's built), `TEST_EXECUTION_REPORT.md` (what was run).

Every answer below is checked against code and executed tests, not intent. Where something is partial or wasn't built, it says so.

## Gates executed

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` (in `npm run check`) | PASS |
| Typecheck | `npm run typecheck` (in `npm run check`) | PASS |
| Unit tests | `npm run test` (in `npm run check`) | PASS — 408 tests, 43 files |
| Production build | `npm run build` (in `npm run check`) | PASS |
| E2E — golden + outcome journeys | `npx playwright test e2e/golden-journeys.spec.ts e2e/outcome-journeys.spec.ts --project=chromium --project="Mobile Chrome"` against the production build | PASS — 96/96 (48 tests × 2 projects: 18 golden + 30 outcome journeys), ~2.1 min |
| Accessibility | `npm run a11y` (axe-core) against the production build — 25 pages + 5 interaction states, now including every outcome screen | PASS — no serious/critical violations (remaining notes are moderate: the demo banner outside a landmark) |
| E2E — firefox / webkit / Mobile Safari | — | BLOCKED: this sandbox vendors Chromium only (see `TEST_EXECUTION_REPORT.md`) |
| E2E — real-account auth/onboarding (`auth.spec.ts` account block) | — | BLOCKED: no Supabase credentials in this environment. Onboarding's resume-import change is covered by unit tests (`domain/career/resumeImport.test.ts`) and a browser check on both Career Profile and demo; it still needs the real-account run before release. |

## §51 council questions

### Simplicity — can a new candidate understand what to do without understanding workflows?
Yes. Home leads with **Find opportunities**; the Find page is one question, "What are you looking for?", prefilled from the candidate's own career goal and never from a placeholder. Before anything runs, it shows what Wonder read from those words (roles, places, industry preference) and where each value came from. Sources, match threshold and AI provider sit under "More options". While a search runs, the candidate sees six plain steps ("Searching the market", "Removing duplicates", …), not twelve stage names. No primary navigation item is named Runs, Workflows, Stages or Automation.

### Outcome orientation — does every major screen communicate an outcome?
- **Home:** what deserves attention today, "Your progress" (real counts), and "Wonder is working · Next search …" only when a real schedule exists.
- **Find:** "Your search is ready" with strong / worth considering / other counts and "new since last search".
- **Decide:** each job card says why Wonder surfaced it, what to consider and Wonder's next suggestion. There is a compare view and a per-job "why filtered".
- **Apply:** the Application Pack opens with "Application ready" (or "N of 3 materials ready").
- **Progress:** the Applications timeline plus Home's progress card.
- **Search history:** rows lead with the outcome, not the stage.

### Intelligence — does Wonder decide on the candidate's behalf without taking control?
Wonder does the ranking, the "what deserves your attention" ordering, the next-step suggestion, the choice of the top three to prepare, and interpreting natural language into a search. The candidate keeps everything with an effect:
- A search starts only on their click.
- A differing résumé value never overwrites the Career Profile unticked.
- A career goal is saved from a search only via an explicit, visible opt-in.
- The employer hand-off is theirs, and "submitted" is only ever their own click.

`resolveCapability` remains the single gate. No new code path performs a gated action.

### Transparency — can the candidate understand why Wonder did something?
Yes, at two depths.
- **Primary view:**
  - Every "why" line on a card is a direct reading of a computed match reason or quality signal (`domain/jobs/decision.ts`).
  - The Find preview labels every derived value's origin.
  - Filtered jobs name the actual reason.
  - Pack items say who wrote the current version.
- **"See how Wonder worked"** (one click): sources, every step's evidence, inputs you changed, provider and billing, decisions and the full log. The ADVANCED-002 journey asserts both depths agree: the breakdown equals the engine's unique count, and its strong/worth numbers equal the matching step's own evidence.

### Capability preservation — did every important capability survive?
Yes. Every row of `OUTCOME_UX_CAPABILITY_MAP.md` has a reachable home:
- Nothing was deleted.
- The stage timeline, overrides, restart/rerun-from-stage and the schedule builder moved behind "See how Wonder worked" / "Advanced search automation".
- All routes are unchanged, so no redirects are needed.

The twelve-stage engine, its state machine, idempotency ledger and executors are functionally unchanged. The only engine-adjacent edits are two evidence labels.

### Trust — are all AI claims grounded?
Yes, and this program removed two ungrounded displays:
- The Application Pack's five staged "Analyzing… Optimizing…" steps, which wrapped a single provider request, are replaced by one honest "Drafting your … with {provider}…" status.
- A discovery result headline could say "50 strong opportunities" above a breakdown saying "484". Both now use the same count, and the shortlist number is labelled for what it is.

Other trust points:
- AI drafts stay labelled "AI-generated draft".
- The demo's "ready for review" application now actually contains materials, so demo Home and the pack agree.
- Hand-off copy says what the code does: Wonder opens the employer's page and never submits.
- Analytics events carry ids, counts and enums only.

### Automation — can Wonder work continuously without exposing workflow complexity?
Yes. "How often should Wonder look?" offers four choices (Every day / Every week / Keep watch / I'll search manually), a plain-language request and an "only tell me when it's worth my attention" option, and nothing else. Keep watch creates a real schedule whose condition is "strong matches > 0". When that condition isn't met, the run is a legitimate quiet outcome that says why (AUTOMATION-003). Automation levels read "How much should Wonder handle?": Help me / Work with me / Work independently / Keep watch. The full builder remains under "Advanced search automation".

### Mobile — is the experience genuinely usable at 390px?
Yes. MOBILE-001 drives Find → result → opportunity → pack at 390×844 and asserts no horizontal scroll at every step. MOBILE-002 answers "Wonder needs your input" from the fixed mobile bar. MOBILE-003 walks the Application Pack. The whole outcome suite also runs under the "Mobile Chrome" project.

### Accessibility — does the experience remain accessible?
Yes. axe-core audits every outcome screen and the Ask Wonder dialog with an answer showing, with no serious or critical violations. Adding those screens surfaced two pre-existing serious issues, both fixed:
- **Ask Wonder listbox:** it held buttons inside list items, which is invalid ARIA and nests interactive controls, and the selected row's hint had low contrast. It is now a proper grouped listbox driven by the combobox.
- **Job detail:** skill badges sat directly inside `<ul>`.

The remaining moderate notes are the demo banner sitting outside a landmark (pre-existing, demo only). Find progress keeps its live-region announcements. The palette closing on Enter no longer re-opens itself, which was a pre-existing focus/keypress bug.

### Regression — do existing deep links and important functionality remain intact?
Yes.
- **Routes:** no route moved, and `/app/career-dna` keeps its path while its title reads "Career Profile".
- **New deep links:** `/app/jobs/:id?tab=why`, `/app/runs/new?q=…`, `/app/automation/scheduled/new?often=…&q=…` and `/app/jobs/compare?ids=…`.
- **Tests:** all 18 pre-existing golden journeys pass. Three were updated because the UI they encoded changed deliberately:
  - GJ-012/GJ-002 count top-level result cards, because cards now contain their own "why" lists.
  - GJ-013 matches the exact provenance badge.
  - GJ-014 clicks the listbox option directly.
- **Fixed on the way:** scheduled-run notifications linked to the non-existent `/app/run/:id`.

## §52 Definition of Done

| Item | Status | Evidence |
|---|---|---|
| Home is outcome-oriented | ✅ | Attention sections, "Your progress", "Wonder is working" (PROGRESS-002, AUTOMATION-001) |
| Find is outcome-oriented | ✅ | Find entry → progress → "Your search is ready" (FIND-001..005) |
| Decide is outcome-oriented | ✅ | Card why/consider/next, compare, why-filtered (DECIDE-001..006) |
| Apply is outcome-oriented | ✅ | "Application ready" summary (APPLY-001..004) |
| Progress is outcome-oriented | ✅ | Home progress + Applications timeline (PROGRESS-001..002) |
| 12 internal workflow stages remain functional | ✅ | Engine unchanged; full demo searches pass through all stages in FIND-001/003/005 |
| Internal stages are not the primary journey | ✅ | Stage names only under "See how Wonder worked" |
| Experience Orchestrator exists | ✅ | `domain/experience/{outcomes,find,orchestrator}.ts`, unit-tested; holds no workflow state |
| Natural-language intent works | ✅ | Find entry (`deriveSearchIntent`) + Ask Wonder (WONDER-001..005). One spec example — "Show only roles where I match the seniority" — was not built (no seniority filter exists to route to); see below |
| No technical setup wizard for common cases | ✅ | One text box; everything else under "More options" |
| Intervention is understandable | ✅ | "Wonder needs your input" + the stage's real reason (FIND-005, MOBILE-002) |
| Rerun is understandable | ✅ | "Search again" / "Recheck these opportunities" |
| Pause/stop/resume are understandable | ✅ | "Wonder is paused" / "Search stopped. Everything already found is still available." (GJ-016, FIND-004) |
| Advanced Mode exposes technical transparency | ✅ | "See how Wonder worked" (ADVANCED-001..002) |
| Automation terminology simplified | ✅ | Help me / Work with me / Work independently / Keep watch |
| Scheduling terminology simplified | ✅ | "How often should Wonder look?" |
| Application Pack is the primary preparation concept | ✅ | Every Prepare action lands in the Pack |
| Why explanations are evidence-backed | ✅ | `describeDecision` reads only computed reasons/signals (unit-tested) |
| Why filtered exists | ✅ | Per-job notice with Show it anyway / Change preference; Ask Wonder (DECIDE-003, WONDER-004) |
| Comparison exists | ✅ | `/app/jobs/compare` — observations only when a real difference exists, no winner (DECIDE-004) |
| Career Profile unifies career information | ✅ | One page; all visible copy now says "Career Profile"; résumé import surfaces conflicts. LinkedIn import does not exist (no public API) and is disclosed, not faked |
| No fabricated candidate facts | ✅ | No new generated content for real accounts; demo sample materials are demo-seed only |
| No false external-action claims | ✅ | Hand-off copy matches code; "Mark as submitted" remains the candidate's click (APPLY-004) |
| No silent provider/billing changes | ✅ | Provider named in the drafting status and on the run; fallback still toasts and is recorded |
| Existing security remains intact | ✅ | No auth, secret, migration or route-guard code changed |
| Existing authorization remains intact | ✅ | `resolveCapability` unchanged and still the only gate |
| Accessibility passes | ✅ | axe: no serious+ violations |
| Mobile passes | ✅ | MOBILE-001..003 + Mobile Chrome project |
| Build passes | ✅ | `npm run check` |
| Typecheck passes | ✅ | `npm run check` |
| Tests pass | ✅ | 408 unit tests |
| Playwright golden journeys pass | ✅ | 96/96 (chromium + Mobile Chrome). Firefox/WebKit BLOCKED |
| Final audit document exists | ✅ | This file |

## Not done / follow-ups

- **"Show only roles where I match the seniority"** (spec §40's example list) was not built. The Jobs page has no seniority filter, and a filter reachable only from Ask Wonder would be a hidden capability. The eight minimum intents are all covered.
- **Real-account E2E** (`auth.spec.ts` account block) and **Firefox/WebKit** are BLOCKED in this sandbox and need a run with Supabase credentials and those browsers before release.
- **Scheduled-search rows** on `/app/automation/scheduled` still list internal stage names and the workflow id ("simple_search"). That's acceptable on a management page, but candidate-facing wording there is a good next polish.
- **Résumé skill parsing** can match a shorter known skill inside a longer one already in the profile (for example "Testing" from "A/B Testing"). The conflict view shows these as additions the candidate can untick. The parser itself is unchanged by this program.
