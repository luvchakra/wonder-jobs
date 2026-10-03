/**
 * How a résumé *file* is built, as an applicant-tracking system would meet it — the things the text
 * alone can't show: page count, whether text sits in columns, images, fonts whose characters can't be
 * mapped back to text, Word tables, text boxes and page headers. Read from the file's own structure
 * with the same no-dependency approach as `extractText`; every value is something found in the file.
 */
import { inflate, MAX_INFLATED_TOTAL_BYTES, readZipEntries, readZipEntry, type ResumeFormat } from "./extractText";

export interface FileSignals {
  format: ResumeFormat;
  /** Null when the file doesn't say (plain text, or a DOCX without app properties). */
  pageCount: number | null;
  /** Photos, logos, icons drawn as images. */
  imageCount: number;
  /** PDF: text laid out in side-by-side columns (or a grid), detected from where lines start on the page. Null when it can't be told. */
  multiColumn: boolean | null;
  /** PDF: fonts with no map from glyphs back to characters — their text reads as gibberish. */
  fontsWithoutUnicode: number;
  /** Web addresses the file links to (PDF link annotations, Word hyperlinks) — not necessarily visible text. */
  links: string[];
  docx?: { tables: number; textBoxes: number; columns: number; headerFooterText: string };
}

export function fileSignals(bytes: Buffer, format: ResumeFormat): FileSignals {
  if (format === "pdf") return pdfSignals(bytes);
  if (format === "docx") return docxSignals(bytes);
  return { format, pageCount: null, imageCount: 0, multiColumn: null, fontsWithoutUnicode: 0, links: [] };
}

/* ------------------------------------------------------------------- DOCX */

function xmlText(xml: string): string {
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function docxSignals(bytes: Buffer): FileSignals {
  const entries = readZipEntries(bytes);
  const read = (name: string) => {
    const e = entries.find((x) => x.name === name);
    return e ? readZipEntry(bytes, e).toString("utf8") : "";
  };
  const doc = read("word/document.xml");
  const headerFooterText = entries
    .filter((e) => /^word\/(header|footer)\d*\.xml$/.test(e.name))
    .map((e) => xmlText(readZipEntry(bytes, e).toString("utf8")))
    .filter(Boolean)
    .join("\n");
  const pages = read("docProps/app.xml").match(/<Pages>(\d+)<\/Pages>/);
  const cols = [...doc.matchAll(/<w:cols\b[^>]*w:num="(\d+)"/g)].map((m) => Number(m[1]));
  const links = [...read("word/_rels/document.xml.rels").matchAll(/Target="(https?:[^"]+)"[^>]*TargetMode="External"|TargetMode="External"[^>]*Target="(https?:[^"]+)"/g)].map((m) => (m[1] ?? m[2]).replace(/&amp;/g, "&"));
  return {
    format: "docx",
    pageCount: pages ? Number(pages[1]) : null,
    imageCount: entries.filter((e) => /^word\/media\//.test(e.name)).length,
    multiColumn: cols.some((n) => n > 1),
    fontsWithoutUnicode: 0,
    links: [...new Set(links)].slice(0, 30),
    docx: {
      tables: (doc.match(/<w:tbl>/g) ?? []).length,
      textBoxes: (doc.match(/<w:txbxContent\b/g) ?? []).length,
      columns: Math.max(1, ...cols),
      headerFooterText: headerFooterText.slice(0, 2000),
    },
  };
}

/* -------------------------------------------------------------------- PDF */

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
/** a × b, PDF row-vector convention: a point goes through `a` first, then `b`. */
const mul = (a: Matrix, b: Matrix): Matrix => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];

interface LineStart {
  x: number;
  y: number;
  chars: number;
}

/**
 * Where each line of text starts, in page coordinates: follows the graphics state (`q`/`Q`/`cm`) and the
 * text state (`BT`, `Tm`, `Td`, `TD`, `T*`, `TL`), and records the position of the first string drawn
 * after each move. Text widths aren't known without font metrics, so a run that continues a line
 * without moving isn't counted.
 */
export function lineStarts(content: string): LineStart[] {
  const out: LineStart[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  let lm: Matrix = IDENTITY;
  let tm: Matrix = IDENTITY;
  let leading = 0;
  let moved = true;
  const nums: number[] = [];
  const tok = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|\[[^\]]*\]|-?\d*\.?\d+(?:[eE]-?\d+)?|[A-Za-z'"*]+|\/[^\s/<>[\]()]+|<<|>>/g;
  let m: RegExpExecArray | null;
  let lastString = 0;
  while ((m = tok.exec(content))) {
    const t = m[0];
    if (/^-?\d*\.?\d+/.test(t)) {
      nums.push(Number(t));
      continue;
    }
    if (t.startsWith("(") || t.startsWith("<") || t.startsWith("[")) {
      lastString = t.startsWith("[") ? (t.match(/\((?:\\.|[^\\()])*\)/g) ?? []).join("").length : t.startsWith("<") ? Math.max(0, t.length - 2) / 4 : t.length - 2;
      nums.length = 0;
      continue;
    }
    if (t.startsWith("/") || t === "<<" || t === ">>") continue;
    const n = nums.splice(0);
    switch (t) {
      case "q":
        stack.push(ctm);
        break;
      case "Q":
        ctm = stack.pop() ?? IDENTITY;
        break;
      case "cm":
        if (n.length >= 6) ctm = mul(n.slice(-6) as Matrix, ctm);
        break;
      case "BT":
        lm = tm = IDENTITY;
        moved = true;
        break;
      case "Tm":
        if (n.length >= 6) {
          lm = tm = n.slice(-6) as Matrix;
          moved = true;
        }
        break;
      case "TL":
        if (n.length) leading = n[n.length - 1];
        break;
      case "TD":
        if (n.length >= 2) leading = -n[n.length - 1];
      // falls through
      case "Td":
        if (n.length >= 2) {
          lm = tm = mul([1, 0, 0, 1, n[n.length - 2], n[n.length - 1]], lm);
          moved = true;
        }
        break;
      case "T*":
      case "'":
      case '"':
        lm = tm = mul([1, 0, 0, 1, 0, -leading], lm);
        moved = true;
        if (t === "T*") break;
      // falls through
      case "Tj":
      case "TJ":
        if (moved && lastString > 0) {
          const p = mul(tm, ctm);
          out.push({ x: p[4], y: p[5], chars: lastString });
          moved = false;
        }
        break;
    }
  }
  return out;
}

/**
 * Side-by-side columns: many lines starting at the same point well inside the page (not at the left
 * margin), carrying real sentences. A right-aligned date or a centred heading starts somewhere
 * different every time, and a grid of short skill names isn't prose, so neither counts.
 */
export function looksMultiColumn(starts: LineStart[], pageWidth: number): boolean {
  const inner = starts.filter((s) => s.x > pageWidth * 0.28 && s.x < pageWidth * 0.72);
  const clusters = new Map<number, LineStart[]>();
  for (const s of inner) {
    const key = [...clusters.keys()].find((k) => Math.abs(k - s.x) <= 3) ?? Math.round(s.x);
    clusters.set(key, [...(clusters.get(key) ?? []), s]);
  }
  for (const group of clusters.values()) {
    const rows = new Set(group.map((s) => Math.round(s.y / 2)));
    const prose = group.filter((s) => s.chars >= 25).length;
    if (rows.size >= 8 && prose >= 5) return true;
  }
  return false;
}

function pdfSignals(bytes: Buffer): FileSignals {
  const raw = bytes.toString("latin1");
  const bodies: string[] = [];
  const contents: string[] = [];
  let total = 0;
  const fontPrograms = new Set([...raw.matchAll(/\/FontFile[23]?\s+(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1])));
  const re = /stream\r?\n?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const end = raw.indexOf("endstream", m.index);
    if (end < 0) break;
    re.lastIndex = end + "endstream".length;
    const dictStart = raw.lastIndexOf("<<", m.index);
    const dict = dictStart >= 0 ? raw.slice(dictStart, m.index) : "";
    if (/\/Subtype\s*\/Image\b|\/Length1\b|\/Subtype\s*\/(OpenType|Type1C|CIDFontType0C)\b/.test(dict)) continue;
    const objHere = dictStart >= 0 ? raw.slice(Math.max(0, dictStart - 40), dictStart).match(/(\d+)\s+\d+\s+obj\s*$/) : null;
    if (objHere && fontPrograms.has(Number(objHere[1]))) continue;
    try {
      const slice = bytes.subarray(m.index + m[0].length, end);
      const body = /\/FlateDecode/.test(dict) ? inflate(slice) : slice;
      total += body.length;
      if (total > MAX_INFLATED_TOTAL_BYTES) break;
      const text = body.toString("latin1");
      if (/\/Type\s*\/ObjStm\b/.test(dict)) bodies.push(text);
      else if (/\bBT\b/.test(text) && /\b(Tj|TJ)\b/.test(text)) contents.push(text);
    } catch {
      // a filter we don't read: skip that stream
    }
  }
  // Objects can live inside compressed object streams (PDF 1.5+), so look there too.
  const objects = [raw, ...bodies].join("\n");
  const counts = [...objects.matchAll(/\/Type\s*\/Pages\b[^]*?\/Count\s+(\d+)/g)].map((x) => Number(x[1]));
  const pageObjects = (objects.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
  const pageCount = counts.length ? Math.max(...counts) : pageObjects || null;
  const box = objects.match(/\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/);
  const pageWidth = box ? Math.abs(Number(box[3]) - Number(box[1])) || 612 : 612;
  const fontDicts = [...objects.matchAll(/<<(?:(?!<<|>>)[^])*\/Subtype\s*\/Type0\b(?:(?!<<|>>)[^])*>>/g)].map((x) => x[0]);
  return {
    format: "pdf",
    pageCount,
    imageCount: (objects.match(/\/Subtype\s*\/Image\b/g) ?? []).length,
    multiColumn: contents.length ? contents.some((c) => looksMultiColumn(lineStarts(c), pageWidth)) : null,
    fontsWithoutUnicode: fontDicts.filter((d) => !/\/ToUnicode\b/.test(d)).length,
    links: [...new Set([...objects.matchAll(/\/URI\s*\(((?:\\.|[^\\)])*)\)/g)].map((x) => x[1].replace(/\\(.)/g, "$1")).filter((u) => /^https?:/i.test(u)))].slice(0, 30),
  };
}
