/**
 * What this app adds to the gateway's prospect routes (WJ-818, docs/PROSPECT_DATA_API.md, A4): WorksLake's company
 * directory, as the first and cheapest source enrich asks. An organisation's facts only (industry, size band, where it
 * is based); never a job posting, a person or a rating.
 */
import type { CompanyFactEntry, ProspectHooks } from "../../../../data-gateway/src/handler.mjs";
import type { CompanyFacts } from "@/domain/jobslake/companies";
import { cleanDomain, companyKey } from "@/domain/jobslake/companies";
import { companyStore } from "@/server/jobslake/companies";

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
    ...entries(r.wikidata, { provider: "wikidata", name: "Wikidata", url: r.wikidata?.sourceId ? `https://www.wikidata.org/wiki/${r.wikidata.sourceId}` : "https://www.wikidata.org/", termsPending: false }, r.wikidataAt),
  ];
}

export const prospectHooks: ProspectHooks = { companyFacts };
