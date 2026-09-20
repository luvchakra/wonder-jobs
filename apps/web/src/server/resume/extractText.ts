/**
 * Getting plain text out of a resume file, without a parsing dependency.
 *
 * A resume arrives as PDF, DOCX or plain text, and all three are readable with what Node already has:
 * a DOCX is a ZIP of XML, and a text-based PDF is a handful of zlib streams full of text-drawing
 * operators, plus (for most PDFs from word processors, design tools and browsers) a `/ToUnicode` CMap
 * per subsetted font that this reads too — see the note above `extractPdfText`. This is not an attempt
 * at a general document parser — a scanned PDF is an image and has no text to find at all. So extraction
 * reports whether what it found reads like prose, and the caller offers "paste it instead" when it
 * doesn't, rather than quietly filling someone's Career DNA with rubbish.
 */
import { inflateRawSync, inflateSync } from "node:zlib";

export type ResumeFormat = "text" | "pdf" | "docx";

export interface ExtractedText {
  text: string;
  format: ResumeFormat;
  /** False when what came back doesn't look like prose — ask for pasted text instead. */
  readable: boolean;
}

export class UnsupportedResumeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedResumeError";
  }
}

const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_CENTRAL_HEADER = 0x02014b50;
const ZIP_EOCD = 0x06054b50;

export function detectFormat(bytes: Buffer, filename?: string): ResumeFormat {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (bytes.length > 4 && bytes.readUInt32LE(0) === ZIP_LOCAL_HEADER) return "docx";
  const ext = filename?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "doc") throw new UnsupportedResumeError("Old .doc files can't be read. Save it as PDF or DOCX, or paste the text instead.");
  return "text";
}

export function extractResumeText(bytes: Buffer, filename?: string): ExtractedText {
  const format = detectFormat(bytes, filename);
  const text = format === "pdf" ? extractPdfText(bytes) : format === "docx" ? extractDocxText(bytes) : tidy(bytes.toString("utf8"));
  return { text, format, readable: looksReadable(text) };
}

/** Enough letters, enough words of ordinary shape — the cheap test for "this is prose, not font soup". */
export function looksReadable(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 120) return false;
  const letters = (trimmed.match(/[a-zA-Z]/g) ?? []).length;
  if (letters / trimmed.length < 0.5) return false;
  const words = trimmed.split(/\s+/);
  const ordinary = words.filter((w) => /^[A-Za-z][A-Za-z'’.-]{1,20}$/.test(w)).length;
  return words.length >= 40 && ordinary / words.length >= 0.45;
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/ {2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------------------------------------------ DOCX */

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  offset: number;
}

/** Reads the ZIP central directory — the only reliable way to find where an entry's data starts. Exported for `lib/zip.ts`'s writer to round-trip test against. */
export function readZipEntries(buf: Buffer): ZipEntry[] {
  // The end-of-central-directory record is last, after an optional comment of up to 64 KiB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) {
    if (buf.readUInt32LE(i) === ZIP_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new UnsupportedResumeError("That file isn't a readable DOCX. Save it again, or paste the text instead.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== ZIP_CENTRAL_HEADER) break;
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    entries.push({
      name: buf.subarray(p + 46, p + 46 + nameLen).toString("utf8"),
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      offset: buf.readUInt32LE(p + 42),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function readZipEntry(buf: Buffer, entry: ZipEntry): Buffer {
  if (buf.readUInt32LE(entry.offset) !== ZIP_LOCAL_HEADER) throw new UnsupportedResumeError("That DOCX looks damaged. Save it again, or paste the text instead.");
  const nameLen = buf.readUInt16LE(entry.offset + 26);
  const extraLen = buf.readUInt16LE(entry.offset + 28);
  const start = entry.offset + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRawSync(data);
  throw new UnsupportedResumeError("That DOCX uses a compression Wonder can't read. Save it as PDF, or paste the text instead.");
}

const XML_ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'" };

export function extractDocxText(buf: Buffer): string {
  const entries = readZipEntries(buf);
  const doc = entries.find((e) => e.name === "word/document.xml");
  if (!doc) throw new UnsupportedResumeError("That ZIP isn't a Word document. Upload a PDF or DOCX, or paste the text instead.");
  const xml = readZipEntry(buf, doc).toString("utf8");
  return tidy(
    xml
      .replace(/<w:tab\b[^>]*\/>/g, "\t")
      .replace(/<w:br\b[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      // `&amp;` last, so `&amp;lt;` doesn't turn into a tag-looking `<`.
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&(lt|gt|quot|apos);/g, (_, e: string) => XML_ENTITIES[e])
      .replace(/&amp;/g, "&"),
  );
}

/* ------------------------------------------------------------------- PDF */

/**
 * Most PDFs from word processors, design tools and browsers ("Print to PDF") embed a subsetted font
 * and give each glyph an arbitrary internal code — not its Unicode value. The font's own `/ToUnicode`
 * CMap is the only place the real character is recorded; without reading it, glyph codes come back as
 * unprintable control characters or the wrong letters entirely, `looksReadable` correctly calls that
 * unreadable, and a perfectly normal text PDF gets misreported as a scan. `CMap` decodes glyph code →
 * real character; it is built once from every ToUnicode stream in the file (a resume rarely has more
 * than a couple of embedded fonts, so codes never collide across them in practice) and threaded through
 * both string forms a content stream can use.
 */
type CMap = Map<number, string>;

function hexToUnicode(hex: string): string {
  let out = "";
  for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return out;
}

function parseToUnicodeCMap(text: string, cmap: CMap) {
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, src, dst] of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) cmap.set(parseInt(src, 16), hexToUnicode(dst));
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, srcLo, srcHi, dst] of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(\[[^\]]*\]|<[0-9A-Fa-f]+>)/g)) {
      const lo = parseInt(srcLo, 16);
      const hi = parseInt(srcHi, 16);
      if (dst.startsWith("[")) {
        const items = [...dst.matchAll(/<([0-9A-Fa-f]+)>/g)].map(([, h]) => h);
        for (let code = lo, i = 0; code <= hi && i < items.length; code++, i++) cmap.set(code, hexToUnicode(items[i]));
      } else {
        const base = parseInt(dst.slice(1, -1), 16);
        for (let code = lo; code <= hi; code++) cmap.set(code, String.fromCodePoint(base + (code - lo)));
      }
    }
  }
}

/** Is this decompressed stream a ToUnicode CMap, not page content? Content streams never contain these markers. */
function isCMapStream(text: string): boolean {
  return /beginbfchar|beginbfrange/.test(text);
}

/** Inflate every stream that carries one; ToUnicode streams build the glyph map, the rest draw text. */
export function extractPdfText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  const bodies: string[] = [];
  const re = /stream\r?\n?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const dictStart = raw.lastIndexOf("<<", m.index);
    const dict = dictStart >= 0 ? raw.slice(dictStart, m.index) : "";
    const end = raw.indexOf("endstream", m.index);
    if (end < 0) break;
    const start = m.index + m[0].length;
    // Past "endstream" entirely, not at its start — "endstream" itself contains the substring
    // "stream", so leaving lastIndex there re-matches it as a bogus next stream and corrupts every
    // stream after the first. Any PDF with more than one stream object (virtually all of them: a
    // second content stream, an embedded font, a ToUnicode CMap) hit this before it was fixed.
    re.lastIndex = end + "endstream".length;
    // The embedded font program itself (its dict always carries /Length1, per the PDF spec — a
    // content or CMap stream never does) and raster images are binary, not drawing operators; their
    // bytes can still coincidentally match the Tj/TJ token pattern below and inject garbage into
    // otherwise perfectly good extracted text. A real generated resume always has at least one of
    // these (Chromium/LibreOffice/Word all embed the font they used), so skip both up front.
    if (/\/Length1\b/.test(dict) || /\/Subtype\s*\/Image\b/.test(dict)) continue;
    try {
      const slice = buf.subarray(start, end);
      const body = /\/FlateDecode/.test(dict) ? inflate(slice) : slice;
      bodies.push(body.toString("latin1"));
    } catch {
      // an encrypted stream, or a filter we don't read — skip it, keep the rest
    }
  }
  const cmap: CMap = new Map();
  for (const body of bodies) if (isCMapStream(body)) parseToUnicodeCMap(body, cmap);
  const parts: string[] = [];
  for (const body of bodies) {
    if (isCMapStream(body)) continue;
    // Only content streams draw text; anything else has no Tj/TJ and contributes nothing.
    const text = readContentStream(body, cmap);
    if (text.trim()) parts.push(text);
  }
  return tidy(parts.join("\n"));
}

function inflate(slice: Buffer): Buffer {
  try {
    return inflateSync(slice);
  } catch {
    return inflateRawSync(slice);
  }
}

/**
 * Pull the strings out of a page's drawing operators. `Td`/`TD` move text anywhere from one glyph
 * over to a whole new paragraph — the same two operators do both jobs, and without tracking the
 * actual transform stack there is no reliable way to tell which from the operator alone. Real
 * generators split two ways instead: some (a browser's own PDF export) put one visual line in each
 * `BT…ET` text object; others (many résumé/ATS builders, which position every word — sometimes every
 * glyph — for exact kerning) put a fresh `BT…ET` around each *word*, and instead re-issue a `cm`
 * coordinate transform once per visual line. `T*` is the one operator the spec defines as an
 * unconditional new line, so that's still a hard break; a `cm` — a real paragraph boundary in the
 * second style, and otherwise just brackets vector art that contributes no text — is treated the
 * same way, since it's never observed to fire mid-word. Anything else that starts a new `BT` gets a
 * plain space, not a break, so word-per-object generators don't run every word together.
 */
function readContentStream(content: string, cmap: CMap): string {
  let out = "";
  let pending: string[] = [];
  const re = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|\bTJ\b|\bTj\b|T\*|\bBT\b|(?:-?\d*\.?\d+\s+){5}-?\d*\.?\d+\s+cm\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const tok = m[0];
    if (tok.startsWith("(")) pending.push(decodePdfString(tok.slice(1, -1), cmap));
    else if (tok.startsWith("<")) pending.push(decodeHexString(tok.slice(1, -1), cmap));
    else if (tok === "Tj" || tok === "TJ") {
      out += pending.join("");
      pending = [];
    } else if (tok === "BT") {
      pending = [];
      if (out && !/\s$/.test(out)) out += " ";
    } else {
      // T* or a coordinate transform: a real line/paragraph boundary.
      pending = [];
      out = out.replace(/ +$/, "");
      if (out && !out.endsWith("\n")) out += "\n";
    }
  }
  out += pending.join("");
  return out;
}

const ESCAPES: Record<string, string> = { n: "\n", r: "\n", t: "\t", b: "", f: "", "(": "(", ")": ")", "\\": "\\" };

function decodePdfString(s: string, cmap: CMap): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "\\") {
      out += cmap.get(s.charCodeAt(i)) ?? s[i];
      continue;
    }
    const next = s[++i];
    if (next === undefined) break;
    if (next >= "0" && next <= "7") {
      let oct = next;
      while (oct.length < 3 && s[i + 1] >= "0" && s[i + 1] <= "7") oct += s[++i];
      const code = parseInt(oct, 8);
      out += cmap.get(code) ?? String.fromCharCode(code);
    } else if (next !== "\n") {
      // A backslash before a newline is a line continuation, not a character.
      out += ESCAPES[next] ?? next;
    }
  }
  return out;
}

function decodeHexString(s: string, cmap: CMap): string {
  const hex = s.replace(/\s+/g, "");
  // A subsetted font's own encoding is almost always Identity-H (2-byte glyph codes) once it has a
  // ToUnicode CMap at all — the "starts with a 00 byte" shortcut below only holds for glyph codes under
  // 256, so it can't be trusted here. Try 2-byte codes against the map first and keep that reading as
  // soon as any code actually resolves; a hex string from an unrelated (uncoded) font falls through.
  if (cmap.size > 0 && hex.length >= 4 && hex.length % 4 === 0) {
    let out = "";
    let hits = 0;
    for (let i = 0; i + 4 <= hex.length; i += 4) {
      const code = parseInt(hex.slice(i, i + 4), 16);
      const mapped = cmap.get(code);
      if (mapped !== undefined) {
        out += mapped;
        hits++;
      } else if (code > 0) out += String.fromCharCode(code);
    }
    if (hits > 0) return out;
  }
  // Two-byte codes are usually UTF-16BE from a subsetted font; one-byte codes are Latin-1.
  const wide = hex.length >= 8 && hex.length % 4 === 0 && hex.startsWith("00");
  const step = wide ? 4 : 2;
  let out = "";
  for (let i = 0; i + step <= hex.length; i += step) {
    const code = parseInt(hex.slice(i, i + step), 16);
    if (Number.isFinite(code) && code > 0) out += cmap.get(code) ?? String.fromCharCode(code);
  }
  return out;
}
