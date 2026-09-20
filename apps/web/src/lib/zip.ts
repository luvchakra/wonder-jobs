/**
 * Writes a minimal, valid ZIP archive — the container format both DOCX and
 * XLSX use — with no compression (STORED) so this has zero dependencies and
 * runs identically in the browser (downloads) and in Node (tests): no
 * `node:zlib`, nothing bundler-specific. Entries are small text/XML files,
 * so the size cost of skipping DEFLATE is negligible. Mirrors the layout
 * `server/resume/extractText.ts`'s DOCX reader already parses (local file
 * header, central directory, end-of-central-directory record), so a file
 * this writes round-trips through that reader — see `zip.test.ts`.
 */

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const STORED = 0;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** Standard CRC-32 (IEEE 802.3 / zlib / PNG / ZIP polynomial) — every ZIP entry carries one regardless of compression method. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntryInput {
  name: string;
  data: Uint8Array;
}

class ByteWriter {
  private chunks: Uint8Array[] = [];
  length = 0;
  push(bytes: Uint8Array) {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }
  u16(n: number) {
    this.push(new Uint8Array([n & 0xff, (n >>> 8) & 0xff]));
  }
  u32(n: number) {
    this.push(new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]));
  }
  build(): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }
}

/** Builds a ZIP with one uncompressed (STORED) entry per input, all dated to a fixed, arbitrary DOS timestamp — these are generated fresh each download, so a real mtime has no value. */
export function writeZip(entries: ZipEntryInput[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const DOS_TIME = 0;
  const DOS_DATE = 0x21; // 1980-01-01, the ZIP epoch's earliest representable date

  const w = new ByteWriter();
  const centralOffsets: number[] = [];

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    centralOffsets.push(w.length);
    w.u32(LOCAL_FILE_HEADER);
    w.u16(20); // version needed to extract
    w.u16(0); // general purpose flag
    w.u16(STORED);
    w.u16(DOS_TIME);
    w.u16(DOS_DATE);
    w.u32(crc);
    w.u32(entry.data.length); // compressed size == uncompressed, STORED
    w.u32(entry.data.length);
    w.u16(nameBytes.length);
    w.u16(0); // extra field length
    w.push(nameBytes);
    w.push(entry.data);
  }

  const centralStart = w.length;
  entries.forEach((entry, i) => {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    w.u32(CENTRAL_FILE_HEADER);
    w.u16(20); // version made by
    w.u16(20); // version needed to extract
    w.u16(0); // general purpose flag
    w.u16(STORED);
    w.u16(DOS_TIME);
    w.u16(DOS_DATE);
    w.u32(crc);
    w.u32(entry.data.length);
    w.u32(entry.data.length);
    w.u16(nameBytes.length);
    w.u16(0); // extra field length
    w.u16(0); // comment length
    w.u16(0); // disk number start
    w.u16(0); // internal file attributes
    w.u32(0); // external file attributes
    w.u32(centralOffsets[i]);
    w.push(nameBytes);
  });
  const centralSize = w.length - centralStart;

  w.u32(END_OF_CENTRAL_DIRECTORY);
  w.u16(0); // this disk number
  w.u16(0); // disk with the start of the central directory
  w.u16(entries.length); // entries on this disk
  w.u16(entries.length); // entries total
  w.u32(centralSize);
  w.u32(centralStart);
  w.u16(0); // comment length

  return w.build();
}
