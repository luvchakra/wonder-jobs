/**
 * Where the hosted gateway keeps its state: three small documents in `wonderjobs.gateway_state` (see migration 0044),
 * so a search never rewrites the big one. Every write names the version it read (compare-and-set); one that lost a race
 * reloads and runs again, so two requests never overwrite each other. With no Supabase (local, tests) it is held in
 * memory by `table()`. The gateway's own code (apps/data-gateway) sees only read / change / lazy / flush.
 */
import { table } from "@/server/db/table";
import { getSupabaseAdmin } from "@/server/supabase";
import { initial, matchesWords, queryWords, type GatewayListing, type GatewayState } from "../../../../data-gateway/src/core.mjs";
import type { GatewayStore } from "../../../../data-gateway/src/handler.mjs";

type Part = "main" | "listings" | "usage";
const PARTS: Part[] = ["main", "listings", "usage"];
interface Row extends Record<string, unknown> {
  id: string;
  version: number;
  doc: unknown;
}
const rows = () => table<Row>("gateway_state");

/** A reader that is more than this old reloads, so a revoked key stops working within seconds on every instance. */
const FRESH_MS = 5000;
const TRIES = 6;

function split(s: GatewayState): Record<Part, string> {
  // Listings live in their own table (gateway_listings); the old 'listings' document is only read once, to move it.
  const { listings: _listings, usage, ...main } = s; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { main: JSON.stringify(main), listings: "[]", usage: JSON.stringify(usage) };
}
function join(docs: Partial<Record<Part, unknown>>): GatewayState {
  const base = initial();
  const main = (docs.main ?? {}) as Partial<GatewayState>;
  return { ...base, ...main, version: 1, runs: Array.isArray(main.runs) ? main.runs : [], listings: [], usage: (docs.usage as GatewayState["usage"]) ?? [] };
}

export class SupabaseGatewayStore implements GatewayStore {
  readonly listings = new GatewayListingsTable();
  private snap: { state: GatewayState; versions: Partial<Record<Part, number>>; at: number } | null = null;
  private loading: Promise<void> | null = null;
  private pending: ((s: GatewayState) => void)[] = [];

  private async load() {
    const found = await rows().findIn("id", PARTS);
    const docs: Partial<Record<Part, unknown>> = {};
    const versions: Partial<Record<Part, number>> = {};
    for (const r of found) if ((PARTS as string[]).includes(r.id)) { docs[r.id as Part] = r.doc; versions[r.id as Part] = Number(r.version); }
    this.snap = { state: join(docs), versions, at: Date.now() };
    // Once: listings still in the old single document move to their table, then the document is emptied.
    const legacy = Array.isArray(docs.listings) ? (docs.listings as GatewayListing[]) : [];
    if (legacy.length && versions.listings !== undefined) {
      await this.listings.upsert(legacy);
      await rows().update({ id: "listings", version: versions.listings }, { version: versions.listings + 1, doc: [] });
      versions.listings += 1;
    }
  }
  private async fresh(force = false) {
    if (!force && this.snap && Date.now() - this.snap.at < FRESH_MS) return;
    this.loading ??= this.load().finally(() => { this.loading = null; });
    await this.loading;
  }

  async read<T>(fn: (state: GatewayState) => T): Promise<T> {
    await this.fresh();
    return fn(this.snap!.state);
  }

  async change<T>(fn: (state: GatewayState) => T): Promise<T> {
    for (let attempt = 0; attempt < TRIES; attempt++) {
      await this.fresh(true);
      const { state, versions } = this.snap!;
      const before = split(state);
      const next = structuredClone(state);
      const result = fn(next);
      const after = split(next);
      const written = { ...versions };
      let conflict = false;
      for (const part of PARTS) {
        if (after[part] === before[part]) continue;
        const doc = JSON.parse(after[part]) as unknown;
        const v = versions[part];
        if (v === undefined) {
          try { await rows().insert({ id: part, version: 1, doc }); written[part] = 1; } catch { conflict = true; break; }
        } else if ((await rows().update({ id: part, version: v }, { version: v + 1, doc })) === 1) written[part] = v + 1;
        else { conflict = true; break; }
      }
      if (!conflict) { this.snap = { state: next, versions: written, at: Date.now() }; return result; }
    }
    throw new Error("The gateway's state was changing too fast to save; try again");
  }

  /** A change that can wait: applied to what this instance holds now, written by flush() (after the response). */
  lazy(fn: (state: GatewayState) => void) {
    if (this.snap) fn(this.snap.state);
    this.pending.push(fn);
  }
  async flush() {
    const fns = this.pending.splice(0);
    if (!fns.length) return;
    await this.change((s) => { for (const f of fns) f(s); });
  }
}

/** A listing as its table row. */
function toRow(l: GatewayListing) {
  return {
    id: l.id,
    source_id: l.sourceId,
    module: l.module,
    location: (l.location ?? "").toLowerCase(),
    search_text: `${l.title} ${l.organization} ${l.description}`.toLowerCase().slice(0, 20000),
    sort_at: l.publishedAt || l.observedAt,
    observed_at: l.observedAt,
    expires_at: l.expiresAt,
    doc: l,
    updated_at: new Date().toISOString(),
  };
}
/** Words and places for an ILIKE pattern: wildcards, quotes and PostgREST's own separators taken out. */
const likeSafe = (s: string) => s.replace(/[%_\\,()"'*:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
const CHUNK = 500;

type Plan = { module: string; query: string; locations: string[]; limit: number; offset: number; sourceIds: string[] };
const g2 = globalThis as unknown as { __wlListings?: Map<string, GatewayListing> };
const mem = () => (g2.__wlListings ??= new Map());

/**
 * The gateway's listings, one row each in `wonderjobs.gateway_listings` (migration 0045): a search is one SQL query
 * (module, allowed sources, unexpired, words, places, newest first, a page and the count), and a collection writes
 * only its own source's rows. Without Supabase (local, tests) they are kept in memory with the same rules.
 */
export class GatewayListingsTable {
  async search(plan: Plan): Promise<{ rows: GatewayListing[]; matched: number }> {
    if (!plan.sourceIds.length) return { rows: [], matched: 0 };
    const now = new Date().toISOString();
    const words = queryWords(plan.query).map(likeSafe).filter(Boolean);
    const places = plan.locations.map(likeSafe).filter(Boolean);
    const sb = getSupabaseAdmin();
    if (!sb) {
      const all = [...mem().values()]
        .filter((l) => l.module === plan.module && plan.sourceIds.includes(l.sourceId) && l.status === "active" && l.expiresAt > now && matchesWords(`${l.title} ${l.organization} ${l.description}`, words.join(" ")) && (!places.length || places.some((p) => l.location.toLowerCase().includes(p))))
        .sort((a, b) => (b.publishedAt || b.observedAt).localeCompare(a.publishedAt || a.observedAt) || a.id.localeCompare(b.id));
      return { rows: all.slice(plan.offset, plan.offset + plan.limit), matched: all.length };
    }
    let req = sb.from("gateway_listings").select("doc", { count: "exact" }).eq("module", plan.module).in("source_id", plan.sourceIds).gt("expires_at", now);
    // Every word must appear somewhere (not the words as one phrase).
    for (const w of words) req = req.ilike("search_text", `%${w}%`);
    if (places.length) req = req.or(places.map((p) => `location.ilike.%${p}%`).join(","));
    const { data, error, count } = await req.order("sort_at", { ascending: false }).order("id").range(plan.offset, plan.offset + plan.limit - 1);
    if (error) throw new Error(`Could not search gateway listings: ${error.message}`);
    return { rows: (data ?? []).map((r) => (r as { doc: GatewayListing }).doc), matched: count ?? 0 };
  }

  async get(id: string): Promise<GatewayListing | undefined> {
    const sb = getSupabaseAdmin();
    if (!sb) return mem().get(id);
    const { data, error } = await sb.from("gateway_listings").select("doc").eq("id", id).limit(1);
    if (error) throw new Error(`Could not read a gateway listing: ${error.message}`);
    return (data?.[0] as { doc: GatewayListing } | undefined)?.doc;
  }

  async upsert(list: GatewayListing[]) {
    const sb = getSupabaseAdmin();
    if (!sb) { for (const l of list) mem().set(l.id, l); return; }
    for (let i = 0; i < list.length; i += CHUNK) {
      const { error } = await sb.from("gateway_listings").upsert(list.slice(i, i + CHUNK).map(toRow), { onConflict: "id" });
      if (error) throw new Error(`Could not save gateway listings: ${error.message}`);
    }
  }

  /**
   * A collection's results for one source. A feed read whole replaces what the source had (rows it didn't see this run
   * are older than the run, so they go); a crawl or paged feed adds to it. Expired rows of the source go either way.
   * Returns how many the source now holds.
   */
  async replace(sourceId: string, results: GatewayListing[], merge: boolean): Promise<number> {
    const now = new Date().toISOString();
    const runAt = results.reduce((m, l) => (l.observedAt < m ? l.observedAt : m), now);
    await this.upsert(results);
    const sb = getSupabaseAdmin();
    if (!sb) {
      for (const [id, l] of mem()) if (l.sourceId === sourceId && (l.expiresAt <= now || (!merge && l.observedAt < runAt))) mem().delete(id);
      return [...mem().values()].filter((l) => l.sourceId === sourceId).length;
    }
    const gone = await sb.from("gateway_listings").delete().eq("source_id", sourceId).lte("expires_at", now);
    if (gone.error) throw new Error(`Could not remove expired gateway listings: ${gone.error.message}`);
    if (!merge) {
      const old = await sb.from("gateway_listings").delete().eq("source_id", sourceId).lt("observed_at", runAt);
      if (old.error) throw new Error(`Could not remove gateway listings a source no longer has: ${old.error.message}`);
    }
    const { count, error } = await sb.from("gateway_listings").select("id", { count: "exact", head: true }).eq("source_id", sourceId);
    if (error) throw new Error(`Could not count gateway listings: ${error.message}`);
    return count ?? 0;
  }

  /** Live listings per source and per module, for the admin page. */
  async counts(pairs: { sourceId: string; modules: string[] }[]): Promise<{ bySource: Record<string, number>; byModule: Record<string, number> }> {
    const now = new Date().toISOString();
    const bySource: Record<string, number> = {}, byModule: Record<string, number> = {};
    const sb = getSupabaseAdmin();
    for (const { sourceId, modules } of pairs)
      for (const mod of modules) {
        let n = 0;
        if (!sb) n = [...mem().values()].filter((l) => l.sourceId === sourceId && l.module === mod && l.expiresAt > now).length;
        else {
          const { count, error } = await sb.from("gateway_listings").select("id", { count: "exact", head: true }).eq("source_id", sourceId).eq("module", mod).gt("expires_at", now);
          if (error) throw new Error(`Could not count gateway listings: ${error.message}`);
          n = count ?? 0;
        }
        if (!n) continue;
        bySource[sourceId] = (bySource[sourceId] ?? 0) + n;
        byModule[mod] = (byModule[mod] ?? 0) + n;
      }
    return { bySource, byModule };
  }
}

/** Tests. */
export function resetGatewayListingsForTests() {
  g2.__wlListings = new Map();
}
