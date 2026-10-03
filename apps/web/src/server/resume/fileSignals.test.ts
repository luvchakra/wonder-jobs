import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { writeZip } from "@/lib/zip";
import { buildResumeDocument } from "@/domain/resume/document";
import { layoutResume } from "@/domain/resume/layout";
import { RESUME_TEMPLATES } from "@/domain/resume/templates";
import { REALISTIC_FIXTURE } from "@/domain/resume/fixtures";
import { renderResumePdf } from "@/services/resume/pdf";
import { buildResumeDocx } from "@/services/resume/docx";
import { fileSignals, lineStarts, looksMultiColumn } from "./fileSignals";
import { checkResumeAts } from "./atsCheck";
import { extractDocxText } from "./extractText";
import { analyseHistory } from "./parseHistory";

function pdf(content: string, extra = ""): Buffer {
  const body = deflateSync(Buffer.from(content, "latin1"));
  return Buffer.concat([Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Type /Pages /Count 2 /MediaBox [0 0 612 792] >>\nendobj\n${extra}2 0 obj\n<< /Length ${body.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), body, Buffer.from("\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF", "latin1")]);
}

const sentence = "Led the migration of the ledger service to an event-sourced design";

describe("where lines start on the page", () => {
  it("follows Tm, Td, T* and cm to page coordinates", () => {
    const s = lineStarts("q 1 0 0 1 50 0 cm BT /F1 10 Tf 14 TL 1 0 0 1 20 700 Tm (A) Tj T* (B) Tj 0 -20 Td (C) Tj ET Q BT 1 0 0 1 300 600 Tm (D) Tj ET");
    expect(s.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([[70, 700], [70, 686], [70, 666], [300, 600]]);
  });

  it("counts a second column of prose, but not right-aligned dates, centred headings or a grid of skills", () => {
    const twoCol = Array.from({ length: 10 }, (_, i) => `BT 1 0 0 1 40 ${700 - i * 14} Tm (Skill ${i}) Tj ET BT 1 0 0 1 250 ${700 - i * 14} Tm (${sentence}) Tj ET`).join("\n");
    expect(looksMultiColumn(lineStarts(twoCol), 612)).toBe(true);
    const single = Array.from({ length: 10 }, (_, i) => `BT 1 0 0 1 40 ${700 - i * 30} Tm (${sentence}) Tj ET BT 1 0 0 1 ${470 + (i % 3) * 7} ${700 - i * 30} Tm (Jan 2020 - Present) Tj ET BT 1 0 0 1 ${220 + i * 5} ${690 - i * 30} Tm (HEADING ${i}) Tj ET`).join("\n");
    expect(looksMultiColumn(lineStarts(single), 612)).toBe(false);
    const grid = Array.from({ length: 10 }, (_, i) => `BT 1 0 0 1 40 ${700 - i * 14} Tm (Go) Tj ET BT 1 0 0 1 250 ${700 - i * 14} Tm (Kubernetes) Tj ET`).join("\n");
    expect(looksMultiColumn(lineStarts(grid), 612)).toBe(false);
  });

  it("reads page count, images, fonts without a Unicode map, and link targets from a PDF", () => {
    const s = fileSignals(pdf("BT 1 0 0 1 40 700 Tm (Hello) Tj ET", "3 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /X >>\nendobj\n4 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 >>\nendobj\n5 0 obj\n<< /S /URI /URI (https://www.linkedin.com/in/asha) >>\nendobj\n"), "pdf");
    expect(s).toMatchObject({ format: "pdf", pageCount: 2, imageCount: 1, fontsWithoutUnicode: 1, multiColumn: false, links: ["https://www.linkedin.com/in/asha"] });
  });
});

describe("Word document structure", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  const docx = (body: string, extra: { name: string; data: string }[] = []) =>
    Buffer.from(writeZip([{ name: "[Content_Types].xml", data: enc("<Types/>") }, { name: "word/document.xml", data: enc(`<w:document><w:body>${body}</w:body></w:document>`) }, ...extra.map((e) => ({ name: e.name, data: enc(e.data) }))]));

  it("finds tables, text boxes, columns, header text, images, links and page count", () => {
    const s = fileSignals(
      docx(`<w:tbl><w:tr><w:tc><w:p><w:r><w:t>x</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:txbxContent><w:p/></w:txbxContent><w:sectPr><w:cols w:num="2"/></w:sectPr>`, [
        { name: "word/header1.xml", data: "<w:hdr><w:p><w:r><w:t>asha@example.com</w:t></w:r></w:p></w:hdr>" },
        { name: "word/media/image1.png", data: "x" },
        { name: "word/_rels/document.xml.rels", data: '<Relationships><Relationship Id="r1" Type="hyperlink" Target="https://linkedin.com/in/asha" TargetMode="External"/></Relationships>' },
        { name: "docProps/app.xml", data: "<Properties><Pages>3</Pages></Properties>" },
      ]),
      "docx",
    );
    expect(s).toMatchObject({ pageCount: 3, imageCount: 1, multiColumn: true, links: ["https://linkedin.com/in/asha"], docx: { tables: 1, textBoxes: 1, columns: 2, headerFooterText: "asha@example.com" } });
  });

  it("writes list bullets into the text, so achievements are told apart from role lines", () => {
    const text = extractDocxText(docx(`<w:p><w:r><w:t>Example Payments</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Led the roadmap</w:t></w:r></w:p>`));
    expect(text).toBe("Example Payments\n• Led the roadmap");
  });
});

describe("our own templates, read back the way an upload is read", () => {
  it("every template's PDF and Word file reads cleanly: one column, real text, every role, no structural findings", async () => {
    const fontDir = path.resolve(__dirname, "../../../public/fonts/resume");
    const doc = buildResumeDocument(REALISTIC_FIXTURE, { now: "2026-09-25T00:00:00.000Z" });
    for (const t of RESUME_TEMPLATES) {
      const pdfBytes = Buffer.from(await renderResumePdf(layoutResume(doc, t), { loadFont: async (k) => new Uint8Array(fs.readFileSync(path.join(fontDir, `${k}.ttf`))), title: "x", author: "x" }));
      for (const [kind, bytes] of [["pdf", pdfBytes], ["docx", Buffer.from(buildResumeDocx(doc, t))]] as const) {
        const r = checkResumeAts(bytes, `Priya-Raghunathan-Resume.${kind}`);
        const label = `${t.id} ${kind}`;
        for (const f of r.findings.filter((x) => x.category === "parse" || x.category === "structure")) expect(f.status, `${label}: ${f.id} — ${f.detail}`).not.toBe("fail");
        expect(r.findings.find((f) => f.id === "columns")?.status, label).toBe("pass");
        expect(r.findings.find((f) => f.id === "roles")?.status, label).toBe("pass");
        expect(r.score, label).toBeGreaterThanOrEqual(90);
      }
    }
  }, 120_000);

  it("reads role headers our templates write: employer ending “Pvt. Ltd.”, a title with a comma, the place on its own line", async () => {
    const fontDir = path.resolve(__dirname, "../../../public/fonts/resume");
    const doc = buildResumeDocument(REALISTIC_FIXTURE, { now: "2026-09-25T00:00:00.000Z" });
    const t = RESUME_TEMPLATES.find((x) => x.id === "modern-minimal-v1")!;
    const bytes = Buffer.from(await renderResumePdf(layoutResume(doc, t), { loadFont: async (k) => new Uint8Array(fs.readFileSync(path.join(fontDir, `${k}.ttf`))), title: "x", author: "x" }));
    const roles = analyseHistory((await import("./extractText")).extractResumeText(bytes).text).draft.experience;
    expect(roles.map((r) => `${r.title} @ ${r.employer}`)).toEqual(["Senior Software Engineer, Platform @ Example Payments Pvt. Ltd.", "Software Engineer II @ Sample Messaging Co.", "Software Engineer @ Demo Software Labs"]);
    expect(roles[0].bullets).toHaveLength(4);
  }, 60_000);
});
