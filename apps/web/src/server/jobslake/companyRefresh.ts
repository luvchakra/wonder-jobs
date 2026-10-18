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
import { jobTypeFromTitle } from "@/domain/jobs/jobType";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";

export interface CompanyRefreshReport {
  postings: number;
  companies: number;
  logosChecked: number;
  logosFound: number;
  /** Stored postings given the job type their title states this run. */
  jobTypesFilled: number;
}

/** The most postings read per refresh (PostgREST answers at most 1,000 rows a request). */
const MAX_POSTINGS = 1000;

export async function refreshCompanies(
  opts: { now?: number; logoLimit?: number; budgetMs?: number; concurrency?: number; store?: CompanyStore; postings?: () => Promise<CanonicalOpportunity[]>; savePostings?: (opps: CanonicalOpportunity[]) => Promise<void>; fetcher?: typeof fetch } = {},
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
  for (const o of opps) for (const r of companiesFrom([o], at)) counts.set(r.domain, (counts.get(r.domain) ?? 0) + 1);
  await store.upsert(records.map((r) => ({ ...r, openJobs: counts.get(r.domain) ?? 0, countedAt: at })));

  // Postings stored without a job type: the one their title states, if any.
  const typed = opps.flatMap((o) => {
    if (o.jobType) return [];
    const t = jobTypeFromTitle(o.title ?? "");
    return t ? [{ ...o, jobType: t, jobTypeFrom: "title" as const }] : [];
  });
  if (typed.length) await (opts.savePostings ?? ((x) => jobsLakeStore().upsertOpportunities(x)))(typed);

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
  return { postings: opps.length, companies: records.length, logosChecked: checked, logosFound: found, jobTypesFilled: typed.length };
}
