# UX Simplification — Phase 4: Mobile Responsive Verification

Verified in a real mobile viewport (390×844, `isMobile: true`, `hasTouch: true`) via Playwright against `claude/wonder-jobs-update-26qrf8` (2026-09-23), covering every primary surface plus the modals/dialogs most likely to clip on a small screen.

## Primary mobile nav

Confirmed the bottom bar shows exactly the 5 real destinations from Phase 4.1 — Home, Jobs, Applications, Career, Wonder — with no "More" catch-all, and the hamburger drawer independently reaches every secondary destination (Scheduled Runs, Automation Settings, Insights, Resume Studio, Interview Prep, Learning, Help & Guide). No drift between the two.

## Horizontal overflow

Checked `document.documentElement.scrollWidth` vs `clientWidth` (any difference means the page can be scrolled sideways, always a mobile bug) on every primary screen: Home, Jobs list, Job detail, Applications, Application detail, Application Pack (prepare), Career DNA, Wonder (runs list), Run setup, Automation Settings, Scheduled runs, New scheduled run, the Ask Wonder modal, and the FollowUpAction confirmation modal. **No horizontal overflow found on any of them** — every card, chip row, and form grid already wraps or scrolls internally rather than the whole page.

## Dialogs / modals fit mobile

- **Ask Wonder** (`CommandPalette`, including Phase 3.1's new richer placeholder text) — fits cleanly, no clipped text, no overflow.
- **FollowUpAction's "Mark as sent" confirmation** (Phase 3.6's rewritten hand-off copy, plus the new Copy button) — the longer disclosure text and the draft preview both render fully inside the modal with no clipping.
- **ActionApprovalList's apply-stage confirmation** — not exercisable via demo data (no seeded run reaches the apply stage, per `docs/UX_MIGRATION_VERIFICATION.md`), but it shares the same `Modal` primitive as the two above, which is confirmed responsive.

## Application Pack on mobile

Verified the full `/app/applications/[id]/prepare` flow renders correctly at 390px: the artifact tabs (Resume/Cover Letter/Answers/Review), the fit summary, missing-candidate-information card, key requirements, and the Continue/Skip actions all stack cleanly above the bottom nav with no overlap.

## One real defect found and fixed

**`app/app/runs/new/page.tsx`'s "Continue" button used `position: sticky` inside the same scrolling column as the page's cards.** On a mobile-height viewport, once the button's natural document position came within one viewport of the page's end (a Career Goal + a now-longer Automation Level section, per Phase 3.2's relabeling, + AI Provider + collapsed Search details easily added up to this on a 844px-tall screen), the sticky button "stuck" near the bottom of the viewport *before* the AI Provider and Search Details cards had fully scrolled past — and because it carried `z-10`, it visually painted over their content. Verified with real (non-full-page) viewport screenshots at several scroll offsets: the "Bring Your Own Key" card's second line of text was cut off behind the button.

Fixed by changing the button bar from `sticky` (inside the scrolling column) to a genuinely `fixed` bottom bar (outside the document flow, like the app's existing bottom nav and toast stack), and adding `pb-44` to the scrolling column so its content always has real reserved space above the fixed bar — the same pattern already used correctly for the bottom nav elsewhere in the app. `md:static` keeps desktop, where the button was never sticky and never had this problem, pixel-identical to before (verified: screenshot matches the pre-fix desktop layout exactly).

Re-verified after the fix at multiple scroll positions and at the true bottom of the page: no card content is ever hidden behind the button, and no horizontal overflow was introduced.

## Verification

`npm run check` (lint, typecheck, 338 unit tests, production build) green. No console or page errors during any of the above Playwright passes.
