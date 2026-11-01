/**
 * WorksLake's company directory (`jobslake_companies`): each employer's domain and name as sources reported
 * them, and its logo, fetched once and cached here. Platform-wide public data — no tenant, no user. A logo
 * is only ever fetched for a company recorded from a real posting, never for an arbitrary domain.
 */
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import type { CompanyRatings } from "@/domain/jobslake/ratings";
import { cleanDomain, companyDomain, companyKey, employerDomainOf, briefKey, companyBrief, type CompanyBan, type CompanyBrief, type CompanyFacts, type CompanyProfile, type CompanyRecord, type H1bRecord } from "@/domain/jobslake/companies";
import { getSupabaseAdmin } from "@/server/supabase";

/** A logo, once stored, is kept and never looked for again; only the finding that there is none is retried, after this long. */
export const LOGO_TTL_MS = 30 * 86_400_000;
const MAX_LOGO_BYTES = 200_000;

export interface CompanyStore {
  upsert(records: CompanyRecord[]): Promise<void>;
  byDomain(domain: string): Promise<CompanyRecord | undefined>;
  byName(nameKey: string): Promise<CompanyRecord | undefined>;
  /** Only what serving a logo needs (domain, logo, when it was looked for): by domain, else by name key. Never the facts. */
  logoFor(q: { domain?: string; nameKey?: string }): Promise<Pick<CompanyRecord, "domain" | "logo" | "logoCheckedAt"> | undefined>;
  /** The directory, most open roles first: a page of companies matching `q` (name or domain), and how many match. No logo bytes. */
  list(q: string, limit: number, offset: number, opts?: { missingLogo?: boolean; banned?: boolean }): Promise<{ total: number; rows: CompanyRecord[] }>;
  /** The companies with any of these domains or name keys — facts only, no logos. */
  facts(domains: string[], nameKeys: string[]): Promise<CompanyRecord[]>;
  setLogo(domain: string, logo: CompanyRecord["logo"], checkedAt: string): Promise<void>;
  /** An admin's ban (or, with null, lifting it). False when there's no such company. */
  setBan(domain: string, ban: CompanyBan | null): Promise<boolean>;
  /** Every banned company's domain and name key. */
  bannedList(): Promise<{ domain: string; nameKey: string }[]>;
  /** An admin's choice: replaces (or, with null, clears) a company's logo even when one is stored. */
  replaceLogo(domain: string, logo: CompanyRecord["logo"], checkedAt: string): Promise<boolean>;
  /** Companies whose logo was never looked for, or not since `staleBefore` — oldest first. */
  needingLogo(limit: number, staleBefore: string): Promise<string[]>;
  /** Companies whose Wikidata facts were never looked for, or not since `staleBefore` — oldest first. */
  needingWikidata(limit: number, staleBefore: string): Promise<string[]>;
  /** Companies never looked up for a rating, or not since `staleBefore` — oldest first, with the name a ratings source is asked by. */
  needingRatings(limit: number, staleBefore: string): Promise<{ domain: string; name: string }[]>;
  /** Stores the rating found for each looked-up domain; a domain in `checked` with none is recorded as looked up, none found. */
  setRatings(found: Map<string, CompanyRatings>, checked: string[], at: string): Promise<void>;
  /** How many companies there are, how many have a rating, and how many wait for a lookup. */
  ratingsCoverage(staleBefore: string): Promise<{ companies: number; rated: number; waiting: number }>;
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
  };
}
const wikidataOf = (v: unknown): CompanyFacts | null => (v && typeof v === "object" && "from" in v ? (v as CompanyFacts) : null);
const extraFields = (r: CompanyRecord): Partial<CompanyRecord> => ({
  ...(r.openJobs !== undefined ? { openJobs: r.openJobs, countedAt: r.countedAt } : {}),
  ...(r.newJobs7d !== undefined ? { newJobs7d: r.newJobs7d } : {}),
  ...(r.facts ? { facts: r.facts, factsAt: r.factsAt ?? r.lastSeenAt } : {}),
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
  async setBan(domain: string, ban: CompanyBan | null) {
    const r = this.rows.get(domain);
    if (!r) return false;
    this.rows.set(domain, { ...r, ban });
    return true;
  }
  async bannedList() {
    return [...this.rows.values()].filter((r) => r.ban).map((r) => ({ domain: r.domain, nameKey: r.nameKey }));
  }
  async list(q: string, limit: number, offset: number, opts: { missingLogo?: boolean; banned?: boolean } = {}) {
    const k = q.trim().toLowerCase();
    const all = [...this.rows.values()].filter((r) => (!k || r.domain.includes(k) || r.nameKey.includes(companyKey(k)) || r.name.toLowerCase().includes(k)) && (!opts.missingLogo || !r.logo) && (!opts.banned || !!r.ban));
    all.sort((a, b) => (b.openJobs ?? -1) - (a.openJobs ?? -1) || a.name.localeCompare(b.name));
    return { total: all.length, rows: all.slice(offset, offset + limit).map((r) => ({ ...r, hasLogo: !!r.logo })) };
  }
  async replaceLogo(domain: string, logo: CompanyRecord["logo"], checkedAt: string) {
    const r = this.rows.get(domain);
    if (!r) return false;
    this.rows.set(domain, { ...r, logo, logoCheckedAt: checkedAt });
    return true;
  }
  async facts(domains: string[], nameKeys: string[]) {
    return [...this.rows.values()].filter((r) => domains.includes(r.domain) || nameKeys.includes(r.nameKey));
  }
  async logoFor(q: { domain?: string; nameKey?: string }) {
    const r = (q.domain ? this.rows.get(q.domain) : undefined) ?? (q.nameKey ? await this.byName(q.nameKey) : undefined);
    return r ? { domain: r.domain, logo: r.logo, logoCheckedAt: r.logoCheckedAt } : undefined;
  }
  async byName(nameKey: string) {
    return [...this.rows.values()].filter((r) => r.nameKey === nameKey).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0];
  }
  async setLogo(domain: string, logo: CompanyRecord["logo"], checkedAt: string) {
    const r = this.rows.get(domain);
    if (r && !r.logo) this.rows.set(domain, { ...r, logo, logoCheckedAt: checkedAt });
  }
  async needingLogo(limit: number, staleBefore: string) {
    return [...this.rows.values()]
      .filter((r) => !r.logo && (!r.logoCheckedAt || r.logoCheckedAt < staleBefore))
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
  async needingRatings(limit: number, staleBefore: string) {
    return [...this.rows.values()]
      .filter((r) => !r.ratingsAt || r.ratingsAt < staleBefore)
      .sort((a, b) => (a.ratingsAt ?? "").localeCompare(b.ratingsAt ?? ""))
      .slice(0, limit)
      .map((r) => ({ domain: r.domain, name: r.name }));
  }
  async setRatings(found: Map<string, CompanyRatings>, checked: string[], at: string) {
    for (const d of checked) {
      const r = this.rows.get(d);
      if (r) this.rows.set(d, { ...r, ratings: found.get(d) ?? null, ratingsAt: at });
    }
  }
  async ratingsCoverage(staleBefore: string) {
    const all = [...this.rows.values()];
    return { companies: all.length, rated: all.filter((r) => r.ratings).length, waiting: all.filter((r) => !r.ratingsAt || r.ratingsAt < staleBefore).length };
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

type Row = { domain: string; name: string; name_key: string; sources: string[]; first_seen_at: string; last_seen_at: string; logo: string | null; logo_type: string | null; logo_from: string | null; logo_checked_at: string | null; open_jobs?: number | null; counted_at?: string | null; new_jobs_7d?: number | null; facts?: CompanyRecord["facts"] | null; facts_at?: string | null; wikidata?: unknown; wikidata_at?: string | null; ratings?: CompanyRatings | null; ratings_at?: string | null; banned_at?: string | null; ban_reason?: string | null; banned_by?: string | null };
const fromRow = (r: Row): CompanyRecord => ({ domain: r.domain, name: r.name, nameKey: r.name_key, sources: r.sources ?? [], firstSeenAt: r.first_seen_at, lastSeenAt: r.last_seen_at, logo: r.logo && r.logo_type ? { data: r.logo, type: r.logo_type, from: r.logo_from ?? "" } : r.logo_checked_at ? null : undefined, logoCheckedAt: r.logo_checked_at ?? undefined, ...(r.open_jobs != null ? { openJobs: r.open_jobs, countedAt: r.counted_at ?? undefined } : {}), ...(r.new_jobs_7d != null ? { newJobs7d: r.new_jobs_7d } : {}), ...(r.facts ? { facts: r.facts, factsAt: r.facts_at ?? undefined } : {}), ...(r.wikidata_at ? { wikidata: wikidataOf(r.wikidata), wikidataAt: r.wikidata_at } : {}), ...(r.ratings_at ? { ratings: r.ratings ?? null, ratingsAt: r.ratings_at } : {}), ...(r.banned_at ? { ban: { at: r.banned_at, reason: r.ban_reason ?? "", by: r.banned_by ?? "" } } : {}) });

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
  async setBan(domain: string, ban: CompanyBan | null) {
    const { data, error } = await this.sb().update({ banned_at: ban?.at ?? null, ban_reason: ban?.reason ?? null, banned_by: ban?.by ?? null }).eq("domain", domain).select("domain");
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
  }
  async bannedList() {
    const { data, error } = await this.sb().select("domain, name_key").not("banned_at", "is", null).limit(5000);
    // Before migration 0046, nothing can be banned.
    if (error?.code === "42703") return [];
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ domain: String(r.domain), nameKey: String(r.name_key) }));
  }
  async list(q: string, limit: number, offset: number, opts: { missingLogo?: boolean; banned?: boolean } = {}) {
    const base = "domain, name, name_key, sources, first_seen_at, last_seen_at, logo_type, logo_checked_at, open_jobs, counted_at, new_jobs_7d, facts, facts_at, wikidata, wikidata_at, ratings, ratings_at";
    // Only the characters a name or domain has go into the filter (it is a PostgREST expression).
    const k = q.trim().toLowerCase().replace(/[^a-z0-9 .\-&']/g, "").slice(0, 80);
    const run = (withBans: boolean) => {
      let query = this.sb().select(withBans ? `${base}, banned_at, ban_reason, banned_by` : base, { count: "exact" });
      if (k) query = query.or(`domain.ilike.%${k}%,name.ilike.%${k}%`);
      if (opts.missingLogo) query = query.is("logo_type", null);
      if (opts.banned && withBans) query = query.not("banned_at", "is", null);
      return query.order("open_jobs", { ascending: false, nullsFirst: false }).order("name", { ascending: true }).range(offset, offset + limit - 1);
    };
    let { data, error, count } = await run(true);
    // Before migration 0046 adds the ban columns, the directory still lists (with nothing banned).
    if (error?.code === "42703") {
      if (opts.banned) return { total: 0, rows: [] };
      ({ data, error, count } = await run(false));
    }
    if (error) throw new Error(error.message);
    return { total: count ?? 0, rows: (data ?? []).map((r) => ({ ...fromRow({ logo: null, logo_from: null, ...(r as object), logo_type: null } as Row), hasLogo: !!(r as { logo_type?: string | null }).logo_type })) };
  }
  async replaceLogo(domain: string, logo: CompanyRecord["logo"], checkedAt: string) {
    const { data, error } = await this.sb().update({ logo: logo?.data ?? null, logo_type: logo?.type ?? null, logo_from: logo?.from ?? null, logo_checked_at: checkedAt }).eq("domain", domain).select("domain");
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
  }
  async facts(domains: string[], nameKeys: string[]) {
    const cols = "domain, name, name_key, sources, first_seen_at, last_seen_at, logo_checked_at, facts, wikidata, wikidata_at, ratings, ratings_at";
    const [a, b] = await Promise.all([
      domains.length ? this.sb().select(cols).in("domain", domains) : Promise.resolve({ data: [], error: null }),
      nameKeys.length ? this.sb().select(cols).in("name_key", nameKeys) : Promise.resolve({ data: [], error: null }),
    ]);
    if (a.error || b.error) throw new Error((a.error ?? b.error)!.message);
    return [...(a.data ?? []), ...(b.data ?? [])].map((r) => fromRow({ logo: null, logo_type: null, logo_from: null, ...(r as object) } as Row));
  }
  async logoFor(q: { domain?: string; nameKey?: string }) {
    const cols = "domain, logo, logo_type, logo_from, logo_checked_at";
    const pick = (r: Partial<Row> | null | undefined) => (r ? fromRow({ name: "", name_key: "", sources: [], first_seen_at: "", last_seen_at: "", ...r } as Row) : undefined);
    if (q.domain) {
      const { data, error } = await this.sb().select(cols).eq("domain", q.domain).maybeSingle();
      if (error) throw new Error(error.message);
      if (data) return pick(data as Partial<Row>);
    }
    if (!q.nameKey) return undefined;
    const { data, error } = await this.sb().select(cols).eq("name_key", q.nameKey).order("last_seen_at", { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    return pick(data?.[0] as Partial<Row> | undefined);
  }
  async byName(nameKey: string) {
    const { data, error } = await this.sb().select("*").eq("name_key", nameKey).order("last_seen_at", { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    return data?.[0] ? fromRow(data[0] as Row) : undefined;
  }
  async setLogo(domain: string, logo: CompanyRecord["logo"], checkedAt: string) {
    const { error } = await this.sb().update({ logo: logo?.data ?? null, logo_type: logo?.type ?? null, logo_from: logo?.from ?? null, logo_checked_at: checkedAt }).eq("domain", domain).is("logo", null);
    if (error) throw new Error(error.message);
  }
  async needingLogo(limit: number, staleBefore: string) {
    const { data, error } = await this.sb().select("domain").is("logo", null).or(`logo_checked_at.is.null,logo_checked_at.lt.${staleBefore}`).order("logo_checked_at", { ascending: true, nullsFirst: true }).limit(limit);
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
  async needingRatings(limit: number, staleBefore: string) {
    const { data, error } = await this.sb().select("domain, name").or(`ratings_at.is.null,ratings_at.lt.${staleBefore}`).order("ratings_at", { ascending: true, nullsFirst: true }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as { domain: string; name: string }[];
  }
  async setRatings(found: Map<string, CompanyRatings>, checked: string[], at: string) {
    // One update per company: the ratings differ for each.
    for (const d of checked) {
      const { error } = await this.sb().update({ ratings: found.get(d) ?? null, ratings_at: at }).eq("domain", d);
      if (error) throw new Error(error.message);
    }
  }
  async ratingsCoverage(staleBefore: string) {
    const count = async (f: (q: ReturnType<SupabaseCompanies["sb"]>) => unknown) => {
      const { count: n, error } = (await f(this.sb())) as { count: number | null; error: { message: string } | null };
      if (error) throw new Error(error.message);
      return n ?? 0;
    };
    const [companies, rated, waiting] = await Promise.all([
      count((q) => q.select("domain", { count: "exact", head: true })),
      count((q) => q.select("domain", { count: "exact", head: true }).not("ratings", "is", null)),
      count((q) => q.select("domain", { count: "exact", head: true }).or(`ratings_at.is.null,ratings_at.lt.${staleBefore}`)),
    ]);
    return { companies, rated, waiting };
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
  LOGO_CACHE.clear();
}
export { MemoryCompanies as __MemoryCompanies };

/** The companies a search's opportunities name, with a domain a source reported or the employer's own apply link shows. */
export function companiesFrom(opps: CanonicalOpportunity[], now = new Date().toISOString()): CompanyRecord[] {
  const out = new Map<string, CompanyRecord>();
  for (const o of opps) {
    const domain = companyDomain(o.employer.domain) ?? companyDomain(employerDomainOf(o.canonicalApplyUrl, o.applyPath === "employer_site" && o.quality.employerVerified));
    // An event with no organiser named is its own poster: it is recorded under its own site and title.
    const name = o.employer.name?.trim() || (o.kind === "event" ? o.title : "");
    const nameKey = companyKey(name);
    if (!domain || !nameKey) continue;
    const sources = o.sourceRecords.map((r) => r.sourceId);
    const prev = out.get(domain);
    out.set(domain, { domain, name, nameKey, sources: [...new Set([...(prev?.sources ?? []), ...sources])], firstSeenAt: now, lastSeenAt: now });
  }
  return [...out.values()];
}

/**
 * Facts a source reported about companies (TheirStack's `company_object`), written to the company directory —
 * the one place they're kept. A company is identified by the domain the source reported, as everywhere here.
 */
export async function recordCompanyFacts(items: { domain: string; name: string; facts: CompanyFacts; source: string }[], store: CompanyStore = companyStore()): Promise<void> {
  const now = new Date().toISOString();
  const by = new Map<string, CompanyRecord>();
  for (const i of items) {
    const domain = companyDomain(i.domain);
    const nameKey = companyKey(i.name);
    if (domain && nameKey) by.set(domain, { domain, name: i.name, nameKey, sources: [i.source], firstSeenAt: now, lastSeenAt: now, facts: i.facts, factsAt: now });
  }
  if (by.size) await store.upsert([...by.values()]);
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

/**
 * Where a logo is looked for, best first (researched 2026-11-01 against real misses):
 * 1. Google's favicon service by the site's URL (`faviconV2`): it follows the site to its real host (tiaa.org →
 *    www.tiaa.org), which the older `s2/favicons?domain=` endpoint doesn't (404 for tiaa.org); 404 when it has none.
 * 2. The older endpoint for the www host, for sites only indexed there.
 * 3. DuckDuckGo's icon service (404 when it has none).
 * Then the site's own files (`fetchLogo`), then the company's logo on Wikimedia Commons via Wikidata.
 */
export const logoUrls = (domain: string) => [
  `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(`https://${domain}`)}&size=128`,
  `https://www.google.com/s2/favicons?domain=www.${domain}&sz=128`,
  `https://icons.duckduckgo.com/ip3/${domain}.ico`,
];

/** The site's own icon files, on the bare host and on www (many sites answer only on one of them). */
export const siteIconUrls = (domain: string) => [`https://${domain}`, `https://www.${domain}`].flatMap((h) => [`${h}/apple-touch-icon.png`, `${h}/favicon.ico`]);

const UA = "WorksLake/1.0 (+https://jobs.wonderapps.biz)";

/**
 * The company's logo on Wikimedia Commons, from its Wikidata item's logo (P154), as a 128-px-wide PNG Commons renders
 * (an SVG logo is never served as SVG). Only for a company whose Wikidata item WorksLake matched by its website.
 */
export async function wikidataLogo(qid: string, fetcher: typeof fetch): Promise<CompanyRecord["logo"] | undefined> {
  if (!/^Q\d{1,12}$/.test(qid)) return undefined;
  try {
    const res = await fetcher(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${qid}&property=P154&format=json`, { signal: AbortSignal.timeout(4000), headers: { "user-agent": UA, accept: "application/json" } });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { claims?: { P154?: { mainsnak?: { datavalue?: { value?: unknown } } }[] } };
    const file = body.claims?.P154?.map((c) => c.mainsnak?.datavalue?.value).find((v): v is string => typeof v === "string" && v.length < 250);
    return file ? await imageFrom(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=128`, fetcher) : undefined;
  } catch {
    return undefined;
  }
}

/** The icon links a home page declares (apple-touch-icon and icon), on the company's own domain only, largest declared first. */
export function iconLinks(html: string, pageUrl: string, domain: string): string[] {
  const out: { url: string; size: number; touch: boolean }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (n: string) => new RegExp(`\\b${n}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
    const rel = attr("rel")?.toLowerCase() ?? "";
    const href = attr("href");
    if (!href || !/\bicon\b|apple-touch-icon/.test(rel)) continue;
    try {
      const u = new URL(href, pageUrl);
      // Only the company's own site: a page can't point the server at another host.
      if (!/^https?:$/.test(u.protocol) || cleanDomain(u.hostname) !== domain) continue;
      out.push({ url: u.toString(), size: Number(/(\d+)x\d+/.exec(attr("sizes") ?? "")?.[1] ?? 0), touch: rel.includes("apple-touch-icon") });
    } catch {
      // A malformed link: skip it.
    }
  }
  return out.sort((a, b) => Number(b.touch) - Number(a.touch) || b.size - a.size).map((x) => x.url);
}

async function imageFrom(url: string, fetcher: typeof fetch, dead?: Set<string>): Promise<CompanyRecord["logo"] | undefined> {
  const host = new URL(url).hostname;
  if (dead?.has(host)) return undefined;
  try {
    const res = await fetcher(url, { signal: AbortSignal.timeout(4000), redirect: "follow", headers: { accept: "image/png,image/*;q=0.8", "user-agent": UA } });
    if (!res.ok) return undefined;
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Tiny files are placeholders; huge ones aren't icons.
    if (bytes.length < 200 || bytes.length > MAX_LOGO_BYTES) return undefined;
    const type = imageType(bytes);
    return type ? { data: Buffer.from(bytes).toString("base64"), type, from: new URL(url).hostname } : undefined;
  } catch {
    // Unreachable or too slow: try the next place, and don't wait on this host again for this company.
    dead?.add(host);
    return undefined;
  }
}

export async function fetchLogo(domain: string, fetcher: typeof fetch, opts: { wikidataId?: string } = {}): Promise<CompanyRecord["logo"]> {
  // A host that didn't answer once (no DNS, a timeout) isn't asked again for this company, so a dead site costs one wait.
  const dead = new Set<string>();
  for (const url of [...logoUrls(domain), ...siteIconUrls(domain)]) {
    const logo = await imageFrom(url, fetcher, dead);
    if (logo) return logo;
  }
  // The icons the company's own home page declares (many sites serve none at the standard paths), bare host then www.
  for (const page of [`https://${domain}/`, `https://www.${domain}/`]) {
    if (dead.has(new URL(page).hostname)) continue;
    try {
      const res = await fetcher(page, { signal: AbortSignal.timeout(4000), redirect: "follow", headers: { accept: "text/html", "user-agent": UA } });
      if (!res.ok) continue;
      const html = (await res.text()).slice(0, 200_000);
      for (const url of iconLinks(html, res.url || page, domain).slice(0, 3)) {
        const logo = await imageFrom(url, fetcher, dead);
        if (logo) return logo;
      }
      break;
    } catch {
      // No answer on this host: try the other.
    }
  }
  // Last: the company's own logo on Wikimedia Commons, when WorksLake knows its Wikidata item.
  return (opts.wikidataId ? await wikidataLogo(opts.wikidataId, fetcher) : undefined) ?? null;
}

/**
 * Logos already served, kept in this instance's memory so a page of cards doesn't read the directory once per card: a
 * company logo is public and shared by every module, never tenant data. Bounded (entries and bytes) and short-lived,
 * and dropped the moment an admin changes that company's logo.
 */
const LOGO_CACHE = new Map<string, { at: number; domain: string; logo: { data: Buffer; type: string } }>();
const LOGO_CACHE_MS = 10 * 60_000;
const LOGO_CACHE_MAX = 500;
const LOGO_CACHE_BYTES = 12_000_000;
let logoCacheBytes = 0;
function cacheLogo(keys: string[], domain: string, logo: { data: Buffer; type: string }, now: number) {
  for (const k of keys) {
    const old = LOGO_CACHE.get(k);
    if (old) logoCacheBytes -= old.logo.data.length;
    LOGO_CACHE.set(k, { at: now, domain, logo });
    logoCacheBytes += logo.data.length;
  }
  for (const [k, v] of LOGO_CACHE) {
    if (LOGO_CACHE.size <= LOGO_CACHE_MAX && logoCacheBytes <= LOGO_CACHE_BYTES) break;
    LOGO_CACHE.delete(k);
    logoCacheBytes -= v.logo.data.length;
  }
}
function forgetLogo(domain: string) {
  for (const [k, v] of LOGO_CACHE) if (v.domain === domain) { LOGO_CACHE.delete(k); logoCacheBytes -= v.logo.data.length; }
}

/**
 * The cached logo for a company WorksLake knows — by its domain, else by its name — from the one company directory every
 * module shares, so a company is stored and fetched once however many modules show it. Looked for the first time it's
 * asked for (and again after LOGO_TTL_MS) when the directory refresh hasn't already. Undefined when WorksLake doesn't
 * know the company; null when it has no logo.
 */
export async function companyLogo(q: { domain?: string; name?: string }, now = Date.now(), fetcher: typeof fetch = fetch): Promise<{ data: Buffer; type: string } | null | undefined> {
  const domain = cleanDomain(q.domain);
  const nameKey = q.name ? companyKey(q.name) : "";
  const keys = [...(domain ? [`d:${domain}`] : []), ...(nameKey ? [`n:${nameKey}`] : [])];
  for (const k of keys) {
    const hit = LOGO_CACHE.get(k);
    if (hit && now - hit.at < LOGO_CACHE_MS) return hit.logo;
  }
  const store = companyStore();
  const company = (domain ? await store.logoFor({ domain }) : undefined) ?? (nameKey ? await store.logoFor({ nameKey }) : undefined);
  if (!company) return undefined;
  let logo = company.logo;
  if (!logo && (logo === undefined || !company.logoCheckedAt || now - Date.parse(company.logoCheckedAt) > LOGO_TTL_MS)) {
    logo = await fetchLogo(company.domain, fetcher);
    await store.setLogo(company.domain, logo, new Date(now).toISOString());
  }
  if (!logo) return null;
  const served = { data: Buffer.from(logo.data, "base64"), type: logo.type };
  cacheLogo([...keys, `d:${company.domain}`], company.domain, served, now);
  return served;
}

/** A company's profile by the domain a source reported, else by its exact (normalized) name; undefined when WorksLake knows nothing. */
export async function companyProfile(q: { domain?: string; name?: string }, store: CompanyStore = companyStore()): Promise<CompanyProfile | undefined> {
  const domain = cleanDomain(q.domain);
  const nameKey = q.name ? companyKey(q.name) : "";
  const r = (domain ? await store.byDomain(domain) : undefined) ?? (nameKey ? await store.byName(nameKey) : undefined);
  const key = r?.nameKey ?? nameKey;
  // H-1B totals live only in the Department of Labor table, read here by the company's name key.
  const h1b = key ? (await store.h1bFor([key])).get(key) : undefined;
  if (!r && !h1b) return undefined;
  return {
    name: r?.name ?? q.name ?? "",
    ...(r?.facts ? { facts: r.facts } : {}),
    ...(r?.wikidata ? { wikidata: r.wikidata } : {}),
    ...(r?.ratings ? { ratings: r.ratings, ratingsAt: r.ratingsAt } : {}),
    ...(r?.openJobs !== undefined ? { openJobs: r.openJobs, countedAt: r.countedAt } : {}),
    ...(r?.newJobs7d !== undefined ? { newJobs7d: r.newJobs7d } : {}),
    ...(h1b ? { h1b } : {}),
  };
}

/**
 * What a job card shows about each of a page's companies (size, H-1B filings), in one read of each table:
 * by the domain a source reported, else by exact (normalized) name. Keyed as asked; a company with neither is absent.
 */
export async function companyBriefs(qs: { d?: string; n: string }[], store: CompanyStore = companyStore()): Promise<Record<string, CompanyBrief>> {
  const asks = qs.slice(0, 60).map((q) => ({ key: briefKey(q), domain: cleanDomain(q.d), nameKey: companyKey(q.n ?? "") }));
  const rows = await store.facts([...new Set(asks.flatMap((a) => (a.domain ? [a.domain] : [])))], [...new Set(asks.flatMap((a) => (a.nameKey ? [a.nameKey] : [])))]);
  const byDomain = new Map(rows.map((r) => [r.domain, r]));
  const byName = new Map(rows.map((r) => [r.nameKey, r]));
  const found = asks.map((a) => ({ ...a, r: (a.domain ? byDomain.get(a.domain) : undefined) ?? (a.nameKey ? byName.get(a.nameKey) : undefined) }));
  const h1b = await store.h1bFor([...new Set(found.map((f) => f.r?.nameKey ?? f.nameKey).filter(Boolean))]);
  const out: Record<string, CompanyBrief> = {};
  for (const f of found) {
    const b = companyBrief({ name: "", ...(f.r?.facts ? { facts: f.r.facts } : {}), ...(f.r?.wikidata ? { wikidata: f.r.wikidata } : {}), ...(f.r?.ratings ? { ratings: f.r.ratings, ratingsAt: f.r.ratingsAt } : {}), ...(h1b.get(f.r?.nameKey ?? f.nameKey) ? { h1b: h1b.get(f.r?.nameKey ?? f.nameKey) } : {}) });
    if (b.size || b.h1b || b.rating) out[f.key] = b;
  }
  return out;
}

/** One company in the admin directory: its record's facts and counts, and its H-1B totals. */
export interface DirectoryCompany {
  domain: string;
  name: string;
  sources: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  logoChecked: boolean;
  /** Whether a logo is stored for it. */
  hasLogo: boolean;
  openJobs?: number;
  newJobs7d?: number;
  countedAt?: string;
  facts?: CompanyFacts;
  factsAt?: string;
  wikidata?: CompanyFacts | null;
  wikidataAt?: string;
  ratings?: CompanyRatings | null;
  ratingsAt?: string;
  h1b?: H1bRecord;
  /** An admin's ban: its listings are left out of every module's searches. */
  ban?: CompanyBan;
}

/** The admin Companies page: one page of the directory, each company with its H-1B totals read from their own table. */
export async function companyDirectory(q: string, limit: number, offset: number, store: CompanyStore = companyStore(), opts: { missingLogo?: boolean; banned?: boolean } = {}): Promise<{ total: number; missingLogos: number; banned: number; companies: DirectoryCompany[] }> {
  const { total, rows } = await store.list(q, limit, offset, opts);
  const [missingLogos, banned] = await Promise.all([opts.missingLogo && !opts.banned ? total : store.list(q, 1, 0, { missingLogo: true }).then((x) => x.total), opts.banned && !opts.missingLogo ? total : store.list(q, 1, 0, { banned: true }).then((x) => x.total)]);
  const h1b = await store.h1bFor([...new Set(rows.map((r) => r.nameKey))]);
  return {
    total,
    missingLogos,
    banned,
    companies: rows.map((r) => ({
      ...(r.ban ? { ban: r.ban } : {}),
      domain: r.domain,
      name: r.name,
      sources: r.sources,
      firstSeenAt: r.firstSeenAt,
      lastSeenAt: r.lastSeenAt,
      logoChecked: !!r.logoCheckedAt,
      hasLogo: !!r.hasLogo,
      ...(r.openJobs !== undefined ? { openJobs: r.openJobs, countedAt: r.countedAt } : {}),
      ...(r.newJobs7d !== undefined ? { newJobs7d: r.newJobs7d } : {}),
      ...(r.facts ? { facts: r.facts, factsAt: r.factsAt } : {}),
      ...(r.wikidata !== undefined ? { wikidata: r.wikidata, wikidataAt: r.wikidataAt } : {}),
      ...(r.ratingsAt ? { ratings: r.ratings ?? null, ratingsAt: r.ratingsAt } : {}),
      ...(h1b.get(r.nameKey) ? { h1b: h1b.get(r.nameKey) } : {}),
    })),
  };
}


/** Logo files an admin may upload, by what their first bytes say they are (the declared type must agree). */
const LOGO_MAGIC: [string, (b: Buffer) => boolean][] = [
  ["image/png", (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47],
  ["image/jpeg", (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/gif", (b) => b.length > 6 && b.toString("ascii", 0, 3) === "GIF"],
  ["image/webp", (b) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP"],
  ["image/x-icon", (b) => b.length > 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0],
];
const MAX_UPLOAD_BYTES = 256 * 1024;

/**
 * An admin's logo change for one company or event poster: fetch it again from its site, upload a file (PNG, JPEG, GIF,
 * WebP or ICO, at most 256 KB, checked by its own bytes; never SVG), or remove a wrong one. Returns what happened.
 */
export async function adminLogo(
  domain: string,
  action: { kind: "refetch" } | { kind: "upload"; type: string; base64: string } | { kind: "clear" },
  now = Date.now(),
  fetcher: typeof fetch = fetch,
  store: CompanyStore = companyStore(),
): Promise<{ ok: boolean; message: string }> {
  const d = cleanDomain(domain);
  const record = d ? await store.byDomain(d) : undefined;
  if (!d || !record) return { ok: false, message: "No such company in the directory." };
  const at = new Date(now).toISOString();
  forgetLogo(d);
  if (action.kind === "clear") {
    await store.replaceLogo(d, null, at);
    return { ok: true, message: "Logo removed. Cards show the initial until a new one is set." };
  }
  if (action.kind === "refetch") {
    const logo = await fetchLogo(d, fetcher, { wikidataId: record.wikidata?.sourceId });
    if (!logo) return { ok: false, message: `No logo found for ${d} (Google, DuckDuckGo, its own site${record.wikidata?.sourceId ? ", Wikidata" : ""}). Upload one instead.` };
    await store.replaceLogo(d, logo, at);
    return { ok: true, message: `Logo fetched from ${d}.` };
  }
  const bytes = Buffer.from(action.base64, "base64");
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) return { ok: false, message: "The file must be under 256 KB." };
  const kind = LOGO_MAGIC.find(([, test]) => test(bytes))?.[0];
  if (!kind || kind !== action.type) return { ok: false, message: "Upload a PNG, JPEG, GIF, WebP or ICO image (its contents must match its type)." };
  await store.replaceLogo(d, { data: bytes.toString("base64"), type: kind, from: "admin upload" }, at);
  return { ok: true, message: "Logo uploaded." };
}

/**
 * An admin's "Fetch all missing logos": looks again for every company or event poster still without a logo, however
 * recently it was last looked for, within a time budget. Each pass skips the ones already looked for since `since`
 * (the moment the admin pressed), so the page can call it again until nothing is left to try. Returns how many were
 * looked for and found in this pass, how many are left to try, and how many still have no logo.
 */
export async function fetchMissingLogos(
  since: string,
  opts: { budgetMs?: number; concurrency?: number; limit?: number; fetcher?: typeof fetch; store?: CompanyStore } = {},
): Promise<{ checked: number; found: number; remaining: number; missing: number }> {
  const store = opts.store ?? companyStore();
  const startedAt = Date.now();
  const budget = opts.budgetMs ?? 40_000;
  const queue = await store.needingLogo(opts.limit ?? 120, since);
  const qids = new Map((await store.facts(queue, [])).flatMap((r) => (r.wikidata?.sourceId ? [[r.domain, r.wikidata.sourceId] as const] : [])));
  let checked = 0;
  let found = 0;
  await Promise.all(
    Array.from({ length: Math.min(opts.concurrency ?? 8, queue.length) }, async () => {
      for (let d = queue.shift(); d; d = queue.shift()) {
        if (Date.now() - startedAt > budget) return;
        const logo = await fetchLogo(d, opts.fetcher ?? fetch, { wikidataId: qids.get(d) });
        await store.setLogo(d, logo, new Date().toISOString());
        checked++;
        if (logo) found++;
      }
    }),
  );
  const [left, all] = await Promise.all([store.needingLogo(500, since), store.list("", 1, 0, { missingLogo: true })]);
  return { checked, found, remaining: left.length, missing: all.total };
}

/**
 * Banned companies, for search to leave out (owner, 2026-11-01): by domain, and by name key for listings that name no
 * domain. Read at most once a minute per instance (bans are rare; a ban made here clears it at once).
 */
let bannedCache: { at: number; domains: Set<string>; names: Set<string> } | null = null;
export async function bannedCompanies(now = Date.now(), store: CompanyStore = companyStore()): Promise<{ domains: Set<string>; names: Set<string> }> {
  if (bannedCache && now - bannedCache.at < 60_000) return bannedCache;
  const list = await store.bannedList();
  bannedCache = { at: now, domains: new Set(list.map((b) => b.domain)), names: new Set(list.map((b) => b.nameKey).filter(Boolean)) };
  return bannedCache;
}

/** Whether a listing is a banned company's: by its domain when it names one, else by its exact (normalized) name. */
export function isBannedListing(o: CanonicalOpportunity, banned: { domains: Set<string>; names: Set<string> }): boolean {
  if (!banned.domains.size && !banned.names.size) return false;
  const domain = companyDomain(o.employer.domain) ?? companyDomain(employerDomainOf(o.canonicalApplyUrl, o.applyPath === "employer_site" && o.quality.employerVerified));
  if (domain) return banned.domains.has(domain);
  const key = companyKey(o.employer.name ?? "");
  return !!key && banned.names.has(key);
}

/** An admin bans a company (with a reason) or lifts the ban. Returns what happened, in words. */
export async function adminBan(domain: string, action: { ban: true; reason: string } | { ban: false }, actor: string, now = Date.now(), store: CompanyStore = companyStore()): Promise<{ ok: boolean; message: string }> {
  const d = cleanDomain(domain);
  if (!d) return { ok: false, message: "No such company in the directory." };
  if (action.ban && action.reason.trim().length < 3) return { ok: false, message: "Say why it's banned (at least a few words)." };
  const ok = await store.setBan(d, action.ban ? { at: new Date(now).toISOString(), reason: action.reason.trim().slice(0, 300), by: actor.slice(0, 200) } : null);
  bannedCache = null;
  if (!ok) return { ok: false, message: "No such company in the directory." };
  return { ok: true, message: action.ban ? `${d} is banned: its listings are left out of every module's searches.` : `${d} is no longer banned.` };
}
