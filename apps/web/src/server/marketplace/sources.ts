/**
 * Buy, Sell & Rent's own WorksLake sources: a separate dataset (module = 'marketplace'), so none of these ever answers a Jobs,
 * Internships, Teaching, Services, Therapists, Events or Co-founders search and none of theirs ever answers this one
 * (server/jobslake/registry.ts::listSources).
 *
 * One built-in source of items people list on WonderWorks, and two keyed outside APIs (Flipkart's Affiliate API for India,
 * eBay's Browse API abroad), each "Needs setup" until its keys are set on Admin → Keys. No outside classifieds site (OLX,
 * Facebook Marketplace and others) offers an open search API WorksLake may use, and it never scrapes against a site's
 * terms, so none is listed. The Indian shops' own product lists come through the data gateway (apps/data-gateway/sources).
 */
import type { Job } from "@/domain/jobs/types";
import { PROTOCOL_VERSION } from "@/domain/jobslake/protocol";
import { finish, type SearchCriteria } from "@/server/jobs/providers";
import type { RawPosting } from "@/services/jobs/normalize";
import { DEFAULT_LIMITS, type SourceRecord } from "@/server/jobslake/types";
import { siteUrl } from "@/lib/siteUrl";
import { EBAY, ebayAvailable, ebaySearch } from "./ebay";
import { FLIPKART, flipkartAvailable, flipkartSearch } from "./flipkart";

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
    description: "Handicrafts and pre-loved items people list for sale on WonderWorks, with photos, price, condition and area.",
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
  {
    protocolVersion: PROTOCOL_VERSION,
    id: FLIPKART,
    name: "Flipkart",
    provider: "Flipkart",
    category: "aggregator",
    geography: ["IN"],
    description: "New items on flipkart.com from Flipkart's Affiliate API, with the price, photo and link Flipkart gives, up to 10 items a search. Needs a free affiliate tracking ID and API token.",
    status: "active",
    statusReason: "terms pending: Flipkart's affiliate API terms (no use in a similar or competitive platform; no use of its name without written consent; 20 calls a second); confirm they allow this",
    roleFamilies: [],
    config: { kind: "builtin" },
    // One call per search (Flipkart's limit is 20 a second).
    limits: { ...DEFAULT_LIMITS, timeoutMs: 10_000, maxResults: 10, refreshMinutes: 60 },
    secretRef: "env:FLIPKART",
    builtin: true,
    createdAt: "2026-11-05T00:00:00.000Z",
    updatedAt: "2026-11-05T00:00:00.000Z",
    accessStrategy: "official_api",
    capabilities: ["Search", "Apply URL"],
    jobTypes: [],
    module: "marketplace",
  },
  {
    protocolVersion: PROTOCOL_VERSION,
    id: EBAY,
    name: "eBay",
    provider: "eBay",
    category: "aggregator",
    geography: ["US", "GB", "AU", "CA", "DE", "FR", "IT", "ES"],
    description: "Fixed-price items on eBay from its Browse API (US, UK, Australia, Canada, Germany, France, Italy, Spain), with the price in its own currency, condition, photo and link eBay gives. Needs a free eBay developer keyset.",
    status: "active",
    statusReason: "terms pending: the eBay API License Agreement, and EPN attribution if its links should earn commission; confirm what the licence allows (caching, display)",
    roleFamilies: [],
    config: { kind: "builtin" },
    // One call per marketplace per search, of the 5,000 a day the free keyset allows.
    limits: { ...DEFAULT_LIMITS, timeoutMs: 10_000, maxResults: 100, refreshMinutes: 60 },
    secretRef: "env:EBAY",
    builtin: true,
    createdAt: "2026-11-05T00:00:00.000Z",
    updatedAt: "2026-11-05T00:00:00.000Z",
    accessStrategy: "official_api",
    capabilities: ["Search", "Freshness", "Apply URL"],
    jobTypes: [],
    module: "marketplace",
  },
];

/** WonderWorks' own table needs no credential; Flipkart and eBay need their keys. */
export const marketplaceSourceAvailable = (s: SourceRecord) => (s.id === FLIPKART ? flipkartAvailable() : s.id === EBAY ? ebayAvailable() : MARKETPLACE_SOURCES.some((x) => x.id === s.id));

/** Fetch one Marketplace source (open listings only; the seller's name stays out of the text). */
export async function runMarketplaceSource(s: SourceRecord, c: SearchCriteria, needsSetup: (m: string) => Error = (m) => new Error(m)): Promise<{ jobs: Job[]; warnings: string[] }> {
  if (s.id === FLIPKART) return { jobs: await flipkartSearch(s, c, needsSetup), warnings: [] };
  if (s.id === EBAY) return { jobs: await ebaySearch(s, c, needsSetup), warnings: [] };
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
