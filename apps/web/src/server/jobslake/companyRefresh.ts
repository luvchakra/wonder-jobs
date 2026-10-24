/**
 * JobsLake's daily company refresh (owner, 2026-10-17). Searches already record each employer they see; this
 * goes over every posting JobsLake kept from the last two weeks, so the directory holds every company those
 * postings name a domain for, with how many postings it has, and looks for the logos still missing — so a
 * search's job cards show them straight from JobsLake. Domains are only ever ones a source reported or the
 * employer's own apply link shows (`companiesFrom`), never guessed from a name.
 *
 * It also gives stored postings saved before job types existed the type their title states
 * ("Part-time …", "Freelance …"), marked as read from the title; a title that says none stays without one.
 */
import { MAX_POSTING_AGE_DAYS } from "@/domain/jobs/age";
import { LOGO_TTL_MS, companiesFrom, companyStore, fetchLogo, type CompanyStore } from "./companies";
import { jobsLakeStore } from "./store";
import { wikidataFacts, wikidataWebsites } from "./wikidata";
import { resolveNameDomains } from "./nameDomains";
import { retypeFromTitle } from "@/domain/jobs/jobType";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";

export interface CompanyRefreshReport {
  postings: number;
  companies: number;
  logosChecked: number;
  logosFound: number;
  /** Stored postings given the job type their title states this run. */
  jobTypesFilled: number;
  /** Companies looked up on Wikidata this run, and how many it had facts for. */
  wikidataChecked: number;
  wikidataFound: number;
  /** Companies with no domain on their postings: how many, how many were asked about, how many got an official website. */
  namesWithoutDomain: number;
  namesAsked: number;
  namesResolved: number;
}

/** How long Wikidata's facts (or the finding that it has none) are trusted before they're looked for again. */
export const WIKIDATA_TTL_MS = 30 * 86_400_000;

/** The most postings read per refresh (PostgREST answers at most 1,000 rows a request). */
const MAX_POSTINGS = 1000;

export async function refreshCompanies(
  opts: { now?: number; logoLimit?: number; budgetMs?: number; concurrency?: number; store?: CompanyStore; postings?: () => Promise<CanonicalOpportunity[]>; savePostings?: (opps: CanonicalOpportunity[]) => Promise<void>; fetcher?: typeof fetch; wikidataLimit?: number; wikidata?: typeof wikidataFacts; websites?: typeof wikidataWebsites; nameLimit?: number } = {},
): Promise<CompanyRefreshReport> {
  const now = opts.now ?? Date.now();
  const startedAt = Date.now();
  const budget = opts.budgetMs ?? 45_000;
  const store = opts.store ?? companyStore();
  const since = new Date(now - MAX_POSTING_AGE_DAYS * 86_400_000).toISOString();
  const opps = await (opts.postings ?? (() => jobsLakeStore().listOpportunities({ sinceIso: since, limit: MAX_POSTINGS })))();

  // One record per company domain, with the number of its postings in this window.
  const at = new Date(now).toISOString();
  const records = companiesFrom(opps, at);
  const counts = new Map<string, number>();
  const fresh = new Map<string, number>();
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  for (const o of opps)
    for (const r of companiesFrom([o], at)) {
      counts.set(r.domain, (counts.get(r.domain) ?? 0) + 1);
      if (o.postedAt >= weekAgo) fresh.set(r.domain, (fresh.get(r.domain) ?? 0) + 1);
    }
  await store.upsert(records.map((r) => ({ ...r, openJobs: counts.get(r.domain) ?? 0, newJobs7d: fresh.get(r.domain) ?? 0, countedAt: at })));

  // Companies whose postings name no domain: their official website from Wikidata, by exact name, so they get a row too.
  const names = await resolveNameDomains(opps, { store, at, limit: opts.nameLimit, fetcher: opts.fetcher, lookup: opts.websites });

  // Postings stored without a job type, or with a source's "Full-time" their title contradicts ("Intern - Sales"):
  // the one their title states.
  const typed = opps.flatMap((o) => {
    const t = retypeFromTitle({ ...o, title: o.title ?? "" });
    return t ? [{ ...o, jobType: t, jobTypeFrom: "title" as const }] : [];
  });
  if (typed.length) await (opts.savePostings ?? ((x) => jobsLakeStore().upsertOpportunities(x)))(typed);

  // Wikidata's facts for companies never looked up (or not for a month), 40 to a query, within the time budget.
  const wiki = { checked: 0, found: 0 };
  const due2 = await store.needingWikidata(opts.wikidataLimit ?? 200, new Date(now - WIKIDATA_TTL_MS).toISOString());
  for (let i = 0; i < due2.length && Date.now() - startedAt < budget; i += 40) {
    const batch = due2.slice(i, i + 40);
    // A batch Wikidata refuses is left for the next run; the rest still go.
    const facts = await (opts.wikidata ?? wikidataFacts)(batch, opts.fetcher ?? fetch).catch(() => undefined);
    if (!facts) continue;
    await store.setWikidata(facts, batch, new Date().toISOString());
    wiki.checked += batch.length;
    wiki.found += facts.size;
  }

  // Logos never looked for (or not for a month), a few at a time, within the time budget.
  const due = await store.needingLogo(opts.logoLimit ?? 150, new Date(now - LOGO_TTL_MS).toISOString());
  let checked = 0;
  let found = 0;
  const queue = [...due];
  await Promise.all(
    Array.from({ length: Math.min(opts.concurrency ?? 6, queue.length) }, async () => {
      for (let d = queue.shift(); d; d = queue.shift()) {
        if (Date.now() - startedAt > budget) return;
        const logo = await fetchLogo(d, opts.fetcher ?? fetch);
        await store.setLogo(d, logo, new Date().toISOString());
        checked++;
        if (logo) found++;
      }
    }),
  );
  return { postings: opps.length, companies: records.length, logosChecked: checked, logosFound: found, jobTypesFilled: typed.length, wikidataChecked: wiki.checked, wikidataFound: wiki.found, namesWithoutDomain: names.unresolved, namesAsked: names.asked, namesResolved: names.resolved };
}
