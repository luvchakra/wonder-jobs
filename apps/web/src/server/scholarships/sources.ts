/**
 * The Scholarships & Projects module's own WorksLake sources: a separate dataset (module = 'scholarships'), so none of
 * these ever answers another module's search and none of theirs ever answers this one
 * (server/jobslake/registry.ts::listSources).
 *
 * Real sources with documented reuse rights only (docs/WONDERWORKS_PLATFORM.md, "where real listings come from"):
 * - WonderWorks organisations: scholarships and projects posted in a WonderWorks workspace.
 * - Grants.gov: its public search API (`search2`, no key), only opportunities open to individuals (eligibility 21)
 *   that read as being for students (scholarship, fellowship, student, education, training, research). Its terms ask
 *   for the notice `GRANTS_GOV_NOTICE` next to its listings.
 * - Partner uploads arrive through the WorksLake gateway's own source (`works_gateway_scholarships`,
 *   server/jobslake/gatewaySources.ts), activated by an admin.
 * Not here, on purpose: India's National Scholarship Portal, Buddy4Study, Fastweb and Scholarships.com publish no open
 * API, and WorksLake never scrapes a site without documented reuse rights; a listing found elsewhere links to the
 * official portal.
 */
import type { Job } from "@/domain/jobs/types";
import { PROTOCOL_VERSION } from "@/domain/jobslake/protocol";
import { finish, type SearchCriteria } from "@/server/jobs/providers";
import type { RawPosting } from "@/services/jobs/normalize";
import { fixtureJobsOn } from "@/server/jobslake/e2eFixture";
import { DEFAULT_LIMITS, type SourceRecord } from "@/server/jobslake/types";
import { siteUrl } from "@/lib/siteUrl";

const EPOCH = "2026-11-01T00:00:00.000Z";
const FEED_CAPS = ["Search", "Freshness", "Apply URL"];

function source(p: Pick<SourceRecord, "id" | "name" | "provider" | "category" | "geography" | "description"> & Partial<SourceRecord>): SourceRecord {
  return { protocolVersion: PROTOCOL_VERSION, status: "active", roleFamilies: [], config: { kind: "builtin" }, limits: DEFAULT_LIMITS, builtin: true, createdAt: EPOCH, updatedAt: EPOCH, accessStrategy: "official_api", capabilities: FEED_CAPS, jobTypes: [], module: "scholarships", ...p };
}

export const WONDERSTAR_SCHOLARSHIPS = "schol_wonderstar";
export const GRANTS_GOV = "schol_grants_gov";

/** Required by Grants.gov's API terms next to its data. */
export const GRANTS_GOV_NOTICE = "This product uses the Grants.gov API but is not endorsed or certified by the U.S. Department of Health and Human Services.";

export const SCHOLARSHIP_SOURCES: SourceRecord[] = [
  source({ id: WONDERSTAR_SCHOLARSHIPS, name: "WonderWorks organisations", provider: "WonderWorks", category: "portal", geography: ["global"], description: "Scholarships and projects organisations post on WonderWorks." }),
  source({ id: GRANTS_GOV, name: "Grants.gov (open to individuals)", provider: "Grants.gov", category: "portal", geography: ["US"], description: "US federal funding opportunities open to individuals, from Grants.gov's public search API." }),
];

export function scholarshipSourceAvailable(s: SourceRecord): boolean {
  if (fixtureJobsOn()) return true;
  return SCHOLARSHIP_SOURCES.some((x) => x.id === s.id);
}

interface GrantsHit {
  id: string;
  number: string;
  title: string;
  agency: string;
  openDate: string;
  closeDate: string;
  oppStatus: string;
}

/** "05/01/2028" → "2028-05-01"; anything else → undefined. */
export function usDate(s: string | undefined): string | undefined {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s ?? "");
  return m ? `${m[3]}-${m[1]}-${m[2]}` : undefined;
}

const FOR_STUDENTS = /\b(scholar\w*|fellow\w*|students?|education\w*|training|trainees?|research\w*|internships?|graduate|undergraduate|doctoral|youth)\b/i;

/** A Grants.gov hit as a posting: only what it states (agency, number, dates), linking to its official page. */
export function rawFromGrants(h: GrantsHit): RawPosting | null {
  if (!FOR_STUDENTS.test(h.title)) return null;
  const deadline = usDate(h.closeDate);
  return {
    externalId: h.id,
    title: h.title.replace(/\s+/g, " ").trim(),
    company: h.agency || "US federal agency",
    location: "United States",
    remote: false,
    description: `Funding opportunity ${h.number} from ${h.agency}, ${h.oppStatus === "forecasted" ? "forecasted" : "open"} on Grants.gov. Eligibility, award and documents are in the official notice.`,
    tags: [],
    ...(usDate(h.openDate) ? { postedAt: `${usDate(h.openDate)}T00:00:00.000Z` } : {}),
    applyUrl: `https://www.grants.gov/search-results-detail/${encodeURIComponent(h.id)}`,
    employerSite: true,
    attributes: { kind: "scholarship", ...(deadline ? { deadline } : {}), currency: "USD", officialUrl: `https://www.grants.gov/search-results-detail/${encodeURIComponent(h.id)}`, notice: GRANTS_GOV_NOTICE },
  };
}

export async function fetchGrantsGov(c: SearchCriteria): Promise<Job[]> {
  const res = await fetch("https://api.grants.gov/v1/api/search2", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ keyword: c.query.slice(0, 100), oppStatuses: "posted|forecasted", eligibilities: "21", rows: 100 }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`api.grants.gov responded ${res.status}`);
  const body = (await res.json()) as { errorcode?: number; msg?: string; data?: { oppHits?: GrantsHit[] } };
  if (body.errorcode) throw new Error(body.msg || "Grants.gov refused the search");
  return finish(GRANTS_GOV, (body.data?.oppHits ?? []).flatMap((h) => rawFromGrants(h) ?? []), c);
}

/** Fetch one Scholarships source. Under the E2E fixture only the WonderWorks source is real; outside sources answer nothing. */
export async function runScholarshipSource(s: SourceRecord, c: SearchCriteria): Promise<{ jobs: Job[]; warnings: string[] }> {
  if (fixtureJobsOn() && s.id !== WONDERSTAR_SCHOLARSHIPS) return { jobs: [], warnings: [] };
  switch (s.id) {
    case WONDERSTAR_SCHOLARSHIPS: {
      const { openScholarships } = await import("./applications");
      const raws: RawPosting[] = (await openScholarships()).map(({ posting, org }) => ({
        externalId: posting.id,
        title: posting.title,
        company: org.name,
        location: posting.location,
        remote: posting.workMode === "remote",
        description: posting.description,
        tags: [...(posting.terms.fields ?? []), ...posting.skills],
        postedAt: posting.updatedAt,
        // Applying happens in WonderWorks (Apply on the listing); this is where it lives.
        applyUrl: new URL(`/app/m/scholarships?posting=${posting.id}`, siteUrl().origin).toString(),
        employerSite: true,
        applyPath: "platform" as const,
      }));
      return { jobs: finish(WONDERSTAR_SCHOLARSHIPS, raws, c), warnings: [] };
    }
    case GRANTS_GOV:
      return { jobs: await fetchGrantsGov(c), warnings: [] };
    default:
      throw new Error("No connector");
  }
}
