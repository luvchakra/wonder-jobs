/**
 * The Co-founders module's own WorksLake source: a separate dataset (module = 'cofounders'), so none of it ever answers a
 * Jobs, Internships, Teaching, Talent & Services or Therapists search and none of theirs ever answers a Co-founders one
 * (server/jobslake/registry.ts::listSources).
 *
 * Four sources. WonderWorks founders: the people and teams on WonderWorks who chose to be found. Then three outside ones
 * (owner, 2026-11-05, WJ-612): posts and startups from the data gateway (Hacker News posts, Y Combinator companies), Reddit
 * posts and Product Hunt startups (each needs a key, "Needs setup" until the owner sets it). Outside ones are posts people
 * published for others to read (a title, excerpt, date and public handle, linking back) and companies: never a profile.
 * What goes through WorksLake (and its shared cache) is only public fields; the search then reads each result's current
 * listing again, so a profile that has closed or hidden a field since is never shown from a cached copy.
 */
import type { Job } from "@/domain/jobs/types";
import { PROTOCOL_VERSION } from "@/domain/jobslake/protocol";
import { finish, type SearchCriteria } from "@/server/jobs/providers";
import type { RawPosting } from "@/services/jobs/normalize";
import { DEFAULT_LIMITS, type SourceRecord } from "@/server/jobslake/types";
import { siteUrl } from "@/lib/siteUrl";
import { WONDERWORKS_COFOUNDERS } from "./profiles";
import { COF_OUTSIDE, gatewayOutside } from "./outside";
import { productHuntAvailable, productHuntStartups, redditAvailable, redditPosts } from "./keyed";
import type { CofounderListing } from "@/modules/cofounders/domain";

const EPOCH = "2026-10-31T00:00:00.000Z";

export const COF_REDDIT = "cof_reddit";
export const COF_PRODUCT_HUNT = "cof_producthunt";

export const COFOUNDERS_SOURCES: SourceRecord[] = [
  {
    protocolVersion: PROTOCOL_VERSION,
    id: WONDERWORKS_COFOUNDERS,
    name: "WonderWorks founders",
    provider: "WonderWorks",
    category: "portal",
    geography: ["global"],
    description: "People and teams on WonderWorks who chose to be found by a possible co-founder, with only the fields they show everyone.",
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
    module: "cofounders",
  },
  outsideSource(COF_OUTSIDE, "Posts and startups (data gateway)", "WorksLake data gateway", "Co-founder requests on Hacker News and companies from Y Combinator's public directory, collected on a schedule by the data gateway: a post is its title, excerpt, date and the author's public handle, a startup is a company. Terms pending: see the gateway sources' rows."),
  outsideSource(COF_REDDIT, "Reddit co-founder posts", "Reddit", "Recent co-founder requests in r/cofounder, r/startups, r/Entrepreneur, r/SideProject and r/StartUpIndia, through Reddit's Data API. Needs REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET. Terms pending: Reddit's Data API terms limit commercial use; confirm a licence.", "env:REDDIT"),
  outsideSource(COF_PRODUCT_HUNT, "Product Hunt startups", "Product Hunt", "The newest products on Product Hunt, as startups (never their makers), through its API v2. Needs PRODUCTHUNT_TOKEN. Terms pending: Product Hunt's API terms limit commercial use; confirm a licence.", "env:PRODUCTHUNT"),
];

function outsideSource(id: string, name: string, provider: string, description: string, secretRef?: string): SourceRecord {
  return { protocolVersion: PROTOCOL_VERSION, id, name, provider, category: "aggregator", geography: ["global"], description, status: "active", roleFamilies: [], config: { kind: "builtin" }, limits: DEFAULT_LIMITS, builtin: true, createdAt: EPOCH, updatedAt: EPOCH, accessStrategy: secretRef ? "official_api" : "official_feed", capabilities: ["Search", "Freshness"], jobTypes: [], module: "cofounders", ...(secretRef ? { secretRef } : {}) };
}

/** Whether this deployment can ask the source now: WonderWorks' own tables and the gateway need no credential; Reddit and Product Hunt need their keys. */
export function cofoundersSourceAvailable(s: SourceRecord): boolean {
  if (s.id === COF_REDDIT) return redditAvailable();
  if (s.id === COF_PRODUCT_HUNT) return productHuntAvailable();
  return COFOUNDERS_SOURCES.some((x) => x.id === s.id);
}

const rawOf = (l: CofounderListing): RawPosting => ({
  externalId: l.id,
  title: l.title,
  company: l.kind === "startup" ? l.title : l.sourceName,
  location: l.location,
  remote: !l.location,
  description: [l.company, l.description].filter(Boolean).join("\n\n"),
  // WorksLake matches a search against the title and the tags, so the words of a startup's one-liner and the start of its text go in as tags.
  tags: [l.terms.batch ?? "", l.kind === "post" ? "post" : "startup", ...[...new Set(`${l.company} ${l.description.slice(0, 240)}`.toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter((w) => w.length >= 3))].slice(0, 30)].filter(Boolean),
  postedAt: l.postedAt ?? null,
  applyUrl: l.url!,
  employerSite: false,
});

/** Fetch one Co-founders source: open profiles and teams, or an outside source's posts and startups, narrowed by the searcher's words and place like every source's postings. */
export async function runCofoundersSource(s: SourceRecord, c: SearchCriteria, needsSetup: (m: string) => Error = (m) => new Error(m)): Promise<{ jobs: Job[]; warnings: string[] }> {
  if (s.id === COF_OUTSIDE) {
    const g = await gatewayOutside();
    if (!g.configured) throw needsSetup("Posts and startups come from the data gateway, which isn't set up on this deployment.");
    return { jobs: finish(COF_OUTSIDE, g.listings.map(rawOf), c), warnings: [] };
  }
  if (s.id === COF_REDDIT) {
    if (!redditAvailable()) throw needsSetup("Reddit needs REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET (a free app at reddit.com/prefs/apps), set in Admin → Keys.");
    return { jobs: finish(COF_REDDIT, (await redditPosts()).map(rawOf), c), warnings: [] };
  }
  if (s.id === COF_PRODUCT_HUNT) {
    if (!productHuntAvailable()) throw needsSetup("Product Hunt needs PRODUCTHUNT_TOKEN (a free developer token at producthunt.com/v2/oauth/applications), set in Admin → Keys.");
    return { jobs: finish(COF_PRODUCT_HUNT, (await productHuntStartups()).map(rawOf), c), warnings: [] };
  }
  if (s.id !== WONDERWORKS_COFOUNDERS) throw new Error("No connector");
  const [{ openProfiles }, { openTeams }] = await Promise.all([import("./profiles"), import("./teams")]);
  const [people, teams] = await Promise.all([openProfiles(), openTeams()]);
  const raws: RawPosting[] = [...people.map((p) => p.listing), ...teams.map((t) => t.listing)].map((l) => ({
    externalId: l.id,
    title: l.title,
    company: l.kind === "team" ? "Team" : "Founder",
    location: l.location,
    remote: !l.location,
    description: [l.company, l.description].filter(Boolean).join("\n\n"),
    tags: [l.terms.role ?? "", l.terms.commitment ?? "", l.terms.stage ?? "", ...(l.terms.skills ?? []), ...(l.terms.openRoles ?? []).flatMap((o) => [o.role, ...o.skills])].filter(Boolean),
    postedAt: l.postedAt,
    applyUrl: new URL(`/app/m/cofounders/listing/${l.id}`, siteUrl().origin).toString(),
    employerSite: true,
    applyPath: "platform" as const,
  }));
  return { jobs: finish(WONDERWORKS_COFOUNDERS, raws, c), warnings: [] };
}
