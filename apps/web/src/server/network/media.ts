/**
 * Photos on network posts (owner, 2026-11-21: "add option to add images and video here"): JPEG, PNG or WebP, up to four
 * a post. Each is checked and stripped of its metadata (where it was taken, the camera) by the shared photo handling,
 * encrypted like listing photos, and read back only through `/api/network/media/<id>` by someone who may see its post.
 *
 * A photo is uploaded while the member writes, before the post exists ("not yet posted", seen only by them), and is
 * attached when they press Post. Photos never attached go after a day.
 */
import { newId } from "@/lib/ids";
import type { Session } from "../auth";
import { HiringError } from "../hiring";
import { cleanPhoto } from "../modules/photo";
import { encryptFile } from "../resume/files";
import { media, member, now } from "./network";

export const MAX_POST_PHOTOS = 4;
export const MEDIA_ID = /^nm_[A-Za-z0-9_-]{6,40}$/;
const UPLOADS_A_DAY = 60;
export const mediaKey = (tenant: string) => `network-media:${tenant}`;
const dayAgo = () => new Date(Date.now() - 864e5).toISOString();

/** Keep one photo the member chose for a post they are writing. */
export async function uploadMedia(s: Session, bytes: Buffer, claimed?: string): Promise<{ id: string }> {
  await member(s);
  const recent = await media().find({ tenant_id: s.tenantId }, { order: "created_at", desc: true, limit: UPLOADS_A_DAY });
  // Photos chosen and never posted go after a day.
  for (const m of recent) if (!m.update_id && m.created_at < dayAgo()) await media().remove({ id: m.id, tenant_id: s.tenantId });
  if (recent.filter((m) => m.created_at > dayAgo()).length >= UPLOADS_A_DAY) throw new HiringError("You've added a lot of photos today. Try again tomorrow.", 429);
  const c = cleanPhoto(bytes, claimed);
  if ("problem" in c) throw new HiringError(c.problem);
  const id = newId("nm");
  await media().insert({ id, tenant_id: s.tenantId, update_id: null, position: 0, mime: c.mime, ciphertext: encryptFile(mediaKey(s.tenantId), id, c.bytes), created_at: now() });
  return { id };
}

/** Take back a photo the member chose but hasn't posted. */
export async function discardMedia(s: Session, id: string): Promise<void> {
  if (!MEDIA_ID.test(id)) return;
  const m = await media().one({ id, tenant_id: s.tenantId });
  if (m && !m.update_id) await media().remove({ id, tenant_id: s.tenantId });
}

/** The photos a post may carry: the member's own, not yet posted; anything else is refused. */
export async function claimMedia(tenant: string, ids: string[]): Promise<string[]> {
  const want = [...new Set(ids)];
  if (want.length > MAX_POST_PHOTOS) throw new HiringError(`A post can have up to ${MAX_POST_PHOTOS} photos.`, 400);
  if (!want.length) return [];
  const rows = want.every((i) => MEDIA_ID.test(i)) ? await media().findIn("id", want, { tenant_id: tenant }) : [];
  if (rows.length !== want.length || rows.some((r) => r.update_id)) throw new HiringError("Those photos can't go with this post. Add them again.", 400);
  return want;
}

/** Attach the claimed photos to the post that now exists, in the order chosen. */
export async function attachMedia(tenant: string, updateId: string, ids: string[]): Promise<void> {
  for (const [position, id] of ids.entries()) await media().update({ id, tenant_id: tenant }, { update_id: updateId, position });
}
