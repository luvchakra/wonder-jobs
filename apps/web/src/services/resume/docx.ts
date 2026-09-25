/**
 * DOCX renderer (spec §39): built from the same ResumeDocument and template tokens as the PDF, never
 * from the PDF. Real Word structure — paragraph styles, keep-with-next on headings and entry titles,
 * a right tab stop for dates, bullet numbering, real hyperlinks, A4 page size and the template's
 * margins — so the file stays editable and parses cleanly.
 */
import { formatMonth, formatRange } from "@/domain/career/history";
import type { ResumeDocument } from "@/domain/resume/document";
import type { ResumeTemplate } from "@/domain/resume/templates";
import { fittedTemplate } from "@/domain/resume/layout";
import { printableText } from "@/domain/resume/fonts";
import { writeZip } from "@/lib/zip";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hex = (c: string) => c.replace("#", "").toUpperCase();
const twip = (pt: number) => Math.round(pt * 20);
const half = (pt: number) => Math.round(pt * 2);

interface Run {
  text: string;
  bold?: boolean;
  color?: string;
  size?: number;
  caps?: boolean;
  link?: string;
}

class Builder {
  body: string[] = [];
  links: string[] = [];
  constructor(private t: ResumeTemplate) {}

  run(r: Run): string {
    // Characters no résumé font has (emoji) are left out here too, so the DOCX says what the PDF says.
    r = { ...r, text: printableText(r.text, "inter-400") };
    const pr = [r.bold ? "<w:b/>" : r.bold === false ? '<w:b w:val="0"/>' : "", r.caps ? "<w:caps/>" : "", r.color ? `<w:color w:val="${hex(r.color)}"/>` : "", r.size ? `<w:sz w:val="${half(r.size)}"/><w:szCs w:val="${half(r.size)}"/>` : ""].join("");
    const xml = `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`;
    if (!r.link) return xml;
    this.links.push(r.link);
    return `<w:hyperlink r:id="rIdL${this.links.length}" w:history="1">${xml.replace("<w:rPr>", '<w:rPr><w:rStyle w:val="Hyperlink"/>').replace("<w:r><w:t", '<w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t')}</w:hyperlink>`;
  }

  p(style: string, runs: Run[], opts: { keepNext?: boolean; align?: "center" | "left"; tabRight?: boolean; bullet?: boolean; shade?: string; before?: number; after?: number } = {}) {
    const width = 595.28 - this.t.design.page.margin.left - this.t.design.page.margin.right;
    const pPr = [
      `<w:pStyle w:val="${style}"/>`,
      opts.keepNext ? "<w:keepNext/>" : "",
      opts.bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : "",
      opts.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(opts.shade)}"/>` : "",
      opts.tabRight ? `<w:tabs><w:tab w:val="right" w:pos="${twip(width)}"/></w:tabs>` : "",
      opts.before != null || opts.after != null ? `<w:spacing${opts.before != null ? ` w:before="${twip(opts.before)}"` : ""}${opts.after != null ? ` w:after="${twip(opts.after)}"` : ""}/>` : "",
      opts.align === "center" ? '<w:jc w:val="center"/>' : "",
    ].join("");
    this.body.push(`<w:p><w:pPr>${pPr}</w:pPr>${runs.map((r) => this.run(r)).join("")}</w:p>`);
  }

  /** Left text and a right-aligned date on one line (the right tab stop). */
  split(style: string, left: Run[], right: string | undefined, keepNext: boolean, rightLink?: string) {
    const d = this.t.design;
    const runs = [...left];
    const tab = `<w:r><w:tab/></w:r>`;
    // The right-hand text is never bold, whatever the paragraph style (dates beside an entry title).
    this.body.push(
      `<w:p><w:pPr><w:pStyle w:val="${style}"/>${keepNext ? "<w:keepNext/>" : ""}<w:tabs><w:tab w:val="right" w:pos="${twip(595.28 - d.page.margin.left - d.page.margin.right)}"/></w:tabs></w:pPr>${runs.map((r) => this.run(r)).join("")}${right ? `${tab}${this.run({ text: right, color: d.theme.muted, size: d.size.small, bold: false, link: rightLink })}` : ""}</w:p>`,
    );
  }
}

function stylesXml(t: ResumeTemplate): string {
  const d = t.design;
  const f = d.docxFont;
  const font = (name: string) => `<w:rFonts w:ascii="${name}" w:hAnsi="${name}" w:cs="${name}"/>`;
  // "At least" the line height the PDF uses for each style's size. ("Auto" multiplies the font's own
  // leading, about 1.15, and made every line ~15% taller than the PDF.)
  const line = twip(d.size.body * d.lineHeight);
  const rule = d.sectionHeading === "rule" ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${hex(d.theme.border)}"/></w:pBdr>` : "";
  const bar = d.sectionHeading === "bar" ? `<w:pBdr><w:left w:val="single" w:sz="18" w:space="4" w:color="${hex(d.theme.primary)}"/></w:pBdr>` : "";
  const headingColor = d.sectionHeading === "plain" ? d.theme.text : d.theme.primary;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>${font(f.body)}<w:color w:val="${hex(d.theme.text)}"/><w:sz w:val="${half(d.size.body)}"/><w:szCs w:val="${half(d.size.body)}"/><w:lang w:val="en-IN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="${line}" w:lineRule="atLeast"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="40" w:line="${twip(d.size.name * 1.18)}" w:lineRule="atLeast"/></w:pPr><w:rPr>${font(d.fonts.name === "serif" ? "Georgia" : f.heading)}<w:b/><w:sz w:val="${half(d.size.name)}"/>${d.nameCase === "upper" ? "<w:caps/>" : ""}</w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="60" w:line="${twip(d.size.headline * d.lineHeight)}" w:lineRule="atLeast"/></w:pPr><w:rPr><w:b/><w:color w:val="${hex(d.theme.muted)}"/><w:sz w:val="${half(d.size.headline)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Contact"><w:name w:val="Contact"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="${twip(d.space.header)}" w:line="${twip(d.size.contact * d.lineHeight)}" w:lineRule="atLeast"/></w:pPr><w:rPr><w:color w:val="${hex(d.theme.muted)}"/><w:sz w:val="${half(d.size.contact)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/>${rule}${bar}<w:spacing w:before="${twip(d.space.section)}" w:after="${twip(d.space.afterHeading)}" w:line="${twip(d.size.section * 1.3)}" w:lineRule="atLeast"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr>${font(f.heading)}<w:b/>${d.sectionCase === "upper" ? "<w:caps/>" : ""}<w:color w:val="${hex(headingColor)}"/><w:sz w:val="${half(d.size.section)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${twip(d.space.entry)}" w:line="${twip(d.size.entryTitle * d.lineHeight)}" w:lineRule="atLeast"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="${half(d.size.entryTitle)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="EntryDetail"><w:name w:val="Entry Detail"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="0"/></w:pPr><w:rPr><w:color w:val="${hex(d.theme.muted)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="${twip(d.space.bullet)}"/><w:ind w:left="${twip(d.space.bulletIndent + 4)}" w:hanging="${twip(d.space.bulletIndent)}"/></w:pPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="${hex(d.theme.muted)}"/></w:rPr></w:style>
</w:styles>`;
}

const NUMBERING = (color: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="300" w:hanging="220"/></w:pPr><w:rPr><w:color w:val="${hex(color)}"/></w:rPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

/** A list item Word must not break inside ("Stakeholder Management" stays on one line). */
const keepTogether = (s: string) => s.replace(/ /g, "\u00a0");

export function buildResumeDocx(doc: ResumeDocument, template: ResumeTemplate): Uint8Array<ArrayBuffer> {
  // The same spacing the PDF was laid out with (tightened only to save a nearly empty last page).
  const t = fittedTemplate(doc, template);
  const d = t.design;
  const achievements = d.sections.some((x) => x.type === "selected_achievements") && d.sections.some((x) => x.type === "experience") ? doc.sections.find((x) => x.type === "selected_achievements") : undefined;
  const shownBullets = new Set(achievements?.type === "selected_achievements" ? achievements.items.flatMap((x) => x.evidenceIds) : []);
  const b = new Builder(t);
  const center = d.header === "centered" || (d.header === "band" && t.family !== "creative");
  const shade = d.header === "band" ? d.theme.tint : undefined;
  const h = doc.header;

  b.p("Title", [{ text: h.name, color: d.header === "left-accent" || t.family === "creative" ? d.theme.primary : d.theme.text }], { align: center ? "center" : "left", shade });
  if (h.headline) b.p("Subtitle", [{ text: h.headline }], { align: center ? "center" : "left", shade });
  const bare = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  const contacts: Run[] = [
    h.location ? { text: h.location } : null,
    h.phone ? { text: h.phone, link: `tel:${h.phone.replace(/[^\d+]/g, "")}` } : null,
    h.email ? { text: h.email, link: `mailto:${h.email}` } : null,
    h.linkedinUrl ? { text: bare(h.linkedinUrl), link: h.linkedinUrl } : null,
    h.portfolioUrl ? { text: bare(h.portfolioUrl), link: h.portfolioUrl } : null,
    h.websiteUrl ? { text: bare(h.websiteUrl), link: h.websiteUrl } : null,
  ].filter((x): x is Run => !!x);
  if (contacts.length) b.p("Contact", contacts.flatMap((c, i) => (i ? [{ text: d.header === "left" || d.header === "left-accent" ? "  |  " : "  ·  " }, c] : [c])), { align: center ? "center" : "left", shade });

  const bullet = (text: string) => b.p("ListBullet", [{ text }], { bullet: true });
  const accent = d.theme.primary === "#000000" ? d.theme.text : d.theme.primary;
  for (const sec of d.sections) {
    const s = doc.sections.find((x) => x.type === sec.type);
    if (!s) continue;
    b.p("Heading1", [{ text: sec.title }], { keepNext: true });
    switch (s.type) {
      case "summary":
        b.p("Normal", [{ text: s.text }]);
        break;
      case "strengths":
      case "selected_achievements":
        s.items.forEach((x) => bullet(typeof x === "string" ? x : x.text));
        break;
      case "transferable_skills":
      case "research_interests":
        b.p("Normal", [{ text: s.items.map(keepTogether).join("  ·  ") }]);
        break;
      case "skills":
        if (d.skills === "grouped") s.groups.forEach((g) => b.p("Normal", [{ text: `${g.name}: `, bold: true }, { text: g.skills.map(keepTogether).join(", ") }]));
        else b.p("Normal", [{ text: (s.ordered ?? s.groups.flatMap((g) => g.skills)).map(keepTogether).join("  ·  ") }]);
        break;
      case "experience":
        for (const orig of s.items) {
          const e = { ...orig, bullets: orig.bullets.filter((x) => !x.evidenceIds.some((id) => shownBullets.has(id))) };
          const dates = formatRange(e.startDate, e.endDate, e.current);
          if (d.entry === "company-first") {
            b.split("Heading2", [{ text: e.employer, bold: true }], dates, true);
            b.split("EntryDetail", [{ text: e.title, bold: true, color: accent }], e.location, e.bullets.length > 0 || !!e.summary);
          } else {
            b.split("Heading2", [{ text: e.title, bold: true }], dates, true);
            b.p("EntryDetail", [{ text: [e.employer, e.location].filter(Boolean).join("  ·  "), bold: true }], { keepNext: e.bullets.length > 0 || !!e.summary });
          }
          if (e.summary) b.p("EntryDetail", [{ text: e.summary }], { keepNext: e.bullets.length > 0 });
          e.bullets.forEach((x) => bullet(x.text));
        }
        break;
      case "education":
        for (const e of s.items) {
          const detail = [[e.degree, e.field].filter(Boolean).join(", "), e.location].filter(Boolean).join("  ·  ");
          b.split("Heading2", [{ text: e.institution, bold: true }], formatRange(e.startDate, e.endDate) || undefined, !!detail);
          if (detail) b.p("EntryDetail", [{ text: detail }]);
          if (e.honors?.length) b.p("EntryDetail", [{ text: e.honors.join(", "), size: d.size.small }]);
        }
        break;
      case "certifications":
        for (const c of s.items) {
          const date = [formatMonth(c.issueDate), c.expiryDate ? `expires ${formatMonth(c.expiryDate)}` : ""].filter(Boolean).join(" · ");
          // A linked name keeps the text colour, as in the PDF (the link is still there).
          b.split("Normal", [{ text: c.name, bold: true, link: c.url, color: d.theme.text }, ...(c.issuer ? [{ text: ` — ${c.issuer}` }] : [])], date || undefined, false);
          if (c.credentialId) b.p("EntryDetail", [{ text: `Credential ID ${c.credentialId}`, size: d.size.small }]);
        }
        break;
      case "projects":
        for (const p of s.items) {
          // The link's host sits on the right of the title line, as in the PDF.
          const host = p.url ? p.url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "") : undefined;
          b.split("Heading2", [{ text: p.name, bold: true }], host, !!(p.description || p.technologies?.length || p.bullets?.length), p.url);
          if (p.description) b.p("Normal", [{ text: p.description }]);
          if (p.technologies?.length) b.p("EntryDetail", [{ text: "Technologies: ", bold: true, size: d.size.small }, { text: p.technologies.join(", "), size: d.size.small }]);
          (p.bullets ?? []).forEach((x) => bullet(x.text));
        }
        break;
      case "publications":
        for (const p of s.items) b.p("Normal", [...(p.authors?.length ? [{ text: `${p.authors.join(", ")}. ` }] : []), { text: `${p.title}.`, link: p.url }, { text: [p.publication, formatMonth(p.date)].filter(Boolean).length ? ` ${[p.publication, formatMonth(p.date)].filter(Boolean).join(", ")}.` : "" }], { after: 4 });
        break;
    }
  }

  const m = d.page.margin;
  const sectPr = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${twip(m.top)}" w:right="${twip(m.right)}" w:bottom="${twip(m.bottom)}" w:left="${twip(m.left)}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${b.body.join("")}${sectPr}</w:body></w:document>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
${b.links.map((u, i) => `<Relationship Id="rIdL${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(u)}" TargetMode="External"/>`).join("\n")}
</Relationships>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(`${h.name} — Résumé`)}</dc:title><dc:creator>${esc(h.name)}</dc:creator><cp:keywords>${esc(t.id)}</cp:keywords><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;
  const pkgRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;
  const enc = new TextEncoder();
  return writeZip([
    { name: "[Content_Types].xml", data: enc.encode(types) },
    { name: "_rels/.rels", data: enc.encode(pkgRels) },
    { name: "docProps/core.xml", data: enc.encode(core) },
    { name: "word/document.xml", data: enc.encode(document) },
    { name: "word/_rels/document.xml.rels", data: enc.encode(rels) },
    { name: "word/styles.xml", data: enc.encode(stylesXml(t)) },
    { name: "word/numbering.xml", data: enc.encode(NUMBERING(d.theme.primary === "#000000" ? d.theme.text : d.theme.primary)) },
  ]);
}
