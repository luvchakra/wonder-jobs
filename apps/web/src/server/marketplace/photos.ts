/**
 * Listing photos: JPEG, PNG or WebP up to 5 MB, at most 8 a listing. Metadata (EXIF, GPS, camera and software tags, text
 * chunks) is stripped before anything is stored, so a photo never leaks where it was taken. Files are encrypted per listing
 * like résumé files (server/resume/files.ts) and read back only through the listing's own route, never by a public URL.
 *
 * Tenant isolation: only the listing's seller adds, orders or removes photos (seller_tenant filter). Anyone signed in may read
 * a photo of an open, unhidden listing; after it is sold or taken down only the seller and buyers with a conversation on it may.
 */
import { HiringError } from "../hiring";
import { decryptFile, encryptFile } from "../resume/files";
import type { Session } from "../auth";
import { newId } from "@/lib/ids";
import { MAX_PHOTOS, readTerms } from "@/modules/marketplace/domain";
import { cleanPhoto, sniff } from "../modules/photo";
import { listings, now, photos, threads } from "./store";

export { cleanPhoto, sniff };

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
  if (!l) return null;
  // Open listings are public to anyone signed in; otherwise only the seller, and a buyer who has a conversation on it.
  if (l.state !== "open" && l.seller_tenant !== s.tenantId && !(await threads().one({ listing_id: listingId, buyer_tenant: s.tenantId }))) return null;
  const p = await photos().one({ id: photoId, listing_id: listingId });
  return p ? { mime: p.mime, bytes: decryptFile(key(listingId), p.id, p.ciphertext) } : null;
}
