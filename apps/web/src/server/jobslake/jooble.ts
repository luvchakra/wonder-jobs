/**
 * Jooble's REST API (needs JOOBLE_API_KEY), shared by every module's dataset that asks it: each asks with its own
 * words (Internships: "<field> intern"; Teaching: "<subject> teacher") under its own source id.
 */
import type { Job } from "@/domain/jobs/types";
import { finish, getJson, placesToSearch, type SearchCriteria } from "@/server/jobs/providers";
import type { RawPosting } from "@/services/jobs/normalize";
import { platformKey } from "./platformKeys";

export interface JoobleJob { id: string | number; title: string; location?: string; snippet?: string; salary?: string; source?: string; type?: string; link: string; company?: string; updated?: string }

export const joobleAvailable = () => !!platformKey("JOOBLE_API_KEY");

export function rawFromJooble(j: JoobleJob): RawPosting {
  return {
    externalId: `jooble:${j.id}`,
    title: j.title.replace(/<[^>]+>/g, "").trim(),
    company: j.company ?? "",
    location: j.location ?? "",
    remote: /remote/i.test(j.location ?? ""),
    description: (j.snippet ?? "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim(),
    tags: [j.type ?? ""].filter(Boolean),
    postedAt: j.updated,
    applyUrl: j.link,
    salaryText: j.salary || undefined,
    employerSite: false,
    applyPath: "platform" as const,
    jobType: j.type ?? null,
  };
}

/** One Jooble search for these keywords, once per place asked (or once anywhere). */
export async function fetchJooble(sourceId: string, keywords: string, c: SearchCriteria): Promise<Job[]> {
  const url = `https://jooble.org/api/${encodeURIComponent(platformKey("JOOBLE_API_KEY") ?? "")}`;
  const places = placesToSearch(c);
  const pages = await Promise.all((places.length ? places : [""]).map((location) => getJson<{ jobs?: JoobleJob[] }>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keywords, location, page: "1" }) })));
  return finish(sourceId, pages.flatMap((p) => p.jobs ?? []).map(rawFromJooble), c);
}
