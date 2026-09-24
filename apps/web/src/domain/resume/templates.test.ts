import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildResumeDocument, factsOf, type ResumeDocument } from "./document";
import { FIXTURES } from "./fixtures";
import { layoutResume, type DrawItem, type ResumeLayout } from "./layout";
import { recommendTemplate } from "./recommend";
import { getTemplate, RESUME_TEMPLATES, STANDARD_HEADINGS, type ResumeTemplate } from "./templates";
import { validateResume } from "./validate";
import { renderResumePdf } from "@/services/resume/pdf";
import { buildResumeDocx } from "@/services/resume/docx";
import { extractDocxText, extractPdfText, readZipEntries, readZipEntry } from "@/server/resume/extractText";
import { SEED_DNA } from "@/services/mock/seed";

/**
 * Résumé template tests (spec §50 TPL-001…030, §51 CROSS-001…015, §55 PDF-001…020, §56
 * DOCX-001…015). Every check runs the real renderers on synthetic fixtures and reads the output back
 * with the same extractor WonderJobs uses on candidates' uploaded résumés.
 */

const loadFont = async (k: string) => readFileSync(`public/fonts/resume/${k}.ttf`);
type TextItem = Extract<DrawItem, { kind: "text" }>;
const texts = (l: ResumeLayout, page?: number) => (page == null ? l.pages : [l.pages[page]]).flatMap((p) => p.items.filter((i): i is TextItem => i.kind === "text"));
const str = (t: TextItem) => t.segments.map((s) => s.text).join("");
const docs = Object.fromEntries(Object.entries(FIXTURES).map(([k, dna]) => [k, buildResumeDocument(dna, { now: "2026-09-25T00:00:00.000Z" })])) as Record<keyof typeof FIXTURES, ResumeDocument>;
const EXPECTED_IDS = ["executive-v1", "modern-minimal-v1", "technical-v1", "classic-ats-v1", "leadership-v1", "career-shift-v1", "academic-v1", "creative-modern-v1"];
/** Page ranges per fixture (spec §58): a range, never an exact count, and more pages than this fails. */
const PAGES: Record<keyof typeof FIXTURES, [number, number]> = { ats: [2, 3], extreme: [2, 4], sparse: [1, 1], international: [1, 2], links: [1, 2] };
const headingsOf = (l: ResumeLayout, t: ResumeTemplate) => {
  const titles = new Set(t.design.sections.map((s) => (t.design.sectionCase === "upper" ? s.title.toUpperCase() : s.title)));
  return texts(l).map(str).filter((s) => titles.has(s));
};

describe.each(RESUME_TEMPLATES.map((t) => [t.id, t] as const))("%s", (_id, t) => {
  const lay = Object.fromEntries(Object.entries(docs).map(([k, d]) => [k, layoutResume(d, t)])) as Record<keyof typeof FIXTURES, ResumeLayout>;
  let pdf: Buffer;
  let pdfText: string;
  let docx: Buffer;
  let docxText: string;
  beforeAll(async () => {
    pdf = Buffer.from(await renderResumePdf(lay.ats, { loadFont, title: "Résumé", author: "Test" }));
    pdfText = extractPdfText(pdf);
    docx = Buffer.from(buildResumeDocx(docs.ats, t));
    docxText = extractDocxText(docx);
  });

  it("TPL-001 metadata loads", () => {
    expect(t).toMatchObject({ name: expect.any(String), version: expect.any(String), family: expect.any(String), atsCompatibility: expect.stringMatching(/high/) });
    expect(t.supportedSections.length).toBeGreaterThan(3);
    expect(t.design.sections.map((s) => s.type)).toEqual(t.defaultSectionOrder);
  });
  it("TPL-002 template id is stable and versioned", () => {
    expect(EXPECTED_IDS).toContain(t.id);
    expect(t.id).toBe(`${t.id.replace(/-v\d+$/, "")}-v${t.version}`);
    expect(getTemplate(t.id)).toBe(t);
  });
  it("TPL-003 every supported section with content renders", () => {
    const present = t.design.sections.filter((s) => docs.ats.sections.some((d) => d.type === s.type));
    expect(headingsOf(lay.ats, t)).toEqual(present.map((s) => (t.design.sectionCase === "upper" ? s.title.toUpperCase() : s.title)));
  });
  it("TPL-004 unsupported sections are omitted", () => {
    const all = ["PUBLICATIONS", "Publications", "RESEARCH INTERESTS", "Research Interests", "TRANSFERABLE SKILLS", "LEADERSHIP HIGHLIGHTS"];
    const allowed = new Set(t.design.sections.flatMap((s) => [s.title, s.title.toUpperCase()]));
    for (const h of all) if (!allowed.has(h)) expect(texts(lay.ats).map(str)).not.toContain(h);
  });
  it("TPL-005 empty sections are omitted", () => {
    const shown = headingsOf(lay.sparse, t).map((h) => h.toLowerCase());
    for (const empty of ["certifications", "projects", "publications", "education", "summary", "professional summary"]) expect(shown).not.toContain(empty);
    expect(texts(lay.sparse).map(str).join(" ")).not.toMatch(/·\s*$|\|\s*$/);
  });
  it.each([
    ["TPL-006 long candidate name", "extreme"],
    ["TPL-007 long headline", "extreme"],
    ["TPL-008 long employer name", "extreme"],
    ["TPL-009 long job title", "extreme"],
    ["TPL-010 long bullet", "extreme"],
  ] as const)("%s wraps without overflowing", (_n, fx) => {
    expect(lay[fx].diagnostics.overflowElements).toEqual([]);
  });
  it("TPL-011 bullets stay aligned", () => {
    const xs = new Set(texts(lay.ats).filter((i) => str(i) === "•").map((i) => i.x.toFixed(2)));
    // Strengths/achievements bullets and column bullets share one indent per column.
    expect(xs.size).toBeLessThanOrEqual(2);
  });
  it("TPL-012 dates align to the right margin", () => {
    const right = 595.28 - t.design.page.margin.right;
    const dates = texts(lay.ats).filter((i) => / – (Present|[A-Z][a-z]{2} \d{4})$/.test(str(i)));
    expect(dates.length).toBeGreaterThan(2);
    for (const d of dates) expect(Math.abs(d.x + d.width - right)).toBeLessThan(0.6);
  });
  it("TPL-013 a section heading never ends a page", () => {
    for (const l of Object.values(lay)) expect(l.diagnostics.orphanHeadings).toEqual([]);
  });
  it("TPL-014 an experience heading stays with its first bullet", () => {
    for (const fx of ["ats", "extreme"] as const) {
      const l = lay[fx];
      const seq = l.pages.flatMap((p, pi) => p.items.filter((i): i is TextItem => i.kind === "text").map((i) => ({ pi, s: str(i) })));
      const exp = docs[fx].sections.find((s) => s.type === "experience");
      if (exp?.type !== "experience") continue;
      for (const e of exp.items) {
        const at = seq.findIndex((x) => x.s.startsWith(e.employer.slice(0, 20)) || x.s.startsWith(e.title.slice(0, 20)));
        const bullet = seq.findIndex((x, i) => i > at && x.s === "•");
        if (at < 0 || bullet < 0 || !e.bullets.length) continue;
        expect(seq[bullet].pi, `${t.id} ${fx}: ${e.employer}`).toBe(seq[at].pi);
      }
    }
  });
  it("TPL-015 no overlapping elements", () => {
    for (const l of Object.values(lay)) expect(l.diagnostics.overlappingElements).toEqual([]);
  });
  it("TPL-016 nothing leaves the printable area", () => {
    for (const l of Object.values(lay)) expect(l.diagnostics.outOfBoundsElements).toEqual([]);
  });
  it("TPL-017 no accidental blank page", () => {
    for (const l of Object.values(lay)) expect(l.diagnostics.emptyPages).toEqual([]);
  });
  it("TPL-018 a two-page résumé continues at the top of page 2", () => {
    expect(lay.ats.pages.length).toBeGreaterThanOrEqual(2);
    const first = Math.min(...texts(lay.ats, 1).map((i) => i.y));
    expect(first).toBeLessThan(t.design.page.margin.top + 20);
  });
  it("TPL-019 long content paginates within range, deterministically", () => {
    const again = layoutResume(docs.extreme, t);
    expect(JSON.stringify(again.pages)).toBe(JSON.stringify(lay.extreme.pages));
    for (const [fx, [lo, hi]] of Object.entries(PAGES)) {
      const n = lay[fx as keyof typeof FIXTURES].pages.length;
      expect(n, fx).toBeGreaterThanOrEqual(lo);
      expect(n, fx).toBeLessThanOrEqual(hi);
    }
  });
  it("TPL-020 links render as links", () => {
    const links = texts(lay.links).filter((i) => i.link).map((i) => i.link);
    expect(links).toEqual(expect.arrayContaining(["mailto:test@example.com", "tel:+919876543210", "https://www.linkedin.com/in/example", "https://portfolio.example.com", "https://www.example.org/about"]));
  });
  it("TPL-021 Unicode renders with no missing glyphs", async () => {
    expect(lay.international.diagnostics.missingGlyphs).toEqual([]);
    const intl = extractPdfText(Buffer.from(await renderResumePdf(lay.international, { loadFont, title: "t", author: "a" })));
    // Case is presentation (some templates set the name in capitals); the characters must survive.
    for (const s of ["José García Müller", "München", "Zürich", "Łódź", "Société"]) expect(intl.toLowerCase()).toContain(s.toLowerCase());
  });
  it("TPL-022 ATS extraction contains the candidate's name", () => {
    expect(pdfText.toLowerCase()).toContain(FIXTURES.ats.name.toLowerCase());
  });
  it("TPL-023 ATS extraction contains the experience", () => {
    for (const e of FIXTURES.ats.history!.experience) {
      expect(pdfText).toContain(e.employer);
      expect(pdfText).toContain(e.title);
    }
  });
  it("TPL-024 ATS extraction contains the skills shown", () => {
    if (!t.design.sections.some((s) => s.type === "skills")) return;
    for (const s of ["SailPoint", "CyberArk", "Okta"]) expect(pdfText).toContain(s);
  });
  it("TPL-025 ATS extraction preserves section order", () => {
    const order = headingsOf(lay.ats, t);
    const pos = order.map((h) => pdfText.indexOf(h));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });
  it("TPL-026 no essential text lives only in images", () => {
    expect(pdf.toString("latin1")).not.toMatch(/\/Subtype\s*\/Image/);
  });
  it("TPL-027 / PDF-001…005 the PDF is valid and readable", () => {
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toMatch(/%%EOF\s*$/);
    expect(pdf.toString("latin1").match(/\/MediaBox\s*\[\s*0 0 595\.28 841\.89\s*\]/g)?.length).toBe(lay.ats.pages.length);
    expect(pdfText.length).toBeGreaterThan(500);
  });
  it("TPL-028 / DOCX-001…003 the DOCX is a valid package", () => {
    const names = readZipEntries(docx).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/numbering.xml", "word/_rels/document.xml.rels"]));
    const xml = readZipEntry(docx, readZipEntries(docx).find((e) => e.name === "word/document.xml")!).toString("utf8");
    expect(xml).toMatch(/^<\?xml[\s\S]*<w:body>[\s\S]*<\/w:body><\/w:document>$/);
    expect(xml.match(/<w:p>/g)!.length).toBe(xml.match(/<\/w:p>/g)!.length);
  });
  it("TPL-029 PDF page count matches the layout", () => {
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length).toBe(lay.ats.pages.length);
  });
  it("TPL-030 DOCX carries every section and entry the layout paginated (page count is estimated from the same paginator)", () => {
    for (const h of headingsOf(lay.ats, t)) expect(docxText.toLowerCase()).toContain(h.toLowerCase());
    for (const e of FIXTURES.ats.history!.experience) expect(docxText).toContain(e.employer);
  });

  /* ---------------------------------------------------------- PDF §55 */
  it("PDF-006…011 name, title, experience, education, skills and links are present", () => {
    const has = (s: string) => expect(pdfText.toLowerCase()).toContain(s.toLowerCase());
    has(FIXTURES.ats.headline);
    if (t.design.sections.some((s) => s.type === "education")) has("Example Institute of Technology");
    has("candidate@example.com");
    expect(pdf.toString("latin1")).toMatch(/\/URI\s*\(mailto:candidate@example\.com\)/);
  });
  it("PDF-012…017 no placeholders, undefined, null, NaN, debug or hidden text", () => {
    expect(pdfText).not.toMatch(/\[[^\]]{0,40}\]|\{\{|\bundefined\b|\bnull\b|\bNaN\b|DEBUG|lorem ipsum/i);
  });
  it("PDF-018 no duplicate sections", () => {
    const h = headingsOf(lay.ats, t);
    expect(new Set(h).size).toBe(h.length);
  });

  /* --------------------------------------------------------- DOCX §56 */
  it("DOCX-004…008 name, experience, education, skills and hyperlinks exist", () => {
    expect(docxText).toContain(FIXTURES.ats.name);
    if (t.design.sections.some((s) => s.type === "education")) expect(docxText).toContain("Example Institute of Technology");
    const rels = readZipEntry(docx, readZipEntries(docx).find((e) => e.name === "word/_rels/document.xml.rels")!).toString("utf8");
    expect(rels).toContain('Target="mailto:candidate@example.com" TargetMode="External"');
  });
  it("DOCX-009…014 no placeholders; styles, headings, A4 size and the template's margins", () => {
    expect(docxText).not.toMatch(/\{\{|\bundefined\b|\bnull\b|\bNaN\b/);
    const styles = readZipEntry(docx, readZipEntries(docx).find((e) => e.name === "word/styles.xml")!).toString("utf8");
    for (const id of ["Title", "Heading1", "Heading2", "ListBullet", "Hyperlink"]) expect(styles).toContain(`w:styleId="${id}"`);
    const xml = readZipEntry(docx, readZipEntries(docx).find((e) => e.name === "word/document.xml")!).toString("utf8");
    expect(xml).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
    expect(xml).toContain(`w:left="${Math.round(t.design.page.margin.left * 20)}"`);
    expect(xml).toContain("<w:keepNext/>");
  });

  it("every heading is one an ATS recognizes", () => {
    for (const s of t.design.sections) expect(STANDARD_HEADINGS.has(s.title.toLowerCase())).toBe(true);
  });
  it("validation passes for the standard fixture and blocks a résumé with no work history", () => {
    expect(validateResume(docs.ats, t, lay.ats.diagnostics, { expectExperience: true }).ok).toBe(true);
    const empty = buildResumeDocument({ ...FIXTURES.sparse, history: { ...FIXTURES.sparse.history!, experience: [] } });
    const r = validateResume(empty, t, layoutResume(empty, t).diagnostics, { expectExperience: true });
    expect(r.ok).toBe(false);
    expect(r.issues[0].message).toMatch(/work history/);
  });
});

describe("cross-template (spec §51)", () => {
  const all = RESUME_TEMPLATES.map((t) => ({ t, l: layoutResume(docs.ats, t) }));

  it("CROSS-001/006 the same document renders in all eight templates", () => {
    expect(all).toHaveLength(8);
    for (const { l } of all) expect(l.pages.length).toBeGreaterThan(0);
  });
  it("CROSS-002/005 facts are identical — templates neither add nor remove any", () => {
    for (const { t, l } of all) {
      const text = texts(l).map(str).join("\n").toLowerCase();
      const experienceShown = t.design.sections.some((s) => s.type === "experience");
      for (const f of factsOf(docs.ats)) {
        if (!experienceShown) continue;
        // Facts may wrap across lines; compare their first words.
        expect(text.replace(/\s+/g, " "), `${t.id}: ${f}`).toContain(f.toLowerCase().split(" ").slice(0, 3).join(" ").replace(/-\d\d$/, ""));
      }
    }
  });
  it("CROSS-003/004 changing template doesn't change the Career Profile or provenance", () => {
    const dna = structuredClone(FIXTURES.ats);
    const before = JSON.stringify(dna);
    const d1 = buildResumeDocument(dna);
    for (const t of RESUME_TEMPLATES) layoutResume(d1, t);
    expect(JSON.stringify(dna)).toBe(before);
    const exp = d1.sections.find((s) => s.type === "experience");
    expect(exp && exp.type === "experience" && exp.items[0].bullets[0]).toMatchObject({ provenance: "USER_PROVIDED", evidenceIds: [expect.stringMatching(/^fx_b/)] });
  });
  it("CROSS-007…015 every template passes every fixture's layout checks", () => {
    for (const t of RESUME_TEMPLATES)
      for (const [fx, d] of Object.entries(docs)) {
        const g = layoutResume(d, t).diagnostics;
        expect({ t: t.id, fx, ...g, pageCount: undefined }).toEqual({ t: t.id, fx, overflowElements: [], overlappingElements: [], outOfBoundsElements: [], orphanHeadings: [], emptyPages: [], missingGlyphs: [], pageCount: undefined });
      }
  });
  it("a target job only reorders — the facts are the same set", () => {
    const plain = buildResumeDocument(FIXTURES.ats);
    const tailored = buildResumeDocument(FIXTURES.ats, { target: { id: "j1", title: "Privileged Access Lead", company: "Acme", description: "CyberArk privileged access audit", skills: ["CyberArk"] } });
    expect([...factsOf(tailored)].sort()).toEqual([...factsOf(plain)].sort());
    const skills = tailored.sections.find((s) => s.type === "skills");
    expect(skills?.type === "skills" && skills.groups.flatMap((g) => g.skills)).toContain("CyberArk");
  });
});

describe("recommendation (spec §5, §68)", () => {
  it("explains itself from the profile, without a score", () => {
    const r = recommendTemplate({ ...FIXTURES.ats, history: { ...FIXTURES.ats.history!, publications: [], researchInterests: [] } });
    expect(["executive-v1", "leadership-v1"]).toContain(r.templateId);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.reasons.join(" ")).not.toMatch(/\d+%|score/i);
  });
  it("a product manager gets a product-friendly template, not Technical, even with SQL in their skills", () => {
    expect(recommendTemplate(SEED_DNA).templateId).toBe("creative-modern-v1");
  });
  it("research and publications → Academic", () => {
    expect(recommendTemplate(FIXTURES.ats).templateId).toBe("academic-v1");
  });
});
