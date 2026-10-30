/**
 * WonderWorks Therapists: practitioners' listings in the platform's module-keyed `listings` table (module =
 * 'therapists'), apart from every other module's rows. The one cross-tenant read here is open listings, which are public.
 *
 * Practitioner side: a practitioner lists from a hiring workspace (the same workspaces and roles as Hiring). Every
 * function takes the caller's session, checks their role in that workspace on the server (`requirePermission` →
 * `domain/org/permissions.ts::can`), then filters by org_id and module. A listing holds no client data and no clinical data.
 */
import type { Session } from "../auth";
import { HiringError, requirePermission } from "../hiring";
import { listings, newId, now, openListings, type ListingRow } from "../modules/responses";
import { cleanTherapistPosting, readTerms, THERAPISTS, type TherapistPosting, type TherapistPostingInput } from "@/modules/therapists/domain";

export const toPosting = (r: ListingRow): TherapistPosting => ({ id: r.id, orgId: r.org_id, title: r.title, description: r.description, location: r.location, workMode: r.work_mode, terms: readTerms(r.attrs), status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });

/** Every open practitioner listing, with its workspace (public postings). */
export const openTherapistPosts = (limit = 300) => openListings(THERAPISTS, toPosting, limit);

/** The workspace's listings (jobs.view). */
export async function orgTherapists(s: Session, orgId: string): Promise<TherapistPosting[]> {
  await requirePermission(s, orgId, "jobs.view");
  return (await listings().find({ org_id: orgId, module: THERAPISTS }, { order: "updated_at", desc: true, limit: 200 })).map(toPosting);
}

/** List yourself (a draft until opened), or edit a listing (jobs.edit). */
export async function saveTherapist(s: Session, orgId: string, input: TherapistPostingInput, postingId?: string): Promise<TherapistPosting> {
  await requirePermission(s, orgId, "jobs.edit");
  const c = cleanTherapistPosting(input);
  if ("problem" in c) throw new HiringError(c.problem);
  const at = now();
  const fields = { title: c.value.title, description: c.value.description, location: c.value.location, work_mode: c.value.workMode, skills: [...(c.value.terms.focus ?? [])], attrs: { ...c.value.terms }, updated_at: at };
  if (postingId) {
    const n = await listings().update({ id: postingId, org_id: orgId, module: THERAPISTS }, fields);
    if (!n) throw new HiringError("That listing isn't in this workspace.", 404);
    return toPosting((await listings().one({ id: postingId, org_id: orgId, module: THERAPISTS }))!);
  }
  const row: ListingRow = { id: newId("lst"), module: THERAPISTS, org_id: orgId, ...fields, status: "draft", created_by: s.tenantId, created_at: at };
  await listings().insert(row);
  return toPosting(row);
}

/** Open, close or return a listing to draft (jobs.edit). */
export async function setTherapistStatus(s: Session, orgId: string, postingId: string, status: TherapistPosting["status"]): Promise<void> {
  await requirePermission(s, orgId, "jobs.edit");
  const n = await listings().update({ id: postingId, org_id: orgId, module: THERAPISTS }, { status, updated_at: now() });
  if (!n) throw new HiringError("That listing isn't in this workspace.", 404);
}
