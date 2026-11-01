import type { Session } from "@/server/auth";
import { searchCofounders } from "@/server/cofounders/search";
import { searchEvents } from "@/server/events/search";
import { searchInternships } from "@/server/internships/search";
import { searchMarketplace } from "@/server/marketplace/search";
import { searchScholarships } from "@/server/scholarships/search";
import { searchServices } from "@/server/services/search";
import { searchTeaching } from "@/server/teaching/search";
import { searchTherapists } from "@/server/therapists/search";

type Input = { query: string; places: string[] };
type Search = (tenantId: string, input: Input) => Promise<{ results: { id: string }[] }>;
const as = (tenantId: string): Session => ({ userId: tenantId, tenantId });

/** Each module's own Find search, as its search route runs it — the same sources, the same rules, never Jobs'. */
export const MODULE_SEARCHES: Record<string, Search> = {
  internships: (_t, b) => searchInternships(b),
  teaching: (_t, b) => searchTeaching(b),
  services: (_t, b) => searchServices(b),
  therapists: (_t, b) => searchTherapists(b),
  events: (_t, b) => searchEvents(b),
  scholarships: (_t, b) => searchScholarships(b),
  cofounders: (t, b) => searchCofounders(as(t), b),
  marketplace: (t, b) => searchMarketplace(as(t), b),
};
