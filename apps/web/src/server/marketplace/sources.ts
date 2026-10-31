/**
 * Buy, Sell & Rent's own WorksLake sources: a separate dataset (module = 'marketplace'), so none of these ever answers a Jobs,
 * Internships, Teaching, Services, Therapists, Events or Co-founders search and none of theirs ever answers this one
 * (server/jobslake/registry.ts::listSources).
 *
 * One real source: items people list on WonderWorks. No outside classifieds site (OLX, Facebook Marketplace and others)
 * offers an open search API WorksLake may use, and it never scrapes against a site's terms, so none is listed.
 */
import type { Job } from "@/domain/jobs/types";
import { PROTOCOL_VERSION } from "@/domain/jobslake/protocol";
import { finish, type SearchCriteria } from "@/server/jobs/providers";
import type { RawPosting } from "@/services/jobs/normalize";
import { DEFAULT_LIMITS, type SourceRecord } from "@/server/jobslake/types";
import { siteUrl } from "@/lib/siteUrl";

const EPOCH = "2026-10-31T00:00:00.000Z";

export const WONDERWORKS_MARKETPLACE = "mkt_wonderworks";

export const MARKETPLACE_SOURCES: SourceRecord[] = [
  {
    protocolVersion: PROTOCOL_VERSION,
    id: WONDERWORKS_MARKETPLACE,
    name: "WonderWorks listings",
    provider: "WonderWorks",
    category: "portal",
    geography: ["global"],
    description: "Pre-used items people list for sale on WonderWorks, with photos, price, condition and area.",
    status: "active",
    roleFamilies: [],
    config: { kind: "builtin" },
    limits: DEFAULT_LIMITS,
    builtin: true,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    accessStrategy: "official_api",
    capabilities: ["Search", "Freshness"],
    jobTypes: [],
    module: "marketplace",
  },
];

/** WonderWorks' own table: it needs no credential. */
export const marketplaceSourceAvailable = (s: SourceRecord) => MARKETPLACE_SOURCES.some((x) => x.id === s.id);

/** Fetch one Marketplace source (open listings only; the seller's name stays out of the text). */
export async function runMarketplaceSource(s: SourceRecord, c: SearchCriteria): Promise<{ jobs: Job[]; warnings: string[] }> {
  if (s.id !== WONDERWORKS_MARKETPLACE) throw new Error("No connector");
  const { openMarketListings } = await import("./listings");
  const { readTerms } = await import("@/modules/marketplace/domain");
  const raws: RawPosting[] = (await openMarketListings(null)).map((r) => ({
    externalId: r.id,
    title: r.title,
    company: "WonderWorks",
    location: r.area,
    remote: false,
    description: r.description,
    tags: [readTerms(r.attrs).category, readTerms(r.attrs).condition],
    postedAt: r.updated_at,
    applyUrl: new URL(`/app/m/marketplace?listing=${r.id}`, siteUrl().origin).toString(),
    employerSite: true,
    applyPath: "platform" as const,
  }));
  return { jobs: finish(WONDERWORKS_MARKETPLACE, raws, c), warnings: [] };
}
