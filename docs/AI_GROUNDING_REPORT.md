# WonderJobs — AI Grounding Report

**Date:** 2026-09-19
**Scope:** Critical Gap #1 ("Never invent candidate facts in AI-generated content") and spec §7/§34.
**Tests:** `apps/web/src/services/ai/service.grounding.test.ts` (14 tests, all passing)

## What this covers, and what it doesn't

`TemplateAIService`'s deterministic draft is what a candidate actually receives whenever no platform
model or BYOK key is configured — it is not a mock used only in tests. It's also the starting draft a
real model is asked to "rewrite and improve… keep every fact truthful… use `[bracketed placeholders]`
for anything missing" (`composePrompt`), so a fabricated draft doesn't just ship on its own; it also
poisons the input a real model refines. Grounding the template is therefore the highest-leverage single
fix available without a live model in the loop, and it's the one path this suite can assert on
deterministically — a live LLM's output isn't reproducible test-to-test, so it isn't covered here.

## Defects found and fixed

All three were shipping to every candidate before this pass, deterministically, on every artifact,
regardless of what their Career DNA actually contained.

| # | Method | Fabrication | Fix |
|---|---|---|---|
| 1 | `generateResume` | An "Experience highlights" section invented specific, unsourced work: *"Led roadmap and discovery for a consumer product used by millions."* Career DNA has no employment-history field at all — there was never any candidate data this could have come from. | Replaced with an explicit `[Add your recent roles here — company, title, dates and 2–3 measurable outcomes…]` placeholder. |
| 2 | `generateCoverLetter` | `dna.industries[1]?.toLowerCase() ?? "consumer"` invented a second industry ("consumer products") for any candidate who had listed only one. | Placeholder / omission when a second industry isn't present; never a stand-in value. |
| 3 | `generateCoverLetter` | `dna.industries[0].toLowerCase()` — a **crash**, not just a fabrication, for a candidate with zero industries set (Career DNA doesn't require one; this is the documented "minimal profile" test persona). | Guarded with `[your industry]` placeholder; regression test asserts no throw. |
| 4 | `generateScreeningAnswers` | *"I led discovery, defined the PRD and metrics, and partnered with engineering through launch"* — a specific, entirely invented accomplishment story, presented as the candidate's own answer to "Describe a product you shipped end to end." | Uses the candidate's first stated strength if present, with `[Add the specific role and outcome before submitting.]`; otherwise a full placeholder asking them to describe it. |
| 5 | `generateScreeningAnswers` | *"Available to start within 30–60 days"* — asserted as fact regardless of the candidate's actual availability, which isn't in Career DNA. | `[Add your notice period or availability date.]` |
| 6 | `generateScreeningAnswers` | *"…which is where I've built most of my product experience"* — claimed industry alignment unconditionally, whether or not the job's industry was anywhere in the candidate's list. | Only claims alignment when `job.industry` actually matches one of `dna.industries`. |
| 7 | `generateScreeningAnswers` | `"Open to discuss."` presented as the compensation answer with no signal that it's a stand-in, when `dna.minSalary` is unset. | `[Add your compensation expectation, or leave open to discuss.]` |
| 8 | `generateFollowUpEmail` (thank-you) | `dna.strengths[0]?.toLowerCase() ?? "my recent work"` — vague but not clearly marked as a placeholder. | `[a relevant strength]` when none is set. |

## Forbidden categories checked (spec §7 / §34)

The test suite's `assertNoFabrication` helper and per-method assertions check that none of the
following appear unless the fixture actually provided them: **employers, dates, achievements, metrics,
team sizes, product usage, salary, availability, responsibilities, certifications, education,
technologies.** Career DNA structurally cannot carry employers, dates, certifications or education today
(no such fields exist), so every artifact-generation method is checked against a **minimal candidate**
fixture (no name, no industries, no strengths, no skills, no salary) to prove nothing fills that gap with
invented content.

## What's grounded and verified to work correctly

A second fixture (`richDNA` — a candidate with real strengths, skills, industries and a stated minimum
salary) checks the positive case: real facts *do* flow through unchanged (name, years, strengths, salary
figure, industry-alignment claim only when actually true). Grounding a template doesn't mean stripping it
to nothing — it means every claim traces to something the candidate entered.

## Regeneration consistency

One test asserts that generating the same artifact twice from the same Career DNA produces byte-identical
output. The template path is pure, so this is guaranteed by construction; it's asserted as a regression
guard against a future change accidentally introducing `Math.random()`/`Date.now()`-based content that
would make "regenerate" silently rewrite facts that were already correct.

## Known gap, not fixed in this pass

`generateResume`'s "Experience" section can, at best, ask the candidate to fill it in — it can never be
grounded automatically, because **Career DNA has no employment-history field** (no companies, titles,
dates, or bullet-level achievements). Closing this properly needs the `Resume Import` extraction model
extended to capture structured `experiences[]` (per the "Existing Resume Import" requirements doc,
§5.0) and a corresponding Career DNA field — that's a data-model change, not a template fix, and is
tracked as a backlog item rather than attempted here.

## System-prompt grounding (model path)

Unchanged in this pass, and already correct: every `run()` call's system prompt already instructs "only
use facts from the context; never invent employers, dates or numbers; use `[bracketed placeholders]` for
anything missing" (resume), "No clichés, no invented achievements" (cover letter), and "Mark anything the
candidate must confirm with (Edit this before submitting)" (screening answers). These instructions cannot
be tested deterministically without a live model and are out of scope for this report; grounding the
*draft* they're built from is what's newly verified here.
