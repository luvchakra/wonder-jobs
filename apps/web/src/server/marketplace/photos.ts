/**
 * Listing photos: JPEG, PNG or WebP up to 5 MB, at most 8 a listing. Metadata (EXIF, GPS, camera and software tags, text
 * chunks) is stripped before anything is stored, so a photo never leaks where it was taken. Files are encrypted per listing
 * like résumé files (server/resume/files.ts) and read back only through the listing's own route, never by a public URL.
 *
 * Tenant isolation: only the listing's seller adds, orders or removes photos (seller_tenant filter). Anyone signed in may read
 * a photo of an open, unhidden listing; anyone else gets the seller's own draft only if they are the seller.
 */
import { HiringError } from "../hiring";
import { decryptFile, encryptFile } from "../resume/files";
import type { Session } from "../auth";
import { newId } from "@/lib/ids";
import { MAX_PHOTOS, MAX_PHOTO_BYTES, PHOTO_TYPES, readTerms } from "@/modules/marketplace/domain";
import { listings, now, photos } from "./store";

type PhotoType = (typeof PHOTO_TYPES)[number];

/** The file's real type from its first bytes, never from the name or the browser's claim. */
export function sniff(b: Buffer): PhotoType | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function stripJpeg(b: Buffer): Buffer {
  const out: Buffer[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) {
      out.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = b.readUInt16BE(i + 2);
    const seg = b.subarray(i, i + 2 + len);
    // APP1..APP15 (EXIF, XMP, ICC extras) and COM go; APP0 (JFIF) and the picture's own segments stay.
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) out.push(seg);
    i += 2 + len;
  }
  out.push(b.subarray(i));
  return Buffer.concat(out);
}

const KEEP_PNG = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "sRGB", "cHRM", "sBIT", "bKGD", "pHYs", "acTL", "fcTL", "fdAT"]);
function stripPng(b: Buffer): Buffer {
  const out: Buffer[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i);
    const type = b.toString("latin1", i + 4, i + 8);
    const end = i + 12 + len;
    if (KEEP_PNG.has(type)) out.push(b.subarray(i, end));
    i = end;
  }
  return Buffer.concat(out);
}

function stripWebp(b: Buffer): Buffer {
  const out: Buffer[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const tag = b.toString("latin1", i, i + 4);
    const len = b.readUInt32LE(i + 4);
    const end = i + 8 + len + (len % 2);
    if (tag !== "EXIF" && tag !== "XMP ") out.push(b.subarray(i, Math.min(end, b.length)));
    i = end;
  }
  const body = Buffer.concat(out);
  const head = Buffer.from("RIFF\0\0\0\0WEBP", "latin1");
  head.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([head, body]);
}

/** The file with its metadata removed, or a plain reason it can't be used. */
export function cleanPhoto(bytes: Buffer, claimed?: string): { mime: PhotoType; bytes: Buffer } | { problem: string } {
  if (bytes.length === 0) return { problem: "That file is empty." };
  if (bytes.length > MAX_PHOTO_BYTES) return { problem: "Photos can be up to 5 MB each." };
  const mime = sniff(bytes);
  if (!mime || (claimed && !PHOTO_TYPES.includes(claimed as PhotoType))) return { problem: "Use a JPEG, PNG or WebP photo." };
  try {
    return { mime, bytes: mime === "image/jpeg" ? stripJpeg(bytes) : mime === "image/png" ? stripPng(bytes) : stripWebp(bytes) };
  } catch {
    return { problem: "That photo couldn't be read. Try another." };
  }
}

const key = (listingId: string) => `marketplace:${listingId}`;

/** Add a photo to the caller's own listing (the next position, up to eight). */
export async function addPhoto(s: Session, listingId: string, bytes: Buffer, claimed?: string): Promise<{ id: string }> {
  const l = await listings().one({ id: listingId, seller_tenant: s.tenantId });
  if (!l) throw new HiringError("That listing isn't yours.", 404);
  const have = await photos().find({ listing_id: listingId, seller_tenant: s.tenantId });
  if (have.length >= MAX_PHOTOS) throw new HiringError(`A listing can have up to ${MAX_PHOTOS} photos.`, 409);
  const c = cleanPhoto(bytes, claimed);
  if ("problem" in c) throw new HiringError(c.problem);
  const id = newId("pho");
  await photos().insert({ id, listing_id: listingId, seller_tenant: s.tenantId, position: have.length, mime: c.mime, ciphertext: encryptFile(key(listingId), id, c.bytes), created_at: now() });
  const terms = readTerms(l.attrs);
  await listings().update({ id: listingId, seller_tenant: s.tenantId }, { attrs: { ...l.attrs, photos: [...terms.photos, id] }, updated_at: now() });
  return { id };
}

/** Remove one of the caller's own photos. */
export async function removePhoto(s: Session, listingId: string, photoId: string): Promise<void> {
  const l = await listings().one({ id: listingId, seller_tenant: s.tenantId });
  if (!l) throw new HiringError("That listing isn't yours.", 404);
  await photos().remove({ id: photoId, listing_id: listingId, seller_tenant: s.tenantId });
  await listings().update({ id: listingId, seller_tenant: s.tenantId }, { attrs: { ...l.attrs, photos: readTerms(l.attrs).photos.filter((p) => p !== photoId) }, updated_at: now() });
}

/** A photo's bytes, for the listing's own route: the seller always, anyone signed in only while the listing is open. */
export async function readPhoto(s: Session, listingId: string, photoId: string): Promise<{ mime: string; bytes: Buffer } | null> {
  const l = await listings().one({ id: listingId });
  if (!l || (l.state !== "open" && l.seller_tenant !== s.tenantId)) return null;
  const p = await photos().one({ id: photoId, listing_id: listingId });
  return p ? { mime: p.mime, bytes: decryptFile(key(listingId), p.id, p.ciphertext) } : null;
}
