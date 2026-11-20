/**
 * Recruitee's public Offers API (no key; docs.recruitee.com/reference/offers): one company's published job offers at
 * `https://{company}.recruitee.com/api/offers/`. Shared by every module's dataset that asks it, each under its own
 * source id; a module narrows by `employment_type_code` (internships, part-time) with its own filter.
 */
import type { Job } from "@/domain/jobs/types";
import { finish, getJson, type SearchCriteria } from "@/server/jobs/providers";
import { htmlToText, type RawPosting } from "@/services/jobs/normalize";

export interface RecruiteeOffer { id: number; slug?: string; title: string; status?: string; published_at?: string; careers_url: string; careers_apply_url?: string; company_name?: string; location?: string; city?: string; country?: string; remote?: boolean; hybrid?: boolean; on_site?: boolean; employment_type_code?: string; department?: string; description?: string; requirements?: string; tags?: string[]; experience_code?: string }

/** Companies whose Recruitee boards are public and answer (checked live 2026-11-05, WJ-550). Extend freely; a board that fails is skipped. */
export const RECRUITEE_COMPANIES: { slug: string; company: string; domain: string }[] = [
  { slug: "bunq", company: "bunq", domain: "bunq.com" },
  { slug: "channable", company: "Channable", domain: "channable.com" },
  { slug: "holded", company: "Holded", domain: "holded.com" },
];

/** "2026-10-30 16:32:58 UTC" → ISO. */
const isoOf = (s?: string) => {
  if (!s) return null;
  const t = Date.parse(s.replace(" UTC", "Z").replace(" ", "T"));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

export function rawFromRecruitee(board: (typeof RECRUITEE_COMPANIES)[number], o: RecruiteeOffer): RawPosting {
  const place = o.location || [o.city, o.country].filter(Boolean).join(", ");
  return {
    externalId: `rc:${board.slug}:${o.id}`,
    title: o.title,
    company: o.company_name || board.company,
    companyDomain: board.domain,
    location: o.remote ? ["Remote", place].filter(Boolean).join(" · ") : place,
    remote: !!o.remote,
    description: htmlToText([o.description, o.requirements].filter(Boolean).join("\n")) || o.title,
    tags: [o.department ?? "", ...(o.tags ?? [])].filter(Boolean),
    postedAt: isoOf(o.published_at),
    applyUrl: o.careers_url,
    seniorityHint: o.experience_code ?? null,
    employerSite: true,
    applyPath: "employer_site" as const,
    jobType: o.employment_type_code ?? null,
  };
}

/** Every listed company's published offers, `keep` narrowing them (a module's own employment types). */
export async function fetchRecruitee(sourceId: string, c: SearchCriteria, keep: (o: RecruiteeOffer) => boolean = () => true, companies = RECRUITEE_COMPANIES): Promise<Job[]> {
  const boards = await Promise.all(
    companies.map(async (b) => {
      const d = await getJson<{ offers?: RecruiteeOffer[] }>(`https://${b.slug}.recruitee.com/api/offers/`).catch(() => null);
      return (d?.offers ?? []).filter((o) => (!o.status || o.status === "published") && keep(o)).map((o) => rawFromRecruitee(b, o));
    }),
  );
  return finish(sourceId, boards.flat(), c);
}
