import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { checkResumeFile, MAX_RESUME_FILE_BYTES, RESUME_MIME, safeResumeFilename } from "./fileValidation";
import { decryptFile, encryptFile, MemoryResumeFileStore, resumeFileStore, setResumeFileStoreForTests } from "./files";

function pdf(body = "BT (Priya Raman) Tj ET", extra = ""): Buffer {
  return Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Length ${body.length} >>\nstream\n${body}\nendstream\nendobj\n${extra}trailer\n<< /Root 1 0 R >>\n%%EOF`, "latin1");
}

/** A PDF 1.5 object stream, Flate-compressed, holding the given objects. */
function pdfWithObjectStream(objects: string): Buffer {
  const data = deflateSync(Buffer.from(objects, "latin1"));
  const head = Buffer.from(`%PDF-1.7\n5 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Length ${data.length} /Filter /FlateDecode >>\nstream\n`, "latin1");
  return Buffer.concat([head, data, Buffer.from("\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF", "latin1")]);
}

/** A stored (uncompressed) ZIP with the given entries, built by hand so the test owns every byte. */
function zip(entries: Record<string, string>): Buffer {
  const records: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [n, content] of Object.entries(entries)) {
    const name = Buffer.from(n, "utf8");
    const data = Buffer.from(content, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const rec = Buffer.concat([local, name, data]);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([c, name]));
    records.push(rec);
    offset += rec.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...records, cd, eocd]);
}

const DOCX = { "[Content_Types].xml": "<Types/>", "word/document.xml": "<w:document><w:body><w:p><w:r><w:t>Priya Raman</w:t></w:r></w:p></w:body></w:document>" };

describe("checkResumeFile", () => {
  it("accepts a plain PDF and a plain .docx, by their bytes", () => {
    expect(checkResumeFile(pdf())).toEqual({ ok: true, mime: RESUME_MIME.pdf, ext: "pdf" });
    expect(checkResumeFile(zip(DOCX))).toEqual({ ok: true, mime: RESUME_MIME.docx, ext: "docx" });
    expect(checkResumeFile(pdfWithObjectStream("1 0 << /Type /Catalog >>"))).toMatchObject({ ok: true });
  });

  it("refuses anything else, whatever it is called", () => {
    expect(checkResumeFile(Buffer.alloc(0))).toMatchObject({ ok: false });
    expect(checkResumeFile(Buffer.from("<html><script>alert(1)</script></html>"))).toMatchObject({ ok: false, reason: expect.stringContaining("PDF or a Word") });
    expect(checkResumeFile(zip({ "xl/workbook.xml": "<x/>", "[Content_Types].xml": "<Types/>" }))).toMatchObject({ ok: false, reason: expect.stringContaining("isn't a Word") });
    expect(checkResumeFile(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]))).toMatchObject({ ok: false });
  });

  it("refuses files over 3 MB", () => {
    const big = Buffer.concat([pdf(), Buffer.alloc(MAX_RESUME_FILE_BYTES)]);
    expect(checkResumeFile(big)).toMatchObject({ ok: false, reason: expect.stringContaining("3 MB") });
  });

  it("refuses PDFs that are encrypted or can run or carry anything", () => {
    expect(checkResumeFile(pdf(undefined, "2 0 obj << /Filter /Standard /V 2 >> endobj\ntrailer << /Encrypt 2 0 R >>\n"))).toMatchObject({ ok: false, reason: expect.stringContaining("password") });
    for (const active of ["/S /JavaScript /JS (app.alert(1))", "/S /Launch /F (calc.exe)", "/EmbeddedFile 3 0 R", "/RichMedia 4 0 R", "/XFA 5 0 R"]) {
      expect(checkResumeFile(pdf(undefined, `2 0 obj << /OpenAction << ${active} >> >> endobj\n`)), active).toMatchObject({ ok: false, reason: expect.stringContaining("scripts") });
    }
  });

  it("finds scripts hidden in a compressed object stream, and refuses streams it can't read", () => {
    expect(checkResumeFile(pdfWithObjectStream("1 0 << /S /JavaScript /JS (app.alert(1)) >>"))).toMatchObject({ ok: false, reason: expect.stringContaining("scripts") });
    const unreadable = Buffer.from("%PDF-1.7\n5 0 obj\n<< /Type /ObjStm /Filter /LZWDecode /Length 4 >>\nstream\nxxxx\nendstream\nendobj\n%%EOF", "latin1");
    expect(checkResumeFile(unreadable)).toMatchObject({ ok: false, reason: expect.stringContaining("couldn't be checked") });
    const damaged = Buffer.from("%PDF-1.7\n5 0 obj\n<< /Type /ObjStm /Filter /FlateDecode /Length 4 >>\nstream\nxxxx\nendstream\nendobj\n%%EOF", "latin1");
    expect(checkResumeFile(damaged)).toMatchObject({ ok: false });
  });

  it("refuses Word files with macros or embedded programs", () => {
    expect(checkResumeFile(zip({ ...DOCX, "word/vbaProject.bin": "x" }))).toMatchObject({ ok: false, reason: expect.stringContaining("macros") });
    expect(checkResumeFile(zip({ ...DOCX, "word/activeX/activeX1.xml": "<x/>" }))).toMatchObject({ ok: false });
    expect(checkResumeFile(zip({ ...DOCX, "word/embeddings/oleObject1.bin": "x" }))).toMatchObject({ ok: false });
  });
});

describe("safeResumeFilename", () => {
  it("keeps a readable name with the extension the bytes have", () => {
    expect(safeResumeFilename("Priya Raman – CV (2026).pdf", "pdf")).toBe("Priya Raman – CV (2026).pdf");
    expect(safeResumeFilename("José Müller.docx", "docx")).toBe("José Müller.docx");
    expect(safeResumeFilename("resume.exe", "pdf")).toBe("resume.pdf");
  });
  it("strips path and markup characters, and never comes back empty", () => {
    expect(safeResumeFilename("../../etc/<passwd>.pdf", "pdf")).not.toMatch(/[/<>]/);
    expect(safeResumeFilename("<<>>.pdf", "pdf")).toBe("Resume.pdf");
    expect(safeResumeFilename(`${"a".repeat(300)}.pdf`, "pdf").length).toBeLessThanOrEqual(104);
  });
});

describe("résumé file encryption", () => {
  const bytes = pdf("BT (Priya Raman, priya@example.com) Tj ET");

  it("round-trips, and the stored form contains none of the plaintext", () => {
    const c = encryptFile("tenant-a", "rf_1", bytes);
    expect(c.startsWith("f1:")).toBe(true);
    expect(c).not.toContain("priya");
    expect(Buffer.from(c.split(":")[3], "base64").toString("latin1")).not.toContain("priya");
    expect(decryptFile("tenant-a", "rf_1", c).equals(bytes)).toBe(true);
  });

  it("is bound to the account and the file id: a copied ciphertext doesn't decrypt elsewhere", () => {
    const c = encryptFile("tenant-a", "rf_1", bytes);
    expect(() => decryptFile("tenant-b", "rf_1", c)).toThrow();
    expect(() => decryptFile("tenant-a", "rf_2", c)).toThrow();
    const [v, iv, tag, data] = c.split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() => decryptFile("tenant-a", "rf_1", [v, iv, tag, flipped.toString("base64")].join(":"))).toThrow();
    expect(() => decryptFile("tenant-a", "rf_1", "not-a-file")).toThrow();
  });

  it("uses a fresh IV every time", () => {
    expect(encryptFile("tenant-a", "rf_1", bytes)).not.toBe(encryptFile("tenant-a", "rf_1", bytes));
  });
});

describe("résumé file store (memory)", () => {
  let store: MemoryResumeFileStore;
  beforeEach(() => {
    store = new MemoryResumeFileStore();
    setResumeFileStoreForTests(store);
  });
  afterEach(() => setResumeFileStoreForTests(undefined));

  it("keeps each account's files to itself", async () => {
    const a = await store.save("tenant-a", { filename: "A.pdf", mime: RESUME_MIME.pdf, bytes: pdf("BT (A) Tj ET") });
    await store.save("tenant-b", { filename: "B.pdf", mime: RESUME_MIME.pdf, bytes: pdf("BT (B) Tj ET") });
    expect(a.id).toMatch(/^rf_[A-Za-z0-9_-]{16}$/);
    expect((await store.list("tenant-a")).map((f) => f.filename)).toEqual(["A.pdf"]);
    expect(await store.read("tenant-b", a.id)).toBeUndefined();
    expect(await store.remove("tenant-b", a.id)).toBe(false);
    expect(await store.read("tenant-a", a.id)).toBeTruthy();
  });

  it("stores ciphertext, returns the exact bytes, and records size and digest", async () => {
    const bytes = pdf("BT (Exact bytes) Tj ET");
    const meta = await store.save("tenant-a", { filename: "Mine.pdf", mime: RESUME_MIME.pdf, bytes });
    expect(store._raw("tenant-a", meta.id)).not.toContain("Exact bytes");
    const back = await store.read("tenant-a", meta.id);
    expect(back?.bytes.equals(bytes)).toBe(true);
    expect(meta).toMatchObject({ filename: "Mine.pdf", mime: RESUME_MIME.pdf, sizeBytes: bytes.length });
    expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("deletes a file, and an account's files on erasure", async () => {
    const m = await store.save("tenant-a", { filename: "A.pdf", mime: RESUME_MIME.pdf, bytes: pdf() });
    expect(await store.remove("tenant-a", m.id)).toBe(true);
    expect(await store.list("tenant-a")).toEqual([]);
    await store.save("tenant-a", { filename: "A.pdf", mime: RESUME_MIME.pdf, bytes: pdf() });
    store.removeTenant("tenant-a");
    expect(await store.list("tenant-a")).toEqual([]);
  });

  it("is what resumeFileStore() returns without Supabase", () => {
    expect(resumeFileStore()).toBe(store);
  });
});
