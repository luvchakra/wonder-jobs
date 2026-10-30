/**
 * WonderWorks Teaching: schools' openings in the platform's module-keyed `listings` table (module = 'teaching'), apart
 * from Jobs' employer_jobs and Internships' rows. The one cross-tenant read here is open openings, which are public.
 */
import { table } from "../db/table";
import { readTerms, TEACHING, type TeachingPosting } from "@/modules/teaching/domain";

type ListingRow = { id: string; module: string; org_id: string; title: string; description: string; location: string; work_mode: TeachingPosting["workMode"]; attrs: Record<string, unknown>; status: TeachingPosting["status"]; created_at: string; updated_at: string };
type OrgRow = { id: string; name: string; verified?: boolean };

const listings = () => table<ListingRow>("listings");
const orgs = () => table<OrgRow>("hiring_orgs");

export const toPosting = (r: ListingRow): TeachingPosting => ({ id: r.id, orgId: r.org_id, title: r.title, description: r.description, location: r.location, workMode: r.work_mode, terms: readTerms(r.attrs), status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });

/** Every open teaching opening, with its school (public postings). */
export async function openTeachingPosts(limit = 300): Promise<{ posting: TeachingPosting; org: { id: string; name: string; verified: boolean } }[]> {
  const rows = (await listings().find({ module: TEACHING, status: "open" }, { order: "updated_at", desc: true, limit })).map(toPosting);
  const byOrg = new Map((await orgs().findIn("id", [...new Set(rows.map((p) => p.orgId))])).map((o) => [o.id, o]));
  return rows.flatMap((posting) => {
    const o = byOrg.get(posting.orgId);
    return o ? [{ posting, org: { id: o.id, name: o.name, verified: !!o.verified } }] : [];
  });
}
