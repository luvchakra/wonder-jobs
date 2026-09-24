# Outcome-Based UX — Phase 2 Capability Map

Every capability listed in the spec's §32 (plus the engine operations it names elsewhere), with its new home in the Find → Decide → Apply → Progress model. **Keep** = unchanged; **Move** = same implementation, new entry point/label; **Hide** = moved behind progressive disclosure ("See how Wonder worked" / Advanced), never deleted. No capability is orphaned: each row names a reachable location.

| Capability | Current location | New outcome | New location | Keep/Move/Hide | Implementation notes |
|---|---|---|---|---|---|
| Career DNA / Career Profile | `/app/career-dna` | Career (Find context) | Same route, "Career" nav | Keep | Already unified as Career Profile (UX Phase 2.6). |
| Resume import | Career Profile "Resume" card, onboarding | Career | Same | Keep + fix | Must surface conflicts with existing values instead of pre-ticking overwrites (spec §28). |
| LinkedIn capability | *Does not exist* (no public API) | Career | Honest "not connected" disclosure in Career Profile + Ask Wonder | Keep (non-existence) | Never fabricate a LinkedIn import or source. |
| Source aggregation | Engine `search` stage | Find | Find progress ("Searching the market", real per-source counts) | Hide (detail) | Per-source evidence stays in "See how Wonder worked". |
| Deduplication | Engine `dedupe` | Find | Find progress ("Removing duplicates") | Hide (detail) | Real count shown only when the stage has produced one. |
| Wonder Fit | `services/jobs/matching.ts` | Decide | Job card "Why Wonder surfaced this", detail "Why it fits" | Keep | Reasons already evidence-based; card now shows the top ones. |
| Quality signals | `computeQuality` | Decide | Job card "Things to consider", detail "Sources & signals" | Keep | Caution signals become concerns on the card. |
| Why This Job? | Job detail "Why it's a match" tab | Decide | Same + job card | Keep | |
| Why filtered? | `FilteredBreakdown`, Ask Wonder | Decide | Jobs list + Ask Wonder, now with "Show it anyway" / "Change preference" per job | Keep + extend | Per-job result from `explainJobVisibility`. |
| Save | Card + detail | Decide | Same | Keep | |
| Not for me | Card + detail | Decide | Same | Keep | Learning claims stay limited to what `learning.ts` persists. |
| Comparison | *Does not exist* | Decide | New `/app/jobs/compare?ids=…`, selected from the Jobs list | New | Dimension rows from real `JobMatch.reasons` + quality; relative statements, no "winner". |
| Application preparation | `/app/applications/[id]/prepare` | Apply | Application Pack (same route) | Keep | |
| Resume / cover letter / screening answers | `ArtifactEditor` in the Pack | Apply | Same | Keep | Provenance badges preserved. |
| Application Pack | Same route | Apply | Same + "Application ready" summary at top | Keep + extend | Summary lists only artifacts that actually exist. |
| Employer hand-off | Pack "Continue to Employer", apply-stage approval | Apply | Same | Keep | "The final action is yours." No server-side apply executor. |
| Application tracking | `/app/applications`, detail timeline | Progress | Same + Home "Your progress" | Keep + extend | Counts from the same `computeApplicationAttention`. |
| Scheduling | `/app/automation/scheduled/*`, `ScheduleBuilder` | Find (automation) | "How often should Wonder look?" simple chooser → existing builder as "Advanced search automation" | Move | Scheduler, conditions, actions untouched. |
| Pause / resume / stop | `WorkflowControls`, mobile status bar | Find | Same controls, outcome copy ("Wonder is paused" / "Continue"; "Search stopped. Everything already found is still available.") | Keep + relabel | Engine calls unchanged. |
| Rerun | "Rerun from stage" modal | Find | "Search again" (fresh) / "Recheck these opportunities" (`rerunFrom('match')`); stage picker stays in Advanced | Move | Existing `rerunFrom()` + shared idempotency ledger. |
| Restart current stage | `WorkflowControls` | Find | Advanced only | Hide | |
| Manual stage override | `OverrideEditor` in `StageDetail` | Find | "See how Wonder worked" | Hide | |
| Manual intervention (WAITING_FOR_USER) | Run page + mobile bar | Find/Apply | "Wonder needs your input" card with the real waiting reason + Continue | Keep + relabel | State machine unchanged. |
| Automation levels | `AutomationLevelSelector` | Find | "How much should Wonder handle?" — Help me / Work with me / Work independently / Keep watch | Move (labels) | Level ids and `resolveCapability` unchanged. |
| Automation policy | `/app/automation/settings` | All | "What Wonder can do" (nav label; same route) | Move (label) | |
| Auditability | Run log, action history, `/api/audit` | All | "See how Wonder worked" (log + actions) | Hide | |
| Stage provenance | `StageDetail` inputs/overrides | All | "See how Wonder worked" | Hide | Artifact provenance stays visible in the Pack. |
| AI provider abstraction / platform AI / BYOK | `/app/settings/ai`, run setup provider card | All | AI settings; run-level provider moves under "More options" on Find and is always named on the run's Advanced panel | Move | No silent provider/billing switch: fallback still toasts and is recorded. |
| Usage transparency | `/app/settings/ai` | All | Same | Keep | |
| Privacy / security / authorization | `server/*`, `proxy.ts` | — | Unchanged | Keep | No auth, tenant-filter, secret, migration or route-guard code touched. Server-side changes on this branch are user-visible copy only ("scheduled run" → "scheduled search", "Career DNA" → "Career Profile", the rank stage's evidence label "Strong on the shortlist"), a notification/activity link fixed from the non-existent `/app/run/:id` to `/app/runs/:id`, and the extension's missing-fields list now reusing `MISSING_CANDIDATE_FIELDS` so it can't drift from the Application Pack. |
| Notifications | Top bar bell, push | Progress | Same | Keep | |
| Calendar | `/app/calendar` | Progress | Home "Upcoming → View all", command palette | Keep | |
| PWA | Avatar menu | — | Same | Keep | |
| Browser extension | `/extension`, application detail hint | Apply | Same | Keep | |
| Analytics | `lib/analytics.ts` | All | Adds outcome-level events (`find_started`, `why_viewed`, `comparison_started`, …) | Keep + extend | Event props carry ids/counts only — never resume text, answers, keys, or free text. |
| Accessibility | Throughout | All | Same | Keep | Live-region progress announcements preserved in the new Find progress view. |
| Workflow history | `/app/runs` | Find | "Search history" (same route) | Move (label) | |
| Workflow templates | Schedule builder | Find (advanced) | "Advanced search automation" | Hide | |
| Silent/no-op outcomes | Engine `conditionMet` | Find | Quiet outcome line on the result summary | Keep | |
| Learning hooks | `learning.ts`, Career Profile "Needs confirmation" | Invisible loop | Surfaces only as a real suggestion with Yes/No | Keep | No "Learning from this run" claim in primary UX. |
