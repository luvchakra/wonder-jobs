/**
 * Zips `extension/` into `apps/web/public/wonderjobs-extension.zip`, which is
 * what the site's /extension page hands to people who want to install it.
 *
 * Deliberately dependency-free and self-contained: a ZIP with STORED (no
 * compression) entries needs nothing but a CRC-32, and this repo has no zip
 * dependency to reach for. Same format `apps/web/src/lib/zip.ts` writes for
 * .docx downloads — kept separate because that one ships to the browser and
 * this one is a build tool.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "extension");
const target = join(root, "apps/web/public/wonderjobs-extension.zip");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function u16(n) {
  return Buffer.from([n & 0xff, (n >>> 8) & 0xff]);
}
function u32(n) {
  return Buffer.from([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
}

const files = walk(source)
  .map((full) => ({ name: relative(source, full).split("\\").join("/"), data: readFileSync(full) }))
  .sort((a, b) => a.name.localeCompare(b.name));

const local = [];
const central = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(file.name, "utf8");
  const crc = crc32(file.data);
  const header = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0x21), u32(crc), u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), name]);
  local.push(header, file.data);
  central.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0x21), u32(crc), u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
  offset += header.length + file.data.length;
}
const centralBuf = Buffer.concat(central);
const zip = Buffer.concat([...local, centralBuf, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralBuf.length), u32(offset), u16(0)]);

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, zip);
console.log(`packed ${files.length} files → ${relative(root, target)} (${zip.length} bytes, sha256 ${createHash("sha256").update(zip).digest("hex").slice(0, 16)}…)`);
