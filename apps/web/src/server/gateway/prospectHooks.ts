/**
 * What this app adds to the gateway's prospect routes (WJ-818, docs/PROSPECT_DATA_API.md, A4): WorksLake's company
 * directory, as the first and cheapest source enrich asks. An organisation's facts only (industry, size band, where it
 * is based); never a job posting, a person or a rating.
 */
import type { CompanyFactEntry, HiringCompany, ProspectHooks } from "../../../../data-gateway/src/handler.mjs";
import type { CompanyFacts } from "@/domain/jobslake/companies";
import { cleanDomain, companyKey } from "@/domain/jobslake/companies";
import { companiesFrom, companyStore } from "@/server/jobslake/companies";
import { jobsLakeStore } from "@/server/jobslake/store";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { LIVE_PROVIDERS } from "../../../../data-gateway/src/providers/index.mjs";
import { platformEnv } from "@/server/jobslake/platformKeys";

function entries(facts: CompanyFacts | null | undefined, source: CompanyFactEntry["source"], observedAt: string | undefined): CompanyFactEntry[] {
  if (!facts) return [];
  const hq = [facts.hqCity, facts.hqCountry].filter((v): v is string => typeof v === "string" && !!v.trim()).join(", ");
  const out: CompanyFactEntry[] = [];
  if (facts.industry) out.push({ field: "industry", value: facts.industry, source, observedAt: observedAt ?? null });
  // Only a band the source states; a head count is never turned into one.
  if (facts.employeeRange) out.push({ field: "employeeRange", value: facts.employeeRange, source, observedAt: observedAt ?? null });
  if (hq) out.push({ field: "hq", value: hq, source, observedAt: observedAt ?? null });
  return out;
}

/** Reported facts first (what a job-data source said about the company), then Wikidata's; [] when the directory has neither. */
export async function companyFacts(q: { domain: string; name: string }): Promise<CompanyFactEntry[]> {
  const store = companyStore();
  const domain = cleanDomain(q.domain);
  const key = q.name ? companyKey(q.name) : "";
  const r = (domain ? await store.byDomain(domain) : undefined) ?? (key ? await store.byName(key) : undefined);
  if (!r) return [];
  return [
    // Terms pending (owner decision prospects-directory-facts): these came from job-data sources reviewed for WonderWorks.
    ...entries(r.facts, { provider: "workslake", name: "WorksLake company directory", url: null, termsPending: true }, r.factsAt ?? r.lastSeenAt),
    ...entries(r.wikidata, { provider: "wikidata", name: "Wikidata", url: r.wikidata?.sourceId ? `https://www.wikidata.org/wiki/${r.wikidata.sourceId}` : "https://www.wikidata.org/", termsPending: false }, r.wikidataAt ?? r.lastSeenAt),
  ];
}

/** The most postings one signal request reads (PostgREST answers at most 1,000 rows a request). */
export const SIGNAL_POSTINGS = 1000;
const regionNames = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; } })();

/**
 * Companies whose recent Jobs postings mention any of the keywords (WJ-819, A7): per company, how many postings matched
 * and up to five of their titles, with the directory's open-job counts and Wikidata facts. Only the newest
 * `SIGNAL_POSTINGS` postings are read. A posting's text is matched here and never leaves: no description, link, salary
 * or source of a posting is returned, and nothing about who posted it.
 */
export async function hiringSignals(q: { keywords: string[]; places: string[]; countries: string[]; sinceDays: number }, now = Date.now(), postings?: CanonicalOpportunity[]): Promise<{ companies: HiringCompany[]; postingsRead: number }> {
  const since = new Date(now - q.sinceDays * 86_400_000).toISOString();
  const opps = postings ?? (await jobsLakeStore().listOpportunities({ sinceIso: since, limit: SIGNAL_POSTINGS }));
  // A country is matched by its code exactly, or by its name (a two-letter code inside other words means nothing).
  const codes = q.countries.map((c) => c.toLowerCase());
  const names = q.countries.map((c) => (regionNames?.of(c) ?? "").toLowerCase()).filter(Boolean);
  const at = new Date(now).toISOString();
  const found = new Map<string, HiringCompany & { titles: Set<string> }>();
  for (const o of opps) {
    if (o.kind === "event" || o.postedAt < since) continue;
    const text = `${o.title} ${o.skills.join(" ")} ${o.description}`.toLowerCase();
    if (!q.keywords.some((k) => text.includes(k))) continue;
    const where = `${o.locations.join(" ")} ${o.country}`.toLowerCase();
    if (q.places.length && !q.places.some((p) => where.includes(p))) continue;
    if (codes.length && !codes.includes(o.country.toLowerCase()) && !names.some((n) => where.includes(n))) continue;
    // Only a domain a source reported or the employer's own apply link shows; never guessed from a name.
    const company = companiesFrom([o], at)[0];
    if (!company) continue;
    const row = found.get(company.domain) ?? { domain: company.domain, name: company.name, matched: 0, matchedTitles: [], titles: new Set<string>(), observedAt: at };
    row.matched++;
    row.titles.add(o.title.trim().slice(0, 120));
    found.set(company.domain, row);
  }
  const store = companyStore();
  const companies: HiringCompany[] = [];
  for (const row of [...found.values()].sort((a, b) => b.matched - a.matched).slice(0, 200)) {
    const r = await store.byDomain(row.domain);
    const wd = r?.wikidata ?? undefined;
    companies.push({
      domain: row.domain, name: row.name, matched: row.matched, matchedTitles: [...row.titles].slice(0, 5), observedAt: at,
      ...(r?.openJobs !== undefined ? { openJobs: r.openJobs } : {}),
      ...(r?.newJobs7d !== undefined ? { newJobs7d: r.newJobs7d } : {}),
      // Facts from Wikidata only (CC0); what job-data sources reported about a company is not passed with a signal.
      ...(wd?.industry ? { industry: wd.industry } : {}),
      ...(wd?.employeeRange ? { employeeRange: wd.employeeRange } : {}),
      ...([wd?.hqCity, wd?.hqCountry].some(Boolean) ? { hq: [wd?.hqCity, wd?.hqCountry].filter(Boolean).join(", ") } : {}),
      ...(wd ? { factsSource: { provider: "wikidata", name: "Wikidata", url: wd.sourceId ? `https://www.wikidata.org/wiki/${wd.sourceId}` : "https://www.wikidata.org/" } } : {}),
    });
  }
  return { companies, postingsRead: opps.length };
}

/**
 * The keys the gateway's live providers need (WJ-822), and no other: each from Admin → Keys (or the deployment's
 * variable of the same name). The gateway holds no key of its own; one that is not set makes its provider "Needs setup".
 */
export async function providerKeys(): Promise<Record<string, string | undefined>> {
  const env = await platformEnv();
  return Object.fromEntries(LIVE_PROVIDERS.flatMap((p) => p.keys).map((name) => [name, env[name]?.trim() || undefined]));
}

export const prospectHooks: ProspectHooks = { companyFacts, hiringSignals: (q) => hiringSignals(q), providerKeys };
