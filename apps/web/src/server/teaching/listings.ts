/**
 * WonderWorks Teaching: schools' openings in the platform's module-keyed `listings` table (module = 'teaching'), apart
 * from Jobs' employer_jobs and Internships' rows. The one cross-tenant read here is open openings, which are public.
 */
import { openListings, type ListingRow } from "../modules/responses";
import { readTerms, TEACHING, type TeachingPosting } from "@/modules/teaching/domain";

export const toPosting = (r: ListingRow): TeachingPosting => ({ id: r.id, orgId: r.org_id, title: r.title, description: r.description, location: r.location, workMode: r.work_mode, terms: readTerms(r.attrs), status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });

/** Every open teaching opening, with its school (public postings). */
export const openTeachingPosts = (limit = 300) => openListings(TEACHING, toPosting, limit);
