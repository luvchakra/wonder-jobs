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
