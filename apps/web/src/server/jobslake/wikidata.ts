/**
 * Company facts from Wikidata (CC0, wikidata.org): employees (with the year they're from), founded, headquarters,
 * industry, stock listing and revenue, for companies whose official website (P856) is the domain JobsLake recorded
 * from their postings. A company is matched only by that website; one with no item gets nothing. `wikidataWebsites`
 * goes the other way for postings that name no domain: an exact-name organization with one official website.
 */
import { cleanDomain, companyKey, employerDomainOf, type CompanyFacts } from "@/domain/jobslake/companies";

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "WonderJobs/1.0 (https://jobs.wonderapps.biz; company facts for job seekers)";

type Binding = Record<string, { value: string } | undefined>;

/** The forms an official-website statement takes for a domain. */
function sitesFor(domain: string): string[] {
  return ["https://", "http://"].flatMap((p) => [`${p}${domain}`, `${p}${domain}/`, `${p}www.${domain}`, `${p}www.${domain}/`]);
}

async function sparql(query: string, fetcher: typeof fetch, retry = true): Promise<Binding[]> {
  // POST: forty companies' website forms make a query too long for a URL.
  const res = await fetcher(ENDPOINT, { method: "POST", headers: { accept: "application/sparql-results+json", "content-type": "application/x-www-form-urlencoded", "user-agent": UA }, body: new URLSearchParams({ query }).toString(), signal: AbortSignal.timeout(25_000) });
  // Rate limited or briefly down: once more after a pause (Retry-After, at most 10 s).
  if (retry && (res.status === 429 || res.status >= 500)) {
    await new Promise((r) => setTimeout(r, Math.min(10, Number(res.headers.get("retry-after")) || 2) * 1000));
    return sparql(query, fetcher, false);
  }
  if (!res.ok) throw new Error(`Wikidata answered ${res.status}`);
  const json = (await res.json()) as { results?: { bindings?: Binding[] } };
  return json.results?.bindings ?? [];
}

const year = (v?: string) => (v && /^\d{4}-/.test(v) ? Number(v.slice(0, 4)) : undefined);
const qid = (v?: string) => v?.split("/").pop();
const clean = (v?: string) => (v && v.length <= 80 && !/^Q\d+$/.test(v) && !/^https?:/.test(v) ? v : undefined);

/** Facts per domain for up to ~40 domains in three small queries; domains with no Wikidata item are absent. */
export async function wikidataFacts(domains: string[], fetcher: typeof fetch = fetch): Promise<Map<string, CompanyFacts>> {
  const siteToDomain = new Map(domains.flatMap((d) => sitesFor(d).map((s) => [s, d] as const)));
  const values = [...siteToDomain.keys()].map((s) => `<${s}>`).join(" ");
  const head = `VALUES ?site { ${values} } ?item wdt:P856 ?site .`;
  const label = `SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }`;
  // One query at a time: Wikidata's service limits each client's parallel queries.
  const [base, staff, money] = [
    await sparql(`SELECT ?site ?item ?inception ?hqLabel ?countryLabel ?industryLabel ?ticker ?exchangeLabel WHERE { ${head} OPTIONAL{?item wdt:P571 ?inception} OPTIONAL{?item wdt:P159 ?hq} OPTIONAL{?item wdt:P17 ?country} OPTIONAL{?item wdt:P452 ?industry} OPTIONAL{?item p:P414 ?st . ?st ps:P414 ?exchange . ?st pq:P249 ?ticker . FILTER NOT EXISTS { ?st pq:P582 ?ended }} ${label} }`, fetcher),
    await sparql(`SELECT ?site ?item ?employees ?at WHERE { ${head} ?item p:P1128 ?s . ?s ps:P1128 ?employees . FILTER NOT EXISTS { ?s wikibase:rank wikibase:DeprecatedRank } OPTIONAL{?s pq:P585 ?at} }`, fetcher),
    await sparql(`SELECT ?site ?item ?revenue ?unitLabel ?at WHERE { ${head} ?item p:P2139 ?s . ?s psv:P2139 ?v . ?v wikibase:quantityAmount ?revenue ; wikibase:quantityUnit ?unit . FILTER NOT EXISTS { ?s wikibase:rank wikibase:DeprecatedRank } OPTIONAL{?s pq:P585 ?at} ${label} }`, fetcher),
  ];

  // Several items can name one website (a company and its listing, say); their facts are merged below.
  const items = new Map<string, { domain: string; f: CompanyFacts }>();
  const get = (b: Binding) => {
    const id = qid(b.item?.value);
    const domain = siteToDomain.get(b.site?.value ?? "");
    if (!id || !domain) return undefined;
    if (!items.has(id)) items.set(id, { domain, f: { sourceId: id, from: "Wikidata" } });
    return items.get(id)!.f;
  };
  for (const b of base) {
    const f = get(b);
    if (!f) continue;
    f.founded ??= year(b.inception?.value);
    f.hqCity ??= clean(b.hqLabel?.value);
    f.hqCountry ??= clean(b.countryLabel?.value);
    f.industry ??= clean(b.industryLabel?.value);
    if (!f.ticker && clean(b.ticker?.value)) Object.assign(f, { ticker: b.ticker!.value, exchange: clean(b.exchangeLabel?.value) });
  }
  // The latest dated figure; an undated one (often years old) is never shown.
  const latest = <T>(rows: Binding[], pick: (b: Binding) => T | undefined, set: (f: CompanyFacts, v: T, at?: number) => void, has: (f: CompanyFacts) => number | undefined) => {
    for (const b of rows) {
      const f = get(b);
      const v = pick(b);
      if (!f || v === undefined) continue;
      const at = year(b.at?.value);
      if (!at) continue;
      const prev = has(f);
      if (prev === undefined || (at ?? 0) > prev) set(f, v, at);
    }
  };
  const asOf = new WeakMap<CompanyFacts, number>();
  latest(staff, (b) => { const n = Math.round(Number(b.employees?.value)); return n > 0 ? n : undefined; }, (f, v, at) => { f.employees = v; if (at) f.employeesAsOf = at; else delete f.employeesAsOf; asOf.set(f, at ?? 0); }, (f) => (f.employees === undefined ? undefined : (asOf.get(f) ?? 0)));
  const revAt = new WeakMap<CompanyFacts, number>();
  latest(money, (b) => { const n = Number(b.revenue?.value); const c = clean(b.unitLabel?.value); return n > 0 && c ? { amount: n, currency: c } : undefined; }, (f, v, at) => { f.revenue = { ...v, ...(at ? { year: at } : {}) }; revAt.set(f, at ?? 0); }, (f) => (f.revenue === undefined ? undefined : (revAt.get(f) ?? 0)));

  // The richest item leads; the others for the same website fill only what it lacks.
  const out = new Map<string, CompanyFacts>();
  const size = (f: CompanyFacts) => Object.values(f).filter((v) => v !== undefined).length;
  for (const { domain, f } of [...items.values()].sort((a, b) => size(b.f) - size(a.f))) {
    for (const k of Object.keys(f) as (keyof CompanyFacts)[]) if (f[k] === undefined) delete f[k];
    const lead = out.get(domain);
    if (!lead) out.set(domain, f);
    else for (const [k, v] of Object.entries(f)) if (!(k in lead) && !(k === "employeesAsOf" && "employees" in lead)) Object.assign(lead, { [k]: v });
  }
  for (const [d, f] of out) if (size(f) <= 2) out.delete(d);
  return out;
}

const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"@en`;

/**
 * The official website of companies whose postings name none: an organization on Wikidata whose English label is
 * the company's name exactly (same normalized name), with one official website, not dissolved. A name that more
 * than one item, or one item with several sites, answers differently is left out — never guessed.
 * Returns domain by normalized name; names with no such item are absent.
 */
export async function wikidataWebsites(names: string[], fetcher: typeof fetch = fetch): Promise<Map<string, { domain: string; sourceId: string }>> {
  const wanted = new Map<string, string>();
  for (const n of names) {
    const key = companyKey(n);
    if (key && n.length <= 80 && !/[\u0000-\u001f]/.test(n) && !wanted.has(n)) wanted.set(n, key);
  }
  if (!wanted.size) return new Map();
  const rows = await sparql(
    `SELECT ?label ?item ?site WHERE { VALUES ?label { ${[...wanted.keys()].map(quote).join(" ")} } ?item rdfs:label ?label ; wdt:P856 ?site . ?item wdt:P31/wdt:P279* wd:Q43229 . FILTER NOT EXISTS { ?item wdt:P576 ?gone } }`,
    fetcher,
  );
  const found = new Map<string, { domains: Set<string>; items: Set<string> }>();
  for (const b of rows) {
    const label = b.label?.value;
    const key = label ? wanted.get(label) : undefined;
    const domain = cleanDomain(b.site?.value);
    const id = qid(b.item?.value);
    // A website that is a hiring platform's or a board's is not the employer's.
    if (!key || !domain || !id || !employerDomainOf(`https://${domain}`, true)) continue;
    const e = found.get(key) ?? { domains: new Set<string>(), items: new Set<string>() };
    e.domains.add(domain);
    e.items.add(id);
    found.set(key, e);
  }
  const out = new Map<string, { domain: string; sourceId: string }>();
  for (const [key, e] of found) if (e.domains.size === 1 && e.items.size === 1) out.set(key, { domain: [...e.domains][0], sourceId: [...e.items][0] });
  return out;
}
