/**
 * USAJOBS' Search API (needs USAJOBS_API_KEY and USAJOBS_EMAIL, the email the key was registered to), shared by every
 * module's dataset that asks it, each with its own query under its own source id: Internships asks for jobs open to
 * students (`HiringPath=student`, which covers Pathways internships); Teaching asks for teaching and education roles.
 */
import type { Job } from "@/domain/jobs/types";
import { finish, getJson, placesToSearch, type SearchCriteria } from "@/server/jobs/providers";
import { corePhrase, type RawPosting } from "@/services/jobs/normalize";
import { platformKey } from "./platformKeys";

export interface UsaJobsItem {
  MatchedObjectId: string;
  MatchedObjectDescriptor: {
    PositionTitle: string;
    PositionURI: string;
    ApplyURI?: string[];
    PositionLocationDisplay?: string;
    OrganizationName?: string;
    DepartmentName?: string;
    PositionSchedule?: { Name: string }[];
    PositionOfferingType?: { Name: string }[];
    QualificationSummary?: string;
    PositionRemuneration?: { MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string }[];
    PublicationStartDate?: string;
    UserArea?: { Details?: { JobSummary?: string; MajorDuties?: string[] } };
  };
}

export const usaJobsAvailable = () => !!(platformKey("USAJOBS_API_KEY") && platformKey("USAJOBS_EMAIL"));

export function rawFromUsaJobs(item: UsaJobsItem): RawPosting {
  const d = item.MatchedObjectDescriptor;
  const offering = (d.PositionOfferingType ?? []).map((o) => o.Name);
  // Pay only when USAJOBS states it per year ("PA"): WorksLake keeps pay per year, and an hourly rate isn't one.
  const pay = (d.PositionRemuneration ?? []).find((r) => r.RateIntervalCode === "PA");
  const location = d.PositionLocationDisplay ?? "";
  return {
    externalId: `usajobs:${item.MatchedObjectId}`,
    title: d.PositionTitle,
    company: [d.OrganizationName, d.DepartmentName].filter((x, i, a) => x && a.indexOf(x) === i).join(" · "),
    location,
    remote: /anywhere in the u\.?s\.?|remote/i.test(location),
    description: [d.UserArea?.Details?.JobSummary, ...(d.UserArea?.Details?.MajorDuties ?? []), d.QualificationSummary].filter(Boolean).join("\n\n"),
    tags: [...offering, ...(d.PositionSchedule ?? []).map((s) => s.Name)],
    postedAt: d.PublicationStartDate,
    applyUrl: d.ApplyURI?.[0] || d.PositionURI,
    salaryMin: Number(pay?.MinimumRange) || null,
    salaryMax: Number(pay?.MaximumRange) || null,
    currency: pay ? "USD" : null,
    employerSite: true,
    applyPath: "employer_site" as const,
    // USAJOBS' own offering type ("Internships"); otherwise the title decides (normalize), and a posting that says neither isn't one.
    jobType: offering.some((o) => /intern/i.test(o)) ? "internship" : offering,
  };
}

/** One USAJOBS search for the person's words, once per place asked (or once anywhere); `filter` adds the module's own (`HiringPath=student`). */
export async function fetchUsaJobs(sourceId: string, c: SearchCriteria, filter = ""): Promise<Job[]> {
  const headers = { "Authorization-Key": platformKey("USAJOBS_API_KEY") ?? "", "User-Agent": platformKey("USAJOBS_EMAIL") ?? "" };
  const q = corePhrase(c.query);
  const places = placesToSearch(c);
  const urls = (places.length ? places : [""]).map((p) => `https://data.usajobs.gov/api/search?ResultsPerPage=250${filter ? `&${filter}` : ""}${q ? `&Keyword=${encodeURIComponent(q)}` : ""}${p ? `&LocationName=${encodeURIComponent(p)}` : ""}`);
  const pages = await Promise.all(urls.map((u) => getJson<{ SearchResult?: { SearchResultItems?: UsaJobsItem[] } }>(u, { headers })));
  return finish(sourceId, pages.flatMap((p) => p.SearchResult?.SearchResultItems ?? []).map(rawFromUsaJobs), c);
}
