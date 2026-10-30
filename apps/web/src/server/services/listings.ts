/**
 * WonderWorks Talent & Services: pros' listings in the platform's module-keyed `listings` table (module = 'services'),
 * apart from every other module's rows. The one cross-tenant read here is open listings, which are public.
 */
import { openListings, type ListingRow } from "../modules/responses";
import { readTerms, SERVICES, type ServicePosting } from "@/modules/services/domain";

export const toPosting = (r: ListingRow): ServicePosting => ({ id: r.id, orgId: r.org_id, title: r.title, description: r.description, location: r.location, workMode: r.work_mode, terms: readTerms(r.attrs), status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });

/** Every open service listing, with its pro (public postings). */
export const openServicePosts = (limit = 300) => openListings(SERVICES, toPosting, limit);
