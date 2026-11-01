/**
 * Sweden's public employment service (Arbetsförmedlingen) job ads, through its open JobSearch API: no key, and the
 * dataset's own page states "Licens: Creative Commons CC0, Åtkomsträttigheter: Publik"
 * (data.arbetsformedlingen.se/dataset/job-ads). JobSearch is for searching, not bulk download, so a search asks for
 * one page of the education field's ads that match the words.
 *
 * Ads can carry a contact person's details; a posting here keeps none: emails and phone numbers are removed from the
 * text, and the ad's separate contact fields are never read.
 */
import type { Job } from "@/domain/jobs/types";
import { finish, getJson, type SearchCriteria } from "@/server/jobs/providers";
import { corePhrase, type RawPosting } from "@/services/jobs/normalize";

/** "Pedagogik" (education), the occupation field of teaching and childcare-education ads. */
const EDUCATION_FIELD = "MVqp_eS8_kDZ";
const SWEDEN = /\b(sweden|sverige|stockholm|g[oö]teborg|gothenburg|malm[oö]|uppsala|v[aä]ster[aå]s|[oö]rebro|link[oö]ping|helsingborg|j[oö]nk[oö]ping|norrk[oö]ping|lund|ume[aå]|norrt[aä]lje|solna|kista)\b/i;

export interface JobTechHit {
  id: string;
  headline?: string;
  webpage_url?: string;
  publication_date?: string;
  remote?: boolean | null;
  employer?: { name?: string | null; workplace?: string | null; url?: string | null };
  workplace_address?: { municipality?: string | null; region?: string | null; country?: string | null };
  description?: { text?: string | null };
  occupation?: { label?: string | null };
  working_hours_type?: { label?: string | null };
}

/** Text without emails and phone numbers. */
export const withoutContactDetails = (s: string) =>
  s
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "")
    .replace(/(?<![\w/])\+?\d[\d\s().-]{7,}\d(?![\w/])/g, (m) => (/^\d{4}-\d{2}-\d{2}$/.test(m) ? m : ""))
    .replace(/[ \t]{2,}/g, " ")
    .trim();

export function rawFromJobTech(h: JobTechHit): RawPosting {
  const a = h.workplace_address ?? {};
  const place = [a.municipality, a.region, a.country].filter((x, i, all): x is string => !!x && all.indexOf(x) === i).join(", ");
  const hours = h.working_hours_type?.label;
  return {
    externalId: `jobtech:${h.id}`,
    title: h.headline ?? "",
    company: h.employer?.name || h.employer?.workplace || "",
    ...(h.employer?.url ? { companyDomain: h.employer.url } : {}),
    location: place || "Sweden",
    remote: !!h.remote,
    description: withoutContactDetails(h.description?.text ?? "").slice(0, 4000),
    tags: [h.occupation?.label ?? ""].filter(Boolean),
    postedAt: h.publication_date,
    applyUrl: h.webpage_url ?? "",
    employerSite: false,
    applyPath: "platform" as const,
    jobType: [hours === "Heltid" ? "full_time" : hours === "Deltid" ? "part_time" : null],
  };
}

/** Whether a search could be for Sweden: it names no place, or one of Sweden's. */
export const couldBeSweden = (c: Pick<SearchCriteria, "locations">) => {
  const places = c.locations.filter((l) => l.trim() && !/^(remote|anywhere|worldwide)$/i.test(l.trim()));
  return !places.length || places.some((p) => SWEDEN.test(p));
};

export async function fetchJobTechTeaching(sourceId: string, c: SearchCriteria): Promise<Job[]> {
  if (!couldBeSweden(c)) return [];
  const q = corePhrase(c.query);
  const r = await getJson<{ hits?: JobTechHit[] }>(`https://jobsearch.api.jobtechdev.se/search?occupation-field=${EDUCATION_FIELD}&limit=50${q ? `&q=${encodeURIComponent(q)}` : ""}`, { headers: { accept: "application/json" } });
  return finish(sourceId, (r.hits ?? []).filter((h) => h.headline && h.webpage_url).map(rawFromJobTech), c);
}
