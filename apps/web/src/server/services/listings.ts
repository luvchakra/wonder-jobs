/**
 * WonderWorks Talent & Services: pros' listings in the platform's module-keyed `listings` table (module = 'services'),
 * apart from every other module's rows. The one cross-tenant read here is open listings, which are public.
 *
 * Pro side: a pro posts from a hiring workspace (the same workspaces and roles as Hiring). Every function takes the
 * caller's session, checks their role in that workspace on the server (`requirePermission` →
 * `domain/org/permissions.ts::can`), then filters by org_id and module.
 */
import type { Session } from "../auth";
import { HiringError, requirePermission } from "../hiring";
import { listings, newId, now, openListings, type ListingRow } from "../modules/responses";
import { cleanServicePosting, readTerms, SERVICES, type ServicePosting, type ServicePostingInput } from "@/modules/services/domain";

/** Whether the member who posted the listing chose to show their network profile on it (stored beside its terms; off unless set). */
export const showsNetworkProfile = (r: Pick<ListingRow, "attrs">) => r.attrs?.networkProfile === true;

/** The posting as the poster sees it: with their own network choice. Anyone else gets the public posting only. */
const forViewer = (s: Session, r: ListingRow): ServicePosting => (r.created_by === s.tenantId ? { ...toPosting(r), poster: true, showNetworkProfile: showsNetworkProfile(r) } : toPosting(r));

export const toPosting = (r: ListingRow): ServicePosting => ({ id: r.id, orgId: r.org_id, title: r.title, description: r.description, location: r.location, workMode: r.work_mode, terms: readTerms(r.attrs), status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });

/** Every open service listing, with its pro (public postings). */
export const openServicePosts = (limit = 300) => openListings(SERVICES, toPosting, limit);

/** The workspace's service listings (jobs.view). */
export async function orgServices(s: Session, orgId: string): Promise<ServicePosting[]> {
  await requirePermission(s, orgId, "jobs.view");
  return (await listings().find({ org_id: orgId, module: SERVICES }, { order: "updated_at", desc: true, limit: 200 })).map((r) => forViewer(s, r));
}

/** Post a listing (a draft until opened), or edit one (jobs.edit). */
export async function saveService(s: Session, orgId: string, input: ServicePostingInput, postingId?: string): Promise<ServicePosting> {
  await requirePermission(s, orgId, "jobs.edit");
  const c = cleanServicePosting(input);
  if ("problem" in c) throw new HiringError(c.problem);
  const at = now();
  const base = { title: c.value.title, description: c.value.description, location: c.value.location, work_mode: c.value.workMode, skills: [c.value.terms.category!, ...(c.value.terms.skills ?? [])], updated_at: at };
  const attrsWith = (network: boolean) => ({ ...c.value.terms, ...(network ? { networkProfile: true } : {}) });
  if (postingId) {
    const existing = await listings().one({ id: postingId, org_id: orgId, module: SERVICES });
    if (!existing) throw new HiringError("That listing isn't in this workspace.", 404);
    // The network choice is the poster's alone: any other member's edit keeps what the poster chose.
    const network = existing.created_by === s.tenantId ? input.showNetworkProfile === true : showsNetworkProfile(existing);
    await listings().update({ id: postingId, org_id: orgId, module: SERVICES }, { ...base, attrs: attrsWith(network) });
    return forViewer(s, (await listings().one({ id: postingId, org_id: orgId, module: SERVICES }))!);
  }
  const row: ListingRow = { id: newId("lst"), module: SERVICES, org_id: orgId, ...base, attrs: attrsWith(input.showNetworkProfile === true), status: "draft", created_by: s.tenantId, created_at: at };
  await listings().insert(row);
  return forViewer(s, row);
}

/** Open, close or return a listing to draft (jobs.edit). */
export async function setServiceStatus(s: Session, orgId: string, postingId: string, status: ServicePosting["status"]): Promise<void> {
  await requirePermission(s, orgId, "jobs.edit");
  const n = await listings().update({ id: postingId, org_id: orgId, module: SERVICES }, { status, updated_at: now() });
  if (!n) throw new HiringError("That listing isn't in this workspace.", 404);
}
