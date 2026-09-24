# Résumé templates — implementation audit (spec §93 step 2)

_2026-09-25. What exists, what's reusable, what's missing, and the plan._

## Current implementation

| Area | Where | State |
|---|---|---|
| Career Profile | `domain/career/types.ts` (`CareerDNA`), `store/career.ts`, `/app/career-dna` | Name, headline, goal, years, level, skills with self-rated level, industries, locations, work modes, salary, strengths, growth areas. **No employment history, education, certifications, projects, publications or contact details.** |
| Résumé import | `server/resume/{extractText,parseResume}.ts`, `components/career/ResumeImport.tsx` | Extracts text from PDF/DOCX/pasted text and suggests the fields above, each with the words it came from; the candidate ticks what to keep. Does not extract roles or education. |
| AI résumé draft | `services/ai/service.ts` (`resume_generation`) | Markdown tailored to a job, grounded in the Career Profile; because there is no history it writes "[Add your recent roles here …]" placeholders. Stored as an application artifact with provenance (`AI_GENERATED` / `USER_MODIFIED`). |
| Résumé Studio | `/app/resume-studio` | Lists every application's résumé artifact with its version history. |
| DOCX | `lib/docx.ts`, `lib/zip.ts` | Minimal, real .docx from Markdown (headings, bullets, bold/italic); used by application downloads. |
| PDF | — | None. |
| Templates | — | None. |
| LinkedIn import | — | None (LinkedIn has no public API; the product says so). |

## Reusable

- `lib/zip.ts` (a correct ZIP writer) and the OOXML scaffolding patterns in `lib/docx.ts`.
- `server/resume/extractText.ts`: PDF and DOCX text extraction. It is reused as the **ATS extraction check**: generated PDFs and DOCX files are read back with the same code that reads candidates' uploaded résumés.
- Provenance vocabulary and badges (`domain/workflow/resolve.ts`).
- Design-system primitives, `Modal`, `Tabs`, the Playwright set-up and demo mode.

## Missing, and what's built

1. **Structured career history** in the Career Profile: `domain/career/history.ts`. It covers contact, summary, experience with bullets, education, certifications, projects, publications and research interests, and each entry records its provenance. It is edited on the Career Profile page (`components/career/CareerHistoryEditor.tsx`). Without it, no template could show anything true.
2. **Résumé domain** (`domain/resume/`): the `ResumeDocument` schema, built only from the Career Profile. For a target job it may only *select and order* facts, never add them. Also here: the eight-template registry with versioned metadata and theme tokens, an explainable recommender, and a content validator.
3. **Layout engine**: deterministic line breaking and pagination (keep-with-next, no orphan headings, no blank pages) using advance-width tables generated from the embedded font files, plus layout diagnostics.
4. **Renderers**, all from one document:
   - HTML preview (absolutely positioned A4 pages, identical to the PDF by construction);
   - PDF via `pdf-lib`, with embedded fonts, real text and link annotations;
   - DOCX via the existing ZIP writer, with styles, keep-with-next, tab-aligned dates and hyperlinks.
5. **Gallery and flow** under the existing `/app/resume-studio` (no parallel navigation):
   - filters and a recommendation with reasons;
   - previews rendered from the candidate's own data;
   - selection that persists, and generation with real stages;
   - a validation gate before download;
   - "My resumes" history with template id and version and a Career Profile snapshot.
6. **Tests**: TPL-001…030 per template, CROSS-001…015, PDF-001…020, DOCX-001…015, Playwright RESUME-TPL-001…030, and visual baselines of the preview.

## Migration risks

- `CareerDNA.history` is optional. Profiles saved before it exist and load as empty history (`historyOf`); no persisted-store version bump is needed.
- Application résumé artifacts (Markdown) are untouched and keep downloading as before. Template résumés are a separate, versioned record.
- Adds dependencies: `pdf-lib` and `@pdf-lib/fontkit` (loaded only when a PDF is generated), and `@fontsource` font packages (OFL-licensed).

## Deviations planned up front

- **PDF-to-image visual regression.** There's no PDF rasterizer in this environment, so visual baselines are taken of the preview. The preview draws the same positioned lines as the PDF, so it's a faithful proxy. PDFs are also checked structurally: page size, bounds, extracted text.
- **DOCX → PDF rendering (spec §57).** No LibreOffice in this environment, so it's BLOCKED rather than faked. DOCX is checked structurally, by re-extraction, and by an estimated page count from the same paginator.
- **DOCX fonts.** DOCX uses Arial / Georgia (on the spec's approved list and installed almost everywhere). The PDF embeds its fonts.
- **Mockup vs spec.** The mockup's Classic ATS and Technical cards use sidebars; the spec says Classic ATS is single-column, and every template must keep a predictable reading order. All eight are single-column in this release and differ in header, typography, section styling, skill presentation, density and section order. `columns: 2` stays in the metadata model for a later version.
- **Candidate photos.** The mockup's Creative Modern shows a photo. Photos aren't part of the Career Profile, and `photo: false` on every template avoids an ATS-hostile image.
