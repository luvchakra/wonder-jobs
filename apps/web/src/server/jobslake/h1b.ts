/**
 * H-1B sponsorship from the US Department of Labor's LCA disclosure files (OFLC, public, quarterly). The "H-1B
 * data" workflow aggregates a file per employer (`scripts/h1b/aggregate.py`) and posts it here gzipped; employers
 * are keyed by the same normalized company name as WorksLake's directory ("Figma, Inc." → "figma"), and the daily
 * company refresh copies a company's totals onto it. Names are matched exactly, never fuzzily.
 */
import { companyKey, type H1bRecord } from "@/domain/jobslake/companies";
import { companyStore, type CompanyStore } from "./companies";

export interface H1bUpload {
  fiscalYear: number;
  through: string;
  employers: { name: string; filings: number; medianWage?: number }[];
}

const MAX_EMPLOYERS = 200_000;

/** The upload's rows, merged by company-name key (the employer with the most filings gives the name and median). */
export function h1bRows(u: H1bUpload): (H1bRecord & { nameKey: string; name: string })[] {
  if (!Number.isInteger(u?.fiscalYear) || u.fiscalYear < 2015 || u.fiscalYear > 2100) throw new Error("fiscalYear is invalid");
  if (typeof u.through !== "string" || !/^FY\d{4} Q[1-4]$/.test(u.through)) throw new Error("through is invalid");
  if (!Array.isArray(u.employers) || u.employers.length > MAX_EMPLOYERS) throw new Error(`employers must be a list of at most ${MAX_EMPLOYERS}`);
  const by = new Map<string, H1bRecord & { nameKey: string; name: string; top: number }>();
  for (const e of u.employers) {
    if (typeof e?.name !== "string" || !Number.isInteger(e.filings) || e.filings < 1) continue;
    const nameKey = companyKey(e.name.slice(0, 200));
    if (!nameKey) continue;
    const wage = Number.isInteger(e.medianWage) && e.medianWage! > 0 ? e.medianWage : undefined;
    const prev = by.get(nameKey);
    const lead = !prev || e.filings > prev.top;
    by.set(nameKey, {
      nameKey,
      name: lead ? e.name.slice(0, 200) : prev!.name,
      filings: (prev?.filings ?? 0) + e.filings,
      ...((lead ? wage : prev?.medianWage) ? { medianWage: lead ? wage : prev!.medianWage } : {}),
      fiscalYear: u.fiscalYear,
      through: u.through,
      top: lead ? e.filings : prev!.top,
    });
  }
  return [...by.values()].map((r) => ({ nameKey: r.nameKey, name: r.name, filings: r.filings, ...(r.medianWage ? { medianWage: r.medianWage } : {}), fiscalYear: r.fiscalYear, through: r.through }));
}

/** Stores a file's totals in place of the previous file's. */
export async function loadH1b(u: H1bUpload, store: CompanyStore = companyStore()): Promise<{ employers: number }> {
  const rows = h1bRows(u);
  await store.putH1b(rows, true);
  return { employers: rows.length };
}
