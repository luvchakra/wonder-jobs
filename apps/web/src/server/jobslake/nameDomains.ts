/**
 * Companies whose postings name no domain (most Adzuna, Jooble and board postings) had no directory row, so no
 * logo, size, H-1B or rating. This finds each one's official website on Wikidata by its exact name
 * (`wikidataWebsites`) and records it like any other company; the daily refresh then fetches its logo and facts.
 * A name Wikidata can't answer for is remembered for NAME_TTL_MS so it isn't asked again every day.
 */
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { cleanDomain, companyKey, employerDomainOf, type CompanyRecord } from "@/domain/jobslake/companies";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import type { CompanyStore } from "./companies";
import { wikidataWebsites } from "./wikidata";

const KEY = "wj.companynames";
export const NAME_TTL_MS = 60 * 86_400_000;
/** Names remembered as unanswered: the newest ones, so the document stays small. */
const MAX_REMEMBERED = 4000;
const CHUNK = 40;

type Memory = Record<string, string>;

async function readMemory(): Promise<Memory> {
  const doc = await stateStore.get(PLATFORM_TENANT, KEY).catch(() => undefined);
  const m = (doc?.state as { checked?: Memory } | undefined)?.checked;
  return m && typeof m === "object" ? m : {};
}

export interface NameDomainReport {
  /** Names without a domain, how many were asked about this run, and how many got a website. */
  unresolved: number;
  asked: number;
  resolved: number;
}

export async function resolveNameDomains(
  opps: CanonicalOpportunity[],
  p: { store: CompanyStore; at: string; limit?: number; budgetMs?: number; fetcher?: typeof fetch; lookup?: typeof wikidataWebsites; memory?: { read: () => Promise<Memory>; write: (m: Memory) => Promise<void> } },
): Promise<NameDomainReport> {
  const started = Date.now();
  const mem = p.memory ?? { read: readMemory, write: (checked: Memory) => stateStore.put(PLATFORM_TENANT, KEY, { checked }).then(() => undefined) };
  const now = Date.parse(p.at);
  // Names of postings with no domain, with how many postings each has.
  const byKey = new Map<string, { name: string; count: number; fresh: number }>();
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  for (const o of opps) {
    const hasDomain = cleanDomain(o.employer.domain) ?? employerDomainOf(o.canonicalApplyUrl, o.applyPath === "employer_site" && o.quality.employerVerified);
    const key = companyKey(o.employer.name);
    if (hasDomain || !key) continue;
    const e = byKey.get(key) ?? { name: o.employer.name, count: 0, fresh: 0 };
    e.count++;
    if (o.postedAt >= weekAgo) e.fresh++;
    byKey.set(key, e);
  }
  const checked = await mem.read();
  // Skip names the directory already knows (by name) or that were asked about lately.
  const keys = [...byKey.keys()];
  const known = new Set<string>();
  for (let i = 0; i < keys.length; i += 100) for (const r of await p.store.facts([], keys.slice(i, i + 100))) known.add(r.nameKey);
  const due = keys
    .filter((k) => !known.has(k) && !(checked[k] && now - Date.parse(checked[k]) < NAME_TTL_MS))
    .sort((a, b) => byKey.get(b)!.count - byKey.get(a)!.count)
    .slice(0, p.limit ?? 120);

  let resolved = 0;
  const records: CompanyRecord[] = [];
  for (let i = 0; i < due.length && Date.now() - started < (p.budgetMs ?? 20_000); i += CHUNK) {
    const batch = due.slice(i, i + CHUNK);
    const found = await (p.lookup ?? wikidataWebsites)(batch.map((k) => byKey.get(k)!.name), p.fetcher ?? fetch).catch(() => undefined);
    // A lookup Wikidata refused is left for the next run.
    if (!found) continue;
    for (const k of batch) {
      const hit = found.get(k);
      checked[k] = p.at;
      if (!hit) continue;
      const e = byKey.get(k)!;
      records.push({ domain: hit.domain, name: e.name, nameKey: k, sources: ["wikidata"], firstSeenAt: p.at, lastSeenAt: p.at, openJobs: e.count, newJobs7d: e.fresh, countedAt: p.at });
      resolved++;
    }
  }
  if (records.length) await p.store.upsert(records);
  if (due.length) {
    const kept = Object.entries(checked).sort((a, b) => b[1].localeCompare(a[1])).slice(0, MAX_REMEMBERED);
    // Names that now have a row need no reminder.
    await mem.write(Object.fromEntries(kept.filter(([k]) => !records.some((r) => r.nameKey === k)))).catch(() => undefined);
  }
  return { unresolved: byKey.size, asked: due.length, resolved };
}
