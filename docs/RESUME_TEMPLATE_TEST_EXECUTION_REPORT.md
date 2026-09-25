# Résumé templates — test execution report (spec §93 step 11)

_2026-09-25._ Implementation audit: [`RESUME_TEMPLATE_IMPLEMENTATION_AUDIT.md`](./RESUME_TEMPLATE_IMPLEMENTATION_AUDIT.md).

## Totals

| Suite | Where | Tests | Pass | Fail | Blocked |
|---|---|---:|---:|---:|---:|
| Per-template: TPL-001…030, PDF-001…018, DOCX-001…014, ATS headings, validation gate | `src/domain/resume/templates.test.ts` | 296 (37 × 8) | 296 | 0 | 0 |
| Cross-template: CROSS-001…015, tailoring only reorders | same | 5 | 5 | 0 | 0 |
| Recommendation | same | 3 | 3 | 0 | 0 |
| PDF/DOCX extraction (the ATS reader, incl. the two fixes below) | `src/server/resume/*.test.ts` | 33 | 33 | 0 | 0 |
| Playwright RESUME-TPL-001…030 + 9 visual baselines | `e2e/resume-templates.spec.ts` | 30 run (+10 project-specific skips) | 30 | 0 | 0 |
| DOCX → PDF via LibreOffice (spec §57) | — | — | — | — | **BLOCKED**: no LibreOffice in this environment |
| PDF page rasterization vs baseline (spec §52 step 4) | — | — | — | — | **Substituted**: baselines are taken of the preview, which draws the same positioned glyphs as the PDF (see below) |

The whole unit suite (`npx vitest run`) and `npm run check` pass.

The Playwright run was against a production build (`next build && next start`) in demo mode:
`PLAYWRIGHT_BASE_URL=http://localhost:3211 npx playwright test e2e/resume-templates.spec.ts --project=chromium --project="Mobile Chrome"`.

## Matrix

| Template | Unit (TPL) | Layout | PDF | DOCX | ATS | Visual | Playwright |
|---|---|---|---|---|---|---|---|
| Executive | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Modern Minimal | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Technical | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Classic ATS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Leadership | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Career Shift | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Academic / Research | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Creative Modern | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

How each column is checked:

- **Layout**: zero overflow, overlap, out-of-bounds content, orphaned headings, empty pages and missing glyphs, across all five fixtures. Pagination is deterministic (two runs are byte-identical).
- **PDF**:
  - it is a valid PDF, with an A4 MediaBox on every page;
  - page count equals the layout's page count;
  - there are no placeholders, `undefined`, `null`, `NaN` or debug text;
  - there are no duplicate sections;
  - links are real URI annotations.
- **DOCX**:
  - it is a valid package, with document XML that parses;
  - it has the Title/Heading/ListBullet/Hyperlink styles;
  - it uses A4 with the template's margins;
  - it has keep-with-next set;
  - hyperlinks are external relationships;
  - every section and employer the layout shows is present.
- **ATS**:
  - text read back from the PDF, with the same extractor used on candidates' uploads, contains the name, every employer and title, and the skills;
  - that text keeps section order;
  - there are no images;
  - every heading is a standard one.
- **Visual**: a page-1 baseline for each template (the demo candidate), plus a gallery baseline. I reviewed each one on screen before approving it.

## Page counts (fixture-specific ranges, spec §58)

| Template | ATS (17 yrs, 4 roles × 7 bullets, all sections) | Extreme (8 roles, 15-bullet role, 40 skills) | Sparse | International | Links | Demo candidate |
|---|---:|---:|---:|---:|---:|---:|
| Executive | 2 | 3 | 1 | 1 | 1 | 1 |
| Modern Minimal | 2 | 3 | 1 | 1 | 1 | 1 |
| Technical | 2 | 3 | 1 | 1 | 1 | 1 |
| Classic ATS | 2 | 3 | 1 | 1 | 1 | 1 |
| Leadership | 2 | 3 | 1 | 1 | 1 | 1 |
| Career Shift | 2 | 3 | 1 | 1 | 1 | 1 |
| Academic / Research | 2 | 3 | 1 | 1 | 1 | 1 |
| Creative Modern | 2 | 3 | 1 | 1 | 1 | 1 |

Allowed ranges in the tests: ATS 2–3, Extreme 2–4, Sparse 1, International 1–2, Links 1–2. More pages than the range fails.

## Defects found and fixed during testing

1. **PDF text extraction merged every font's ToUnicode map.** In a PDF with several embedded fonts, the same glyph code decoded to the wrong letter. It now decodes by the font active at each `Tf`. This also fixes multi-font résumé imports.
2. **The extractor read embedded `FontFile3` programs (CFF/OpenType) as page text**, injecting binary garbage. It only skipped `/Length1` fonts. It now also skips font-program subtypes and every `/FontFile*` target. Found by PDF-012.
3. **Chip-style skills were capped at 18.** That silently dropped a candidate's skills, which the spec forbids. The cap is removed.
4. **Recommendation misread a product manager as Technical** because "SQL" and "Analytics" counted as technical skill groups. The role signal (headline or title) now decides first.
5. **Gallery badges covered the top of the thumbnail.** They are moved above the page.
6. **The first visual baselines were clipped by the viewer's scroll box.** They were retaken with a viewport tall enough for the full page.

## Known limitations / warnings

- **DOCX page count** isn't measured by a word processor here. It is estimated by the same paginator, and the DOCX is checked structurally and by re-extraction (TPL-030 says so).
- **DOCX fonts.** DOCX uses Arial/Georgia (spec §41 approved list). The PDF embeds Inter, Source Serif 4 or IBM Plex Sans, subset, OFL. The two formats therefore look alike but are not pixel-identical.
- **Layout.** All eight templates are single-column this release (reading order, ATS). The metadata keeps `columns: 2` for a later version.
- **Out of scope.** No AI rewriting inside templates: the document is the candidate's own facts, and a target job only reorders them. AI-drafted application résumés (Markdown) are unchanged and listed under "Tailored drafts".
- **Signed-in accounts.** The gallery and generation run the same code for signed-in accounts. The Playwright journeys use demo mode, because a real-account run needs a disposable Supabase user (same approval as the JobsLake candidate journeys).

## Files

- Domain: `src/domain/career/history.ts`; `src/domain/resume/{document,templates,recommend,validate,fonts,layout,saved,fixtures}.ts`; `fontMetrics.generated.ts`.
- Renderers: `src/services/resume/{pdf,docx,generate,download}.ts`.
- UI:
  - `src/app/app/resume-studio/page.tsx`;
  - `src/components/resume/*`;
  - `src/components/career/CareerHistoryEditor.tsx`;
  - Career Profile and Application Pack links.
- Fonts: `public/fonts/resume/*` (OFL licences included); `scripts/resume-fonts.py`.
- Tests: `src/domain/resume/templates.test.ts`, `e2e/resume-templates.spec.ts` (+ snapshots).
- Extractor fixes: `src/server/resume/extractText.ts`.
