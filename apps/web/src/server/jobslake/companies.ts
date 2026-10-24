/**
 * JobsLake's company directory (`jobslake_companies`): each employer's domain and name as sources reported
 * them, and its logo, fetched once and cached here. Platform-wide public data — no tenant, no user. A logo
 * is only ever fetched for a company recorded from a real posting, never for an arbitrary domain.
 */
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import type { CompanyFacts } from "@/domain/jobs/types";
import { cleanDomain, companyKey, employerDomainOf, type CompanyProfile, type CompanyRecord, type H1bRecord } from "@/domain/jobslake/companies";
import { getSupabaseAdmin } from "@/server/supabase";

/** How long a logo (or the finding that there is none) is trusted before it's looked for again. */
export const LOGO_TTL_MS = 30 * 86_400_000;
const MAX_LOGO_BYTES = 200_000;

export interface CompanyStore {
  upsert(records: CompanyRecord[]): Promise<void>;
  byDomain(domain: string): Promise<CompanyRecord | undefined>;
  byName(nameKey: string): Promise<CompanyRecord | undefined>;
  setLogo(domain: string, logo: CompanyRecord["logo"], checkedAt: string): Promise<void>;
  /** Companies whose logo was never looked for, or not since `staleBefore` — oldest first. */
  needingLogo(limit: number, staleBefore: string): Promise<string[]>;
  /** Companies whose Wikidata facts were never looked for, or not since `staleBefore` — oldest first. */
  needingWikidata(limit: number, staleBefore: string): Promise<string[]>;
  /** Stores what Wikidata has for each looked-for domain (null: nothing). */
  setWikidata(found: Map<string, CompanyFacts>, checked: string[], at: string): Promise<void>;
  /** H-1B totals for these company-name keys, from the last loaded Department of Labor file. */
  h1bFor(nameKeys: string[]): Promise<Map<string, H1bRecord>>;
  /** Stores one file's H-1B totals (rows keyed by company-name key); `replace` removes the previous file's first. */
  putH1b(rows: (H1bRecord & { nameKey: string; name: string })[], replace: boolean): Promise<void>;
}

/** The refresh-only fields a record carries, as their columns; absent fields are left as they are. */
function extraCols(r: CompanyRecord) {
  return {
    ...(r.openJobs !== undefined ? { open_jobs: r.openJobs, counted_at: r.countedAt } : {}),
    ...(r.newJobs7d !== undefined ? { new_jobs_7d: r.newJobs7d } : {}),
    ...(r.facts ? { facts: r.facts, facts_at: r.factsAt ?? r.lastSeenAt } : {}),
    ...(r.h1b !== undefined ? { h1b: r.h1b } : {}),
  };
}
const wikidataOf = (v: unknown): CompanyFacts | null => (v && typeof v === "object" && "from" in v ? (v as CompanyFacts) : null);
const extraFields = (r: CompanyRecord): Partial<CompanyRecord> => ({
  ...(r.openJobs !== undefined ? { openJobs: r.openJobs, countedAt: r.countedAt } : {}),
  ...(r.newJobs7d !== undefined ? { newJobs7d: r.newJobs7d } : {}),
  ...(r.facts ? { facts: r.facts, factsAt: r.factsAt ?? r.lastSeenAt } : {}),
  ...(r.h1b !== undefined ? { h1b: r.h1b } : {}),
});

class MemoryCompanies implements CompanyStore {
  rows = new Map<string, CompanyRecord>();
  h1b = new Map<string, H1bRecord>();
  async upsert(records: CompanyRecord[]) {
    for (const r of records) {
      const old = this.rows.get(r.domain);
      this.rows.set(r.domain, old ? { ...old, name: r.name, nameKey: r.nameKey, sources: [...new Set([...old.sources, ...r.sources])], lastSeenAt: r.lastSeenAt, ...extraFields(r) } : r);
    }
  }
  async byDomain(domain: string) {
    return this.rows.get(domain);
  }
  async byName(nameKey: string) {
    return [...this.rows.values()].filter((r) => r.nameKey === nameKey).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0];
  }
  async setLogo(domain: string, logo: CompanyRecord["logo"], checkedAt: string) {
    const r = this.rows.get(domain);
    if (r) this.rows.set(domain, { ...r, logo, logoCheckedAt: checkedAt });
  }
  async needingLogo(limit: number, staleBefore: string) {
    return [...this.rows.values()]
      .filter((r) => !r.logoCheckedAt || r.logoCheckedAt < staleBefore)
      .sort((a, b) => (a.logoCheckedAt ?? "").localeCompare(b.logoCheckedAt ?? ""))
      .slice(0, limit)
      .map((r) => r.domain);
  }
  async needingWikidata(limit: number, staleBefore: string) {
    return [...this.rows.values()]
      .filter((r) => !r.wikidataAt || r.wikidataAt < staleBefore)
      .sort((a, b) => (a.wikidataAt ?? "").localeCompare(b.wikidataAt ?? ""))
      .slice(0, limit)
      .map((r) => r.domain);
  }
  async setWikidata(found: Map<string, CompanyFacts>, checked: string[], at: string) {
    for (const d of checked) {
      const r = this.rows.get(d);
      if (r) this.rows.set(d, { ...r, wikidata: found.get(d) ?? null, wikidataAt: at });
    }
  }
  async h1bFor(nameKeys: string[]) {
    return new Map(nameKeys.flatMap((k) => (this.h1b.has(k) ? [[k, this.h1b.get(k)!] as const] : [])));
  }
  async putH1b(rows: (H1bRecord & { nameKey: string; name: string })[], replace: boolean) {
    if (replace) this.h1b.clear();
    for (const r of rows) this.h1b.set(r.nameKey, { filings: r.filings, ...(r.medianWage ? { medianWage: r.medianWage } : {}), fiscalYear: r.fiscalYear, through: r.through });
  }
}

type Row = { domain: string; name: string; name_key: string; sources: string[]; first_seen_at: string; last_seen_at: string; logo: string | null; logo_type: string | null; logo_from: string | null; logo_checked_at: string | null; open_jobs?: number | null; counted_at?: string | null; new_jobs_7d?: number | null; facts?: CompanyRecord["facts"] | null; facts_at?: string | null; h1b?: H1bRecord | null; wikidata?: unknown; wikidata_at?: string | null };
const fromRow = (r: Row): CompanyRecord => ({ domain: r.domain, name: r.name, nameKey: r.name_key, sources: r.sources ?? [], firstSeenAt: r.first_seen_at, lastSeenAt: r.last_seen_at, logo: r.logo && r.logo_type ? { data: r.logo, type: r.logo_type, from: r.logo_from ?? "" } : r.logo_checked_at ? null : undefined, logoCheckedAt: r.logo_checked_at ?? undefined, ...(r.open_jobs != null ? { openJobs: r.open_jobs, countedAt: r.counted_at ?? undefined } : {}), ...(r.new_jobs_7d != null ? { newJobs7d: r.new_jobs_7d } : {}), ...(r.facts ? { facts: r.facts, factsAt: r.facts_at ?? undefined } : {}), ...(r.h1b ? { h1b: r.h1b } : {}), ...(r.wikidata_at ? { wikidata: wikidataOf(r.wikidata), wikidataAt: r.wikidata_at } : {}) });

class SupabaseCompanies implements CompanyStore {
  private sb() {
    const sb = getSupabaseAdmin();
    if (!sb) throw new Error("Supabase is not configured");
    return sb.schema("wonderjobs").from("jobslake_companies");
  }
  async upsert(records: CompanyRecord[]) {
    if (!records.length) return;
    // Sources accumulate: read what's there for these domains, then write the union.
    const { data: existing, error: e1 } = await this.sb().select("domain, sources, first_seen_at").in("domain", records.map((r) => r.domain));
    if (e1) throw new Error(e1.message);
    const old = new Map((existing ?? []).map((r: { domain: string; sources: string[]; first_seen_at: string }) => [r.domain, r]));
    // Counts come only from the daily refresh; a search's upsert leaves them as they were.
    const rows = records.map((r) => ({ domain: r.domain, name: r.name, name_key: r.nameKey, sources: [...new Set([...(old.get(r.domain)?.sources ?? []), ...r.sources])], first_seen_at: old.get(r.domain)?.first_seen_at ?? r.firstSeenAt, last_seen_at: r.lastSeenAt, ...extraCols(r) }));
    const { error } = await this.sb().upsert(rows, { onConflict: "domain" });
    if (error) throw new Error(error.message);
  }
  async byDomain(domain: string) {
    const { data, error } = await this.sb().select("*").eq("domain", domain).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? fromRow(data as Row) : undefined;
  }
  async byName(nameKey: string) {
    const { data, error } = await this.sb().select("*").eq("name_key", nameKey).order("last_seen_at", { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    return data?.[0] ? fromRow(data[0] as Row) : undefined;
  }
  async setLogo(domain: string, logo: CompanyRecord["logo"], checkedAt: string) {
    const { error } = await this.sb().update({ logo: logo?.data ?? null, logo_type: logo?.type ?? null, logo_from: logo?.from ?? null, logo_checked_at: checkedAt }).eq("domain", domain);
    if (error) throw new Error(error.message);
  }
  async needingLogo(limit: number, staleBefore: string) {
    const { data, error } = await this.sb().select("domain").or(`logo_checked_at.is.null,logo_checked_at.lt.${staleBefore}`).order("logo_checked_at", { ascending: true, nullsFirst: true }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: { domain: string }) => r.domain);
  }
  async needingWikidata(limit: number, staleBefore: string) {
    const { data, error } = await this.sb().select("domain").or(`wikidata_at.is.null,wikidata_at.lt.${staleBefore}`).order("wikidata_at", { ascending: true, nullsFirst: true }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: { domain: string }) => r.domain);
  }
  async setWikidata(found: Map<string, CompanyFacts>, checked: string[], at: string) {
    // One update per company: the facts differ for each.
    for (const d of checked) {
      const { error } = await this.sb().update({ wikidata: found.get(d) ?? {}, wikidata_at: at }).eq("domain", d);
      if (error) throw new Error(error.message);
    }
  }
  private h1bTable() {
    return getSupabaseAdmin()!.schema("wonderjobs").from("jobslake_h1b_employers");
  }
  async h1bFor(nameKeys: string[]) {
    const out = new Map<string, H1bRecord>();
    for (let i = 0; i < nameKeys.length; i += 200) {
      const { data, error } = await this.h1bTable().select("name_key, filings, median_wage, fiscal_year, through").in("name_key", nameKeys.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as { name_key: string; filings: number; median_wage: number | null; fiscal_year: number; through: string }[]) out.set(r.name_key, { filings: r.filings, ...(r.median_wage ? { medianWage: r.median_wage } : {}), fiscalYear: r.fiscal_year, through: r.through });
    }
    return out;
  }
  async putH1b(rows: (H1bRecord & { nameKey: string; name: string })[], replace: boolean) {
    this.sb();
    // A new file replaces the last one's totals: rows it no longer names are removed first.
    if (replace) {
      const { error } = await this.h1bTable().delete().neq("name_key", "");
      if (error) throw new Error(error.message);
    }
    const at = new Date().toISOString();
    for (let i = 0; i < rows.length; i += 5000) {
      const { error } = await this.h1bTable().upsert(rows.slice(i, i + 5000).map((r) => ({ name_key: r.nameKey, name: r.name, filings: r.filings, median_wage: r.medianWage ?? null, fiscal_year: r.fiscalYear, through: r.through, loaded_at: at })), { onConflict: "name_key" });
      if (error) throw new Error(error.message);
    }
  }
}

const g = globalThis as unknown as { __companyStore?: CompanyStore };
export function companyStore(): CompanyStore {
  if (!g.__companyStore) g.__companyStore = getSupabaseAdmin() ? new SupabaseCompanies() : new MemoryCompanies();
  return g.__companyStore;
}
/** Tests only. */
export function __setCompanyStore(s: CompanyStore | undefined) {
  g.__companyStore = s;
}
export { MemoryCompanies as __MemoryCompanies };

/** The companies a search's opportunities name, with a domain a source reported or the employer's own apply link shows. */
export function companiesFrom(opps: CanonicalOpportunity[], now = new Date().toISOString()): CompanyRecord[] {
  const out = new Map<string, CompanyRecord>();
  for (const o of opps) {
    const domain = cleanDomain(o.employer.domain) ?? employerDomainOf(o.canonicalApplyUrl, o.applyPath === "employer_site" && o.quality.employerVerified);
    const nameKey = companyKey(o.employer.name);
    if (!domain || !nameKey) continue;
    const sources = o.sourceRecords.map((r) => r.sourceId);
    const prev = out.get(domain);
    const facts = o.employer.facts ?? prev?.facts;
    out.set(domain, { domain, name: o.employer.name, nameKey, sources: [...new Set([...(prev?.sources ?? []), ...sources])], firstSeenAt: now, lastSeenAt: now, ...(facts ? { facts, factsAt: now } : {}) });
  }
  return [...out.values()];
}

export async function recordCompanies(opps: CanonicalOpportunity[]): Promise<void> {
  await companyStore().upsert(companiesFrom(opps));
}

/** Image formats a logo may be. SVG is refused: served from our origin, a script inside one could run. */
function imageType(bytes: Uint8Array): string | undefined {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return "image/x-icon";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return undefined;
}

/** Where a logo is looked for, best first: a 128px icon from Google's favicon service (404 when it has none), then the site's own touch icon. */
export const logoUrls = (domain: string) => [`https://www.google.com/s2/favicons?domain=${domain}&sz=128`, `https://${domain}/apple-touch-icon.png`];

export async function fetchLogo(domain: string, fetcher: typeof fetch): Promise<CompanyRecord["logo"]> {
  for (const url of logoUrls(domain)) {
    try {
      const res = await fetcher(url, { signal: AbortSignal.timeout(4000), redirect: "follow", headers: { accept: "image/png,image/*;q=0.8" } });
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      // Tiny files are placeholders; huge ones aren't icons.
      if (bytes.length < 200 || bytes.length > MAX_LOGO_BYTES) continue;
      const type = imageType(bytes);
      if (type) return { data: Buffer.from(bytes).toString("base64"), type, from: new URL(url).hostname };
    } catch {
      // Unreachable or too slow: try the next place.
    }
  }
  return null;
}

/**
 * The cached logo for a company JobsLake knows — by its domain, else by its name — fetched and stored the
 * first time it's asked for (and again after LOGO_TTL_MS). Undefined when JobsLake doesn't know the
 * company; null when it has no logo.
 */
export async function companyLogo(q: { domain?: string; name?: string }, now = Date.now(), fetcher: typeof fetch = fetch): Promise<{ data: Buffer; type: string } | null | undefined> {
  const store = companyStore();
  const domain = cleanDomain(q.domain);
  const company = (domain ? await store.byDomain(domain) : undefined) ?? (q.name ? await store.byName(companyKey(q.name)) : undefined);
  if (!company) return undefined;
  let logo = company.logo;
  if (logo === undefined || !company.logoCheckedAt || now - Date.parse(company.logoCheckedAt) > LOGO_TTL_MS) {
    logo = await fetchLogo(company.domain, fetcher);
    await store.setLogo(company.domain, logo, new Date(now).toISOString());
  }
  return logo ? { data: Buffer.from(logo.data, "base64"), type: logo.type } : null;
}

/** A company's profile by the domain a source reported, else by its exact (normalized) name; undefined when JobsLake knows nothing. */
export async function companyProfile(q: { domain?: string; name?: string }, store: CompanyStore = companyStore()): Promise<CompanyProfile | undefined> {
  const domain = cleanDomain(q.domain);
  const nameKey = q.name ? companyKey(q.name) : "";
  const r = (domain ? await store.byDomain(domain) : undefined) ?? (nameKey ? await store.byName(nameKey) : undefined);
  const key = r?.nameKey ?? nameKey;
  // The refresh copies H-1B totals onto a company; one it hasn't matched (or reached yet) is looked up by name.
  const h1b = r?.h1b ?? (key ? (await store.h1bFor([key])).get(key) : undefined);
  if (!r && !h1b) return undefined;
  return {
    name: r?.name ?? q.name ?? "",
    ...(r?.facts ? { facts: r.facts } : {}),
    ...(r?.wikidata ? { wikidata: r.wikidata } : {}),
    ...(r?.openJobs !== undefined ? { openJobs: r.openJobs, countedAt: r.countedAt } : {}),
    ...(r?.newJobs7d !== undefined ? { newJobs7d: r.newJobs7d } : {}),
    ...(h1b ? { h1b } : {}),
  };
}
