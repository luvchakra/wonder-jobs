/**
 * An event's cover photo: one a listing, JPEG, PNG or WebP up to 5 MB, cleaned by the shared server/modules/photo.ts (type read
 * from the bytes, metadata stripped), then encrypted per event like résumé files (server/resume/files.ts). The listing's attrs
 * keep only a version number (`cover`), so searches read no image data and a new photo gets a new address.
 *
 * Organiser side: setting or removing a cover needs `jobs.edit` in the owning workspace (`requirePermission`), filtered by
 * org_id and module. Reading: anyone signed in while the event is open; otherwise only that workspace's members and people
 * holding an RSVP to it (their own responder_tenant).
 */
import type { Session } from "../auth";
import { table } from "../db/table";
import { HiringError, membershipOf, requirePermission } from "../hiring";
import { decryptFile, encryptFile } from "../resume/files";
import { listings, now, responses as allResponses } from "../modules/responses";
import { cleanPhoto } from "../modules/photo";
import { COVER_MAX_BYTES, EVENTS, type RsvpStatus } from "@/modules/events/domain";

type CoverRow = { listing_id: string; org_id: string; mime: string; ciphertext: string; updated_at: string };
const covers = () => table<CoverRow>("event_covers");
const key = (listingId: string) => `events:${listingId}`;

/** Set (or replace) the event's cover; returns the new version the listing now carries. */
export async function setCover(s: Session, orgId: string, listingId: string, bytes: Buffer, claimed?: string): Promise<{ cover: number }> {
  await requirePermission(s, orgId, "jobs.edit");
  const l = await listings().one({ id: listingId, org_id: orgId, module: EVENTS });
  if (!l) throw new HiringError("That event isn't in this workspace.", 404);
  const c = cleanPhoto(bytes, claimed, COVER_MAX_BYTES);
  if ("problem" in c) throw new HiringError(c.problem);
  // Strictly newer than the version it replaces, so a browser that cached the old photo asks again.
  const cover = Math.max(Date.now(), (typeof l.attrs.cover === "number" ? l.attrs.cover : 0) + 1);
  await covers().upsert({ listing_id: listingId, org_id: orgId, mime: c.mime, ciphertext: encryptFile(key(listingId), listingId, c.bytes), updated_at: now() }, ["listing_id"]);
  await listings().update({ id: listingId, org_id: orgId, module: EVENTS }, { attrs: { ...l.attrs, cover }, updated_at: now() });
  return { cover };
}

/** Take the cover off the event. */
export async function removeCover(s: Session, orgId: string, listingId: string): Promise<void> {
  await requirePermission(s, orgId, "jobs.edit");
  const l = await listings().one({ id: listingId, org_id: orgId, module: EVENTS });
  if (!l) throw new HiringError("That event isn't in this workspace.", 404);
  await covers().remove({ listing_id: listingId, org_id: orgId });
  const { cover: _gone, ...attrs } = l.attrs;
  void _gone;
  await listings().update({ id: listingId, org_id: orgId, module: EVENTS }, { attrs, updated_at: now() });
}

/** The cover's bytes, for its own route: anyone signed in while the event is open, else the workspace's members or an attendee. */
export async function readCover(s: Session, listingId: string): Promise<{ mime: string; bytes: Buffer } | null> {
  const l = await listings().one({ id: listingId, module: EVENTS });
  if (!l) return null;
  if (l.status !== "open" && !(await membershipOf(s, l.org_id)) && !(await allResponses<RsvpStatus, unknown>().one({ listing_id: listingId, responder_tenant: s.tenantId, module: EVENTS }))) return null;
  const c = await covers().one({ listing_id: listingId, org_id: l.org_id });
  return c ? { mime: c.mime, bytes: decryptFile(key(listingId), listingId, c.ciphertext) } : null;
}
