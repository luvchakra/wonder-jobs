/**
 * PDF renderer (spec §40). Draws the laid-out pages exactly as positioned by the layout engine:
 * embedded, subsetted fonts; real, selectable text with a ToUnicode map (so an ATS reads it);
 * link annotations for email, phone and URLs; no rasterized pages. Saved without object streams, so
 * even simple parsers can read it.
 */
import { PDFDocument, PDFString, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { widthOf, type FontKey } from "@/domain/resume/fonts";
import { fontsUsed, type DrawItem, type ResumeLayout } from "@/domain/resume/layout";

export type FontLoader = (key: FontKey) => Promise<Uint8Array>;

function color(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function roundedRectPath(w: number, h: number, r: number) {
  const q = Math.min(r, w / 2, h / 2);
  return `M ${q} 0 H ${w - q} Q ${w} 0 ${w} ${q} V ${h - q} Q ${w} ${h} ${w - q} ${h} H ${q} Q 0 ${h} 0 ${h - q} V ${q} Q 0 0 ${q} 0 Z`;
}

const ORDER: Record<DrawItem["kind"], number> = { rect: 0, line: 1, text: 2 };

function drawItem(pdf: PDFDocument, page: PDFPage, it: DrawItem, fonts: Map<FontKey, PDFFont>, pageH: number) {
  if (it.kind === "rect") {
    if (it.radius) page.drawSvgPath(roundedRectPath(it.w, it.h, it.radius), { x: it.x, y: pageH - it.y, color: it.fill ? color(it.fill) : undefined, borderColor: it.stroke ? color(it.stroke) : undefined, borderWidth: it.stroke ? 0.6 : 0 });
    else page.drawRectangle({ x: it.x, y: pageH - it.y - it.h, width: it.w, height: it.h, color: it.fill ? color(it.fill) : undefined, borderColor: it.stroke ? color(it.stroke) : undefined, borderWidth: it.stroke ? 0.6 : 0 });
    return;
  }
  if (it.kind === "line") {
    page.drawLine({ start: { x: it.x1, y: pageH - it.y1 }, end: { x: it.x2, y: pageH - it.y2 }, thickness: it.width, color: color(it.color) });
    return;
  }
  let x = it.x;
  for (const seg of it.segments) {
    page.drawText(seg.text, { x, y: pageH - it.y, size: it.size, font: fonts.get(seg.font)!, color: color(it.color) });
    x += widthOf(seg.text, seg.font, it.size);
  }
  if (it.link) {
    const annot = pdf.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [it.x, pageH - it.y - it.size * 0.25, it.x + it.width, pageH - it.y + it.size * 0.85],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(it.link) },
    });
    page.node.addAnnot(pdf.context.register(annot));
  }
}

export async function renderResumePdf(layout: ResumeLayout, opts: { loadFont: FontLoader; title: string; author: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(opts.title);
  pdf.setAuthor(opts.author);
  pdf.setCreator("WonderJobs");
  pdf.setProducer("WonderJobs résumé renderer");
  pdf.setLanguage("en");
  const fonts = new Map<FontKey, PDFFont>();
  for (const key of fontsUsed(layout)) fonts.set(key, await pdf.embedFont(await opts.loadFont(key), { subset: true }));
  for (const p of layout.pages) {
    const page = pdf.addPage([layout.width, layout.height]);
    for (const it of [...p.items].sort((a, b) => ORDER[a.kind] - ORDER[b.kind])) drawItem(pdf, page, it, fonts, layout.height);
  }
  return pdf.save({ useObjectStreams: false });
}

/** Browser font loader: the same files the preview's @font-face uses. */
export const fetchFont: FontLoader = async (key) => new Uint8Array(await (await fetch(`/fonts/resume/${key}.ttf`)).arrayBuffer());
