/**
 * Where a posting found through a job board actually lives. Adzuna gives no "source" field, only its own
 * link, which forwards to the site that holds the posting (naukri.com, a company's careers page, …). The
 * link check already follows that link to see whether the posting is still open, so the site it lands on
 * is recorded from that same request — never an extra one — and kept in a shared catalogue
 * (`wonderjobs.job_origins`), so the board's link is followed once per posting, not once per candidate.
 *
 * The catalogue is deliberately not tenant-scoped: it holds only public facts about public postings
 * (the board's ad id, the host and URL the link landed on) and nothing about who looked.
 */
import { getSupabaseAdmin } from "@/server/supabase";
import { checkJobLink, type LinkCheck } from "./linkCheck";

export interface JobOrigin {
  /** e.g. "naukri.com"; null when the link stayed on the board itself. */
  host: string | null;
  finalUrl: string | null;
  resolvedAt: string;
}

/** A link that stayed on the board is tried again after a week (the posting may move); a found site is kept. */
const RETRY_UNRESOLVED_MS = 7 * 24 * 3_600_000;

const BOARD_HOST = /(^|\.)adzuna\.[a-z.]+$/i;

/** "adzuna:4398123456" for an Adzuna ad link, null for anything else. */
export function boardRef(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!BOARD_HOST.test(u.hostname)) return null;
  const id = u.pathname.match(/\/(?:ad|details)\/(\d{4,20})(?:\/|$)/)?.[1];
  return id ? `adzuna:${id}` : null;
}

/** The site a followed link landed on ("naukri.com"), or null when it stayed on the board or can't be read. */
export function originHost(finalUrl: string | undefined): string | null {
  if (!finalUrl) return null;
  try {
    const host = new URL(finalUrl).hostname.toLowerCase().replace(/^www\./, "");
    return host && !BOARD_HOST.test(host) ? host : null;
  } catch {
    return null;
  }
}

export interface JobOriginStore {
  get(refs: string[]): Promise<Map<string, JobOrigin>>;
  put(ref: string, origin: Omit<JobOrigin, "resolvedAt">): Promise<void>;
}

export class MemoryJobOriginStore implements JobOriginStore {
  private rows = new Map<string, JobOrigin>();
  async get(refs: string[]) {
    return new Map(refs.flatMap((r) => (this.rows.has(r) ? [[r, this.rows.get(r)!] as const] : [])));
  }
  async put(ref: string, o: Omit<JobOrigin, "resolvedAt">) {
    // A site already found is never replaced by "stayed on the board" (a blocked or odd later follow).
    if (!o.host && this.rows.get(ref)?.host) return;
    this.rows.set(ref, { ...o, resolvedAt: new Date().toISOString() });
  }
}

type Db = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export class SupabaseJobOriginStore implements JobOriginStore {
  constructor(private sb: Db) {}
  async get(refs: string[]) {
    const out = new Map<string, JobOrigin>();
    if (!refs.length) return out;
    // Shared catalogue of public facts: keyed by the board's ad id only, no tenant column by design.
    const { data, error } = await this.sb.from("job_origins").select("source_ref, origin_host, final_url, resolved_at").in("source_ref", refs);
    if (error) {
      console.warn("[job-origins] read failed:", error.message);
      return out;
    }
    for (const r of (data ?? []) as { source_ref: string; origin_host: string | null; final_url: string | null; resolved_at: string }[]) out.set(r.source_ref, { host: r.origin_host, finalUrl: r.final_url, resolvedAt: r.resolved_at });
    return out;
  }
  async put(ref: string, o: Omit<JobOrigin, "resolvedAt">) {
    const row = { source_ref: ref, origin_host: o.host, final_url: o.finalUrl, resolved_at: new Date().toISOString() };
    // "Stayed on the board" only fills an empty slot; a site already found is kept.
    const { error } = o.host ? await this.sb.from("job_origins").upsert(row, { onConflict: "source_ref" }) : await this.sb.from("job_origins").upsert(row, { onConflict: "source_ref", ignoreDuplicates: true });
    if (error) console.warn("[job-origins] write failed:", error.message);
  }
}

let store: JobOriginStore | undefined;
export function jobOriginStore(): JobOriginStore {
  if (store) return store;
  const sb = getSupabaseAdmin();
  store = sb ? new SupabaseJobOriginStore(sb) : new MemoryJobOriginStore();
  return store;
}

export type CheckedLink = LinkCheck;

/**
 * Link checks, with the origin of each board posting. A posting whose site is already known is checked on
 * that site directly (the board's link isn't followed again); otherwise the board's link is followed once
 * and where it landed is recorded for everyone.
 */
export async function checkLinksWithOrigins(urls: string[], deps: { store?: JobOriginStore; check?: typeof checkJobLink; concurrency?: number } = {}): Promise<Record<string, CheckedLink>> {
  const db = deps.store ?? jobOriginStore();
  const check = deps.check ?? checkJobLink;
  const unique = [...new Set(urls)];
  const refOf = new Map(unique.map((u) => [u, boardRef(u)] as const));
  const refs = [...new Set([...refOf.values()].filter((r): r is string => !!r))];
  const known = refs.length ? await db.get(refs) : new Map<string, JobOrigin>();
  const now = Date.now();

  const one = async (url: string): Promise<CheckedLink> => {
    const ref = refOf.get(url);
    const k = ref ? known.get(ref) : undefined;
    if (k?.host && k.finalUrl) {
      const r = await check(k.finalUrl);
      return { status: r.status, reason: r.reason, origin: k.host };
    }
    const { finalUrl, ...r } = await check(url);
    if (!ref) return r;
    const host = originHost(finalUrl);
    const stale = !k || (!k.host && now - Date.parse(k.resolvedAt) > RETRY_UNRESOLVED_MS);
    // Record only what the follow actually showed: a site, or (when the board's own page answered) that it stayed there.
    if (host) await db.put(ref, { host, finalUrl: finalUrl ?? null });
    else if (finalUrl && r.status !== "unknown" && stale) await db.put(ref, { host: null, finalUrl });
    console.info(`[job-origins] ${ref} → ${host ?? k?.host ?? "stayed on the board / unknown"}`);
    const origin = host ?? k?.host ?? undefined;
    return origin ? { ...r, origin } : r;
  };

  const out: Record<string, CheckedLink> = {};
  const queue = [...unique];
  await Promise.all(
    Array.from({ length: Math.min(deps.concurrency ?? 6, queue.length) }, async () => {
      for (let u = queue.shift(); u; u = queue.shift()) out[u] = await one(u);
    }),
  );
  return out;
}
