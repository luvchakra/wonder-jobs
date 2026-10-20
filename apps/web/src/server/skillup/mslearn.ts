/**
 * The public Microsoft Learn catalog (learn.microsoft.com/api/catalog — no key, free), read for Skill Up:
 * Microsoft's own certifications and learning paths. It's shared, slowly-changing public data, so it's kept in
 * memory per server instance for a day (never anything about a candidate). When it can't be read, callers get
 * nothing and say so — no entries are made up.
 */
export interface LearnItem {
  kind: "certification" | "learning path";
  title: string;
  url: string;
  /** Plain text, trimmed. */
  summary: string;
  minutes?: number;
  level?: string;
}

interface Catalog {
  items: LearnItem[];
  fetchedAt: number;
}

const BASE = "https://learn.microsoft.com/api/catalog/?locale=en-us";
const TTL_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

const plain = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, "")}…` : s);
/** The catalog's tracking parameter isn't part of the page's address. */
const address = (u: string) => u.replace(/[?&]WT\.mc_id=[^&]*/, "");

interface RawCert {
  title?: string;
  subtitle?: string;
  url?: string;
  levels?: string[];
}
interface RawPath {
  title?: string;
  summary?: string;
  url?: string;
  levels?: string[];
  duration_in_minutes?: number;
}

export function parseCatalog(certs: { certifications?: RawCert[] }, paths: { learningPaths?: RawPath[] }): LearnItem[] {
  const items: LearnItem[] = [];
  for (const c of certs.certifications ?? []) {
    if (c.title && c.url) items.push({ kind: "certification", title: c.title, url: address(c.url), summary: clip(plain(c.subtitle ?? ""), 180), level: c.levels?.[0] });
  }
  for (const p of paths.learningPaths ?? []) {
    if (p.title && p.url) items.push({ kind: "learning path", title: p.title, url: address(p.url), summary: clip(plain(p.summary ?? ""), 180), minutes: p.duration_in_minutes, level: p.levels?.[0] });
  }
  return items;
}

async function get<T>(type: string): Promise<T> {
  const res = await fetch(`${BASE}&type=${type}`, { headers: { accept: "application/json", "user-agent": "WonderJobs/1.0 (job search agent)" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`learn.microsoft.com responded ${res.status}`);
  return (await res.json()) as T;
}

let cached: Catalog | null = null;
let loading: Promise<Catalog | null> | null = null;
let failedAt = 0;

/** The catalog, or null when Microsoft Learn can't be reached right now. */
export function loadCatalog(now = Date.now()): Promise<Catalog | null> {
  if (cached && now - cached.fetchedAt < TTL_MS) return Promise.resolve(cached);
  if (loading) return loading;
  if (!cached && now - failedAt < RETRY_MS) return Promise.resolve(null);
  loading = Promise.all([get<{ certifications?: RawCert[] }>("certifications"), get<{ learningPaths?: RawPath[] }>("learningPaths")])
    .then(([certs, paths]) => {
      cached = { items: parseCatalog(certs, paths), fetchedAt: now };
      return cached;
    })
    .catch(() => {
      failedAt = now;
      // A stale copy beats nothing.
      return cached;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();

/** Whether a catalog title is about the term: the whole phrase in it, or all of its words (short ones aside). */
export function titleMatches(title: string, term: string): boolean {
  const t = ` ${words(title)} `;
  const phrase = words(term);
  if (!phrase) return false;
  if (t.includes(` ${phrase} `)) return true;
  const parts = phrase.split(" ").filter((w) => w.length > 2);
  return parts.length > 1 && parts.every((w) => t.includes(` ${w} `));
}

/** Learning paths and certifications whose titles are about a skill; certifications first, then the fuller paths. */
export function forSkill(items: LearnItem[], skill: string, limit = 3): LearnItem[] {
  return items
    .filter((i) => titleMatches(i.title, skill))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "certification" ? -1 : 1))
    .slice(0, limit);
}

const afterCertified = (s: string) => words(s.replace(/^.*?Certified:?\s*/i, ""));

/** The Microsoft certification a posting names ("Microsoft Certified: Azure Administrator Associate"), when the catalog has it. */
export function certificationNamed(items: LearnItem[], name: string): LearnItem | null {
  const tail = afterCertified(name);
  if (!/^microsoft\b/i.test(name) || !tail) return null;
  return (
    items.find((i) => {
      const own = afterCertified(i.title);
      return i.kind === "certification" && !!own && (own === tail || own.startsWith(tail) || tail.startsWith(own));
    }) ?? null
  );
}
