/**
 * Personio's public job feed (no key; support.personio.de, "XML feed"): one company's published positions at
 * `https://{company}.jobs.personio.de/xml`, each with its page at `/job/{id}`. Mostly EU and DACH employers. Shared by
 * every module's dataset that asks it, each under its own source id; a module narrows by `employmentType`/`schedule`.
 */
import type { Job } from "@/domain/jobs/types";
import { finish, type SearchCriteria } from "@/server/jobs/providers";
import { htmlToText, type RawPosting } from "@/services/jobs/normalize";

export interface PersonioPosition { id: string; name: string; office: string; offices: string[]; department: string; employmentType: string; seniority: string; schedule: string; keywords: string[]; createdAt: string; description: string }

/** Companies whose Personio feeds are public and answer (checked live 2026-11-05, WJ-550). Extend freely; a feed that fails is skipped. */
export const PERSONIO_COMPANIES: { slug: string; company: string; domain: string }[] = [
  { slug: "1komma5grad", company: "1KOMMA5°", domain: "1komma5.com" },
  { slug: "ottonova", company: "ottonova", domain: "ottonova.de" },
  { slug: "clark", company: "CLARK", domain: "clark.de" },
  { slug: "tado", company: "tado°", domain: "tado.com" },
  { slug: "hokify", company: "hokify", domain: "hokify.com" },
];

const UA = "WonderWorks/1.0 (+https://wonderjobs-wonder-team4.vercel.app; job search agent)";
const unescape = (s: string) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, "&").trim();
const field = (b: string, tag: string) => {
  const m = b.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? unescape(m[1]) : "";
};

/** The feed's positions. A position's description is its `jobDescription` blocks (name + value) in order. */
export function parsePersonio(xml: string): PersonioPosition[] {
  return [...xml.matchAll(/<position>([\s\S]*?)<\/position>/g)].flatMap(([, b]) => {
    const id = field(b, "id");
    const name = field(b, "name");
    if (!id || !name) return [];
    const extra = b.match(/<additionalOffices>([\s\S]*?)<\/additionalOffices>/)?.[1] ?? "";
    const desc = [...b.matchAll(/<jobDescription>([\s\S]*?)<\/jobDescription>/g)].map(([, d]) => [field(d, "name"), htmlToText(field(d, "value"))].filter(Boolean).join("\n")).join("\n\n");
    return [{ id, name, office: field(b, "office"), offices: [...extra.matchAll(/<office>([\s\S]*?)<\/office>/g)].map(([, o]) => unescape(o)), department: field(b, "department"), employmentType: field(b, "employmentType"), seniority: field(b, "seniority"), schedule: field(b, "schedule"), keywords: field(b, "keywords").split(",").map((k) => k.trim()).filter(Boolean), createdAt: field(b, "createdAt"), description: desc }];
  });
}

export function rawFromPersonio(board: (typeof PERSONIO_COMPANIES)[number], p: PersonioPosition): RawPosting {
  const places = [p.office, ...p.offices].filter(Boolean);
  const remote = places.some((o) => /remote|home ?office/i.test(o));
  return {
    externalId: `pz:${board.slug}:${p.id}`,
    title: p.name,
    company: board.company,
    companyDomain: board.domain,
    location: places.join(" · "),
    remote,
    description: p.description || p.name,
    tags: [p.department, ...p.keywords].filter(Boolean),
    postedAt: p.createdAt || null,
    applyUrl: `https://${board.slug}.jobs.personio.de/job/${encodeURIComponent(p.id)}`,
    seniorityHint: p.seniority || null,
    employerSite: true,
    applyPath: "employer_site" as const,
    jobType: [p.employmentType, p.schedule].filter(Boolean),
  };
}

/** Every listed company's positions, `keep` narrowing them (a module's own employment types). */
export async function fetchPersonio(sourceId: string, c: SearchCriteria, keep: (p: PersonioPosition) => boolean = () => true, companies = PERSONIO_COMPANIES): Promise<Job[]> {
  const feeds = await Promise.all(
    companies.map(async (b) => {
      const res = await fetch(`https://${b.slug}.jobs.personio.de/xml`, { headers: { accept: "application/xml, text/xml", "user-agent": UA }, next: { revalidate: 900 } }).catch(() => null);
      if (!res?.ok) return [];
      return parsePersonio(await res.text()).filter(keep).map((p) => rawFromPersonio(b, p));
    }),
  );
  return finish(sourceId, feeds.flat(), c);
}
