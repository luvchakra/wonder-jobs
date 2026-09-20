import { describe, expect, it } from "vitest";
import { crc32, writeZip } from "./zip";
import { extractDocxText, readZipEntries, readZipEntry } from "@/server/resume/extractText";

describe("crc32", () => {
  it("reproduces the standard IEEE 802.3 check value for the reference test string", () => {
    // The canonical CRC-32 test vector for this polynomial: crc32("123456789") == 0xCBF43926.
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("is the identity value for empty input", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("writeZip — round-trips through this repo's own DOCX/ZIP reader", () => {
  it("produces a ZIP the app's reader can list and extract byte-for-byte", () => {
    const files = [
      { name: "[Content_Types].xml", data: new TextEncoder().encode("<Types/>") },
      { name: "word/document.xml", data: new TextEncoder().encode("<w:document><w:body><w:p><w:r><w:t>Hello, résumé</w:t></w:r></w:p></w:body></w:document>") },
    ];
    const zip = Buffer.from(writeZip(files));
    const entries = readZipEntries(zip);
    expect(entries.map((e) => e.name)).toEqual(["[Content_Types].xml", "word/document.xml"]);
    for (const [i, entry] of entries.entries()) {
      expect(readZipEntry(zip, entry).toString("utf8")).toBe(new TextDecoder().decode(files[i].data));
    }
  });

  it("survives the full DOCX text-extraction path, including a non-ASCII character", () => {
    const documentXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Kunal Chakraborty — résumé</w:t></w:r></w:p></w:body></w:document>`;
    const zip = Buffer.from(writeZip([{ name: "word/document.xml", data: new TextEncoder().encode(documentXml) }]));
    expect(extractDocxText(zip)).toContain("Kunal Chakraborty — résumé");
  });

  it("produces a well-formed ZIP for zero entries", () => {
    expect(() => readZipEntries(Buffer.from(writeZip([])))).not.toThrow();
    expect(readZipEntries(Buffer.from(writeZip([])))).toEqual([]);
  });
});
