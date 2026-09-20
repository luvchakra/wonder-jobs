import { describe, expect, it } from "vitest";
import { deflateRawSync, deflateSync } from "node:zlib";
import { detectFormat, extractDocxText, extractPdfText, extractResumeText, looksReadable, UnsupportedResumeError } from "./extractText";

const PROSE = [
  "Priya Raman",
  "Senior Product Manager",
  "Bengaluru, India",
  "Eight years building payments products for consumers and small businesses.",
  "Led the roadmap for a wallet used by four million people, working with design and engineering every week.",
  "Ran experiments on onboarding and checkout, and rebuilt the analytics the team trusted.",
].join("\n");

/** A one-page PDF with a single Flate-compressed content stream — what a word processor exports. */
function makePdf(lines: string[], { compress = true, hex = false } = {}): Buffer {
  const draw = lines.map((l) => (hex ? `<${Buffer.from(l, "latin1").toString("hex")}> Tj T*` : `(${l.replace(/([()\\])/g, "\\$1")}) Tj T*`)).join("\n");
  const content = `BT /F1 12 Tf 14 TL 72 720 Td\n${draw}\nET`;
  const body = compress ? deflateSync(Buffer.from(content, "latin1")) : Buffer.from(content, "latin1");
  const head = Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${body.length}${compress ? " /Filter /FlateDecode" : ""} >>\nstream\n`, "latin1");
  return Buffer.concat([head, body, Buffer.from("\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF", "latin1")]);
}

/** A minimal DOCX: a ZIP holding word/document.xml, built by hand so the test owns every byte. */
function makeDocx(paragraphs: string[], { store = false } = {}): Buffer {
  const xml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`;
  const raw = Buffer.from(xml, "utf8");
  const data = store ? raw : deflateRawSync(raw);
  const name = Buffer.from("word/document.xml", "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(store ? 0 : 8, 8);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt16LE(name.length, 26);
  const fileRecord = Buffer.concat([local, name, data]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(store ? 0 : 8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42); // local header offset
  const centralRecord = Buffer.concat([central, name]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralRecord.length, 12);
  eocd.writeUInt32LE(fileRecord.length, 16);
  return Buffer.concat([fileRecord, centralRecord, eocd]);
}

describe("detectFormat", () => {
  it("reads the file's own bytes before trusting its name", () => {
    expect(detectFormat(makePdf(["hello"]), "resume.docx")).toBe("pdf");
    expect(detectFormat(makeDocx(["hello"]), "resume.pdf")).toBe("docx");
    expect(detectFormat(Buffer.from("plain text"), "resume.txt")).toBe("text");
  });

  it("says plainly that .doc can't be read", () => {
    expect(() => detectFormat(Buffer.from("anything"), "resume.doc")).toThrow(UnsupportedResumeError);
  });
});

/**
 * What most real-world PDFs actually look like: a word processor, design tool or "Print to PDF"
 * embeds a subsetted font and assigns each glyph an arbitrary internal code, unrelated to its real
 * character — recorded only in the font's own `/ToUnicode` CMap, in a separate stream object.
 */
function makeCidPdf(lines: string[], { compress = true } = {}): Buffer {
  const chars = [...new Set(lines.join("\n").split(""))];
  const codeOf = new Map(chars.map((c, i) => [c, i + 10])); // codes bear no relation to the real character
  const hex4 = (n: number) => n.toString(16).padStart(4, "0");
  const draw = lines.map((l) => `<${[...l].map((c) => hex4(codeOf.get(c)!)).join("")}> Tj T*`).join("\n");
  const content = `BT /F1 12 Tf 14 TL 72 720 Td\n${draw}\nET`;
  const contentBody = compress ? deflateSync(Buffer.from(content, "latin1")) : Buffer.from(content, "latin1");
  const contentObj = Buffer.concat([
    Buffer.from(`1 0 obj\n<< /Length ${contentBody.length}${compress ? " /Filter /FlateDecode" : ""} >>\nstream\n`, "latin1"),
    contentBody,
    Buffer.from("\nendstream\nendobj\n", "latin1"),
  ]);

  const bfchar = chars.map((c) => `<${hex4(codeOf.get(c)!)}> <${hex4(c.charCodeAt(0))}>`).join("\n");
  const cmapText = `/CIDInit /ProcSet findresource begin\n1 beginbfchar\n${bfchar}\nendbfchar\nend`;
  const cmapBody = compress ? deflateSync(Buffer.from(cmapText, "latin1")) : Buffer.from(cmapText, "latin1");
  const cmapObj = Buffer.concat([
    Buffer.from(`2 0 obj\n<< /Length ${cmapBody.length}${compress ? " /Filter /FlateDecode" : ""} >>\nstream\n`, "latin1"),
    cmapBody,
    Buffer.from("\nendstream\nendobj\n", "latin1"),
  ]);

  return Buffer.concat([Buffer.from("%PDF-1.4\n", "latin1"), contentObj, cmapObj, Buffer.from("trailer\n<< /Root 1 0 R >>\n%%EOF", "latin1")]);
}

describe("extractPdfText — subsetted fonts with a ToUnicode CMap (the common real-world case)", () => {
  it("reads text drawn in arbitrary glyph codes via the font's ToUnicode CMap", () => {
    const text = extractPdfText(makeCidPdf(PROSE.split("\n")));
    expect(text).toContain("Priya Raman");
    expect(text).toContain("Senior Product Manager");
    // The glyph codes themselves must never leak into the output.
    expect(text).not.toMatch(/[\u0000-\u0009]/);
  });

  it("reads it uncompressed too", () => {
    expect(extractPdfText(makeCidPdf(["Priya Raman"], { compress: false }))).toContain("Priya Raman");
  });

  it("is reported as readable end to end, not misdiagnosed as a scan", () => {
    const long = [PROSE, PROSE].join("\n");
    expect(extractResumeText(makeCidPdf(long.split("\n")), "resume.pdf")).toMatchObject({ format: "pdf", readable: true });
  });

  it("leaves an unrelated plain hex string (no matching glyph code, even hex length) to the ordinary heuristic", () => {
    // A CMap exists in the file (for one font) but a second, uncoded font's hex string has no entry in
    // it, and its length happens to be a multiple of 4 too — the zero-hits fallback must still apply.
    const plainHex = Buffer.from("Product Manager", "latin1").toString("hex"); // 16 chars -> 32 hex digits
    const plainHexContent = Buffer.from(`BT /F2 12 Tf 14 TL 72 600 Td\n<${plainHex}> Tj T*\nET`, "latin1");
    const plainHexObj = Buffer.concat([Buffer.from(`3 0 obj\n<< /Length ${plainHexContent.length} >>\nstream\n`, "latin1"), plainHexContent, Buffer.from("\nendstream\nendobj\n", "latin1")]);
    const withUnrelatedHex = Buffer.concat([makeCidPdf(["Priya Raman"]), plainHexObj]);
    expect(extractPdfText(withUnrelatedHex)).toContain("Product Manager");
  });
});

describe("extractPdfText", () => {
  it("reads a compressed content stream", () => {
    const text = extractPdfText(makePdf(PROSE.split("\n")));
    expect(text).toContain("Priya Raman");
    expect(text).toContain("Senior Product Manager");
  });

  it("reads an uncompressed one", () => {
    expect(extractPdfText(makePdf(["Priya Raman"], { compress: false }))).toContain("Priya Raman");
  });

  it("reads hex strings", () => {
    expect(extractPdfText(makePdf(["Senior Product Manager"], { hex: true }))).toContain("Senior Product Manager");
  });

  it("unescapes parentheses and octal codes", () => {
    const text = extractPdfText(makePdf(["Product (Payments) \\251 lead"]));
    expect(text).toContain("Product (Payments)");
  });

  it("skips a stream it can't decode rather than giving up on the file", () => {
    const good = makePdf(["Priya Raman"]);
    const broken = Buffer.from("1 0 obj\n<< /Filter /FlateDecode >>\nstream\nnot-actually-deflate\nendstream\n", "latin1");
    expect(extractPdfText(Buffer.concat([good, broken, good]))).toContain("Priya Raman");
  });

  it("reads every stream in a multi-stream PDF, not just the first — 'endstream' contains 'stream' as a substring, which previously made scanning re-match inside it and lose every later stream", () => {
    const first = makePdf(["Priya Raman"]);
    const second = Buffer.from(
      makePdf(["Senior Product Manager"])
        .toString("latin1")
        .replace("%PDF-1.4\n", ""),
      "latin1",
    );
    const text = extractPdfText(Buffer.concat([first, second]));
    expect(text).toContain("Priya Raman");
    expect(text).toContain("Senior Product Manager");
  });

  it("skips the embedded font program and any image — their binary bytes can coincidentally match a text token and pollute otherwise-clean output enough to fail the readability check", () => {
    // Real generators (Chromium, LibreOffice, Word) always embed the font they used; its stream dict
    // always carries /Length1 (the PDF spec's marker for a font program) and its bytes are arbitrary
    // binary that can accidentally look like parenthesized PDF strings to the token scanner.
    const fontBytes = Buffer.from(Array.from({ length: 400 }, (_, i) => (i * 37) % 256));
    const fontObj = Buffer.concat([Buffer.from(`3 0 obj\n<< /Length1 900 /Length ${fontBytes.length} >>\nstream\n`, "latin1"), fontBytes, Buffer.from("\nendstream\nendobj\n", "latin1")]);
    const imageBytes = Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 53) % 256));
    const imageObj = Buffer.concat([Buffer.from(`4 0 obj\n<< /Type /XObject /Subtype /Image /Length ${imageBytes.length} >>\nstream\n`, "latin1"), imageBytes, Buffer.from("\nendstream\nendobj\n", "latin1")]);
    const text = extractPdfText(Buffer.concat([makePdf(PROSE.split("\n")), fontObj, imageObj]));
    expect(text.trim()).toBe(PROSE);
    expect(looksReadable(text)).toBe(true);
  });
});

describe("extractDocxText", () => {
  it("reads paragraphs as lines", () => {
    const text = extractDocxText(makeDocx(["Priya Raman", "Senior Product Manager"]));
    expect(text.split("\n")).toEqual(["Priya Raman", "Senior Product Manager"]);
  });

  it("reads a stored (uncompressed) entry", () => {
    expect(extractDocxText(makeDocx(["Priya Raman"], { store: true }))).toBe("Priya Raman");
  });

  it("decodes XML entities without mangling them", () => {
    expect(extractDocxText(makeDocx(["Risk & Compliance", "A <b> tag"]))).toBe("Risk & Compliance\nA <b> tag");
  });

  it("rejects a ZIP that isn't a Word document", () => {
    const zip = makeDocx(["x"]);
    // Rename the only entry so word/document.xml is missing.
    const broken = Buffer.from(zip.toString("latin1").replaceAll("word/document.xml", "word/documentAxml"), "latin1");
    expect(() => extractDocxText(broken)).toThrow(UnsupportedResumeError);
  });
});

describe("looksReadable", () => {
  it("accepts prose and rejects font soup", () => {
    expect(looksReadable(PROSE + "\n" + PROSE)).toBe(true);
    expect(looksReadable("  ###".repeat(40))).toBe(false);
    expect(looksReadable("short")).toBe(false);
  });
});

describe("extractResumeText", () => {
  it("reports the format and whether the text is usable", () => {
    const long = [PROSE, PROSE].join("\n");
    expect(extractResumeText(Buffer.from(long), "resume.txt")).toMatchObject({ format: "text", readable: true });
    expect(extractResumeText(makePdf(long.split("\n")), "resume.pdf")).toMatchObject({ format: "pdf", readable: true });
    // A scanned PDF has no text stream at all — that's the case the caller must not fill a profile from.
    expect(extractResumeText(Buffer.from("%PDF-1.4\n%%EOF"), "scan.pdf").readable).toBe(false);
  });
});
