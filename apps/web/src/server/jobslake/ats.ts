/**
 * ATS board connectors (Greenhouse, Lever, Ashby, SmartRecruiters, Workable) — each reads the
 * platform's public, documented job-board API for one company board.
 *
 * Unlike the legacy "careers" fetcher, a board that can't be read is an error here, not an empty
 * list: an admin testing a new board must see "Lever returned 404", not "0 jobs".
 *
 * Every posting keeps the exact job id WonderJobs has always given it (`careers_…` from the
 * `gh:`/`lv:`/`ab:` external ids), so saved jobs, applications and the extension still resolve.
 */
import type { Job } from "@/domain/jobs/types";
import type { AtsPlatform } from "@/domain/jobslake/detect";
import { corePhrase, htmlToText, titleMatches, type RawPosting } from "@/services/jobs/normalize";
import type { Depth } from "@/domain/jobslake/planner";
import { finish, getJson, rawFromAshby, rawFromGreenhouse, rawFromLever, type AshbyJob, type GreenhouseJob, type LeverJob, type SearchCriteria } from "@/server/jobs/providers";

export interface AtsBoard {
  platform: AtsPlatform;
  slug: string;
  company: string;
  domain?: string;
}

/** The legacy WonderJobs source every ATS posting belongs to — keeps `careers_…` job ids stable. */
export const ATS_LEGACY_SOURCE = "careers";

const DETAIL: Record<Depth, number> = { shallow: 6, normal: 12, deep: 25 };
const LIST_CAP: Record<Depth, number> = { shallow: 25, normal: 40, deep: 80 };

type LegacyBoard = { ats: "greenhouse" | "lever" | "ashby"; slug: string; company: string; domain: string };
const legacy = (b: AtsBoard): LegacyBoard => ({ ats: b.platform as LegacyBoard["ats"], slug: b.slug, company: b.company, domain: b.domain ?? "" });

/* ---- SmartRecruiters ---- */
interface SrPosting { id: string; name: string; releasedDate: string; company?: { name?: string }; location?: { city?: string; country?: string; fullLocation?: string; remote?: boolean; hybrid?: boolean }; department?: { label?: string }; function?: { label?: string }; typeOfEmployment?: { label?: string } }
interface SrDetail { jobAd?: { sections?: Record<string, { text?: string }> } }

/* ---- Workable ---- */
interface WkJob { title: string; shortcode: string; url: string; application_url?: string; published_on?: string; created_at?: string; city?: string; state?: string; country?: string; telecommuting?: boolean; description?: string; employment_type?: string; department?: string; function?: string; industry?: string; experience?: string }

async function boardRaw(b: AtsBoard, c: SearchCriteria, depth: Depth): Promise<RawPosting[]> {
  const q = c.query;
  switch (b.platform) {
    case "greenhouse": {
      const list = await getJson<{ jobs: GreenhouseJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.slug)}/jobs`);
      const hits = (list.jobs ?? []).filter((j) => titleMatches(j.title, q)).slice(0, LIST_CAP[depth]);
      // Descriptions need one call per posting — fetch them for the first few, keep the rest as listed.
      const detailed = await Promise.all(hits.map((j, i) => (i < DETAIL[depth] ? getJson<GreenhouseJob>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.slug)}/jobs/${j.id}`).catch(() => j) : Promise.resolve(j))));
      return detailed.map((j) => rawFromGreenhouse(legacy(b), j));
    }
    case "lever": {
      const list = await getJson<LeverJob[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(b.slug)}?mode=json`);
      if (!Array.isArray(list)) throw new Error("Lever returned an unexpected response");
      return list.filter((j) => titleMatches(j.text, q)).slice(0, LIST_CAP[depth]).map((j) => rawFromLever(legacy(b), j));
    }
    case "ashby": {
      const list = await getJson<{ jobs: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(b.slug)}`);
      return (list.jobs ?? []).filter((j) => titleMatches(j.title, q)).slice(0, LIST_CAP[depth]).map((j) => rawFromAshby(legacy(b), j));
    }
    case "smartrecruiters": {
      const phrase = corePhrase(q);
      const list = await getJson<{ content?: SrPosting[] }>(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(b.slug)}/postings?limit=100${phrase ? `&q=${encodeURIComponent(phrase)}` : ""}`);
      const hits = (list.content ?? []).filter((j) => titleMatches(j.name, q)).slice(0, LIST_CAP[depth]);
      const details = await Promise.all(hits.map((j, i) => (i < DETAIL[depth] ? getJson<SrDetail>(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(b.slug)}/postings/${j.id}`).catch(() => null) : Promise.resolve(null))));
      return hits.map((j, i) => {
        const sections = details[i]?.jobAd?.sections ?? {};
        const body = ["companyDescription", "jobDescription", "qualifications", "additionalInformation"].map((k) => htmlToText(sections[k]?.text ?? "")).filter(Boolean).join("\n\n");
        const loc = j.location?.fullLocation?.replace(/,\s*,/g, ",") || [j.location?.city, j.location?.country?.toUpperCase()].filter(Boolean).join(", ");
        return {
          externalId: `sr:${b.slug}:${j.id}`,
          title: j.name,
          company: j.company?.name || b.company,
          companyDomain: b.domain,
          location: [loc, j.location?.remote ? "Remote" : ""].filter(Boolean).join(" · "),
          remote: !!j.location?.remote,
          description: body || `${j.name} — ${[j.department?.label, j.function?.label].filter(Boolean).join(", ")}`,
          tags: [j.department?.label, j.function?.label, j.typeOfEmployment?.label].filter((t): t is string => !!t),
          postedAt: j.releasedDate,
          applyUrl: `https://jobs.smartrecruiters.com/${encodeURIComponent(b.slug)}/${j.id}`,
          employerSite: true,
          applyPath: "employer_site" as const,
        };
      });
    }
    case "workable": {
      const acct = await getJson<{ name?: string; jobs?: WkJob[] }>(`https://www.workable.com/api/accounts/${encodeURIComponent(b.slug)}?details=true`);
      return (acct.jobs ?? [])
        .filter((j) => titleMatches(j.title, q))
        .slice(0, LIST_CAP[depth])
        .map((j) => ({
          externalId: `wk:${b.slug}:${j.shortcode}`,
          title: j.title,
          company: acct.name || b.company,
          companyDomain: b.domain,
          location: [[j.city, j.state, j.country].filter(Boolean).join(", "), j.telecommuting ? "Remote" : ""].filter(Boolean).join(" · "),
          remote: !!j.telecommuting,
          description: j.description ?? "",
          tags: [j.department, j.function, j.employment_type].filter((t): t is string => !!t),
          postedAt: j.published_on ?? j.created_at,
          applyUrl: j.application_url || j.url,
          seniorityHint: j.experience,
          industryHint: j.industry,
          employerSite: true,
          applyPath: "employer_site" as const,
        }));
    }
  }
}

/** One board, strict: throws when the board can't be read. */
export async function fetchAtsBoard(b: AtsBoard, c: SearchCriteria, depth: Depth = "normal"): Promise<Job[]> {
  return finish(ATS_LEGACY_SOURCE, await boardRaw(b, c, depth), c);
}

/**
 * Many boards of one platform (a built-in source). Board failures are isolated and reported; the
 * source only fails when every board failed.
 */
export async function fetchAtsBoards(boards: AtsBoard[], c: SearchCriteria, depth: Depth = "normal"): Promise<{ jobs: Job[]; failures: { slug: string; message: string }[] }> {
  const failures: { slug: string; message: string }[] = [];
  const raws = await Promise.all(
    boards.map((b) =>
      boardRaw(b, c, depth).catch((e) => {
        failures.push({ slug: b.slug, message: e instanceof Error ? e.message : "unavailable" });
        return [] as RawPosting[];
      }),
    ),
  );
  if (boards.length && failures.length === boards.length) throw new Error(`All ${boards.length} boards failed (${failures[0].message})`);
  return { jobs: finish(ATS_LEGACY_SOURCE, raws.flat(), c), failures };
}
