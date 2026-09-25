import { it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildResumeDocument } from "./document";
import { layoutResume } from "./layout";
import { RESUME_TEMPLATES } from "./templates";
import { validateResume } from "./validate";
import { FIXTURES, PASTED_FIXTURE, REALISTIC_FIXTURE } from "./fixtures";
import { SEED_DNA } from "@/services/mock/seed";
import { renderResumePdf } from "@/services/resume/pdf";
import { buildResumeDocx } from "@/services/resume/docx";
import type { CareerDNA } from "@/domain/career/types";

/**
 * Résumé QA harness (not part of the normal run): renders every template for every fixture — plus the
 * demo candidate, a realistic profile and pasted text — to real PDF and DOCX files for inspection.
 *
 *   RESUME_QA_OUT=/tmp/rq npx vitest run src/domain/resume/renderAll.qa.test.ts
 *   python3 scripts/resume-qa-audit.py /tmp/rq     # reads the PDFs back: overlaps, margins, glyphs, text
 *
 * Rasterize with PyMuPDF to look at the pages; render the DOCX files with LibreOffice (Writer, with
 * Georgia-metric Gelasio installed) to compare their pagination with the PDF's.
 */
const OUT = process.env.RESUME_QA_OUT;

const ALL: Record<string, CareerDNA> = { ...FIXTURES, demo: SEED_DNA, engineer: REALISTIC_FIXTURE, pasted: PASTED_FIXTURE };

it.skipIf(!OUT)("render every template for every fixture", async () => {
  const fontDir = path.resolve(__dirname, "../../../public/fonts/resume");
  const summary: Record<string, unknown> = {};
  for (const [fx, dna] of Object.entries(ALL)) {
    const doc = buildResumeDocument(dna, { now: "2026-09-25T00:00:00.000Z" });
    fs.mkdirSync(path.join(OUT!, fx), { recursive: true });
    fs.writeFileSync(path.join(OUT!, fx, "document.json"), JSON.stringify(doc, null, 1));
    for (const t of RESUME_TEMPLATES) {
      const layout = layoutResume(doc, t);
      const report = validateResume(doc, t, layout.diagnostics);
      const pdf = await renderResumePdf(layout, { loadFont: async (k) => new Uint8Array(fs.readFileSync(path.join(fontDir, `${k}.ttf`))), title: `${doc.header.name} — Résumé`, author: doc.header.name });
      fs.writeFileSync(path.join(OUT!, fx, `${t.id}.pdf`), pdf);
      fs.writeFileSync(path.join(OUT!, fx, `${t.id}.docx`), buildResumeDocx(doc, t));
      fs.writeFileSync(path.join(OUT!, fx, `${t.id}.layout.json`), JSON.stringify(layout));
      summary[`${fx}/${t.id}`] = { pages: layout.pages.length, ok: report.ok, diag: layout.diagnostics, issues: report };
    }
  }
  fs.writeFileSync(path.join(OUT!, "summary.json"), JSON.stringify(summary, null, 1));
}, 120_000);
