/**
 * Where the hosted gateway keeps its state: three small documents in `wonderjobs.gateway_state` (see migration 0044),
 * so a search never rewrites the big one. Every write names the version it read (compare-and-set); one that lost a race
 * reloads and runs again, so two requests never overwrite each other. With no Supabase (local, tests) it is held in
 * memory by `table()`. The gateway's own code (apps/data-gateway) sees only read / change / lazy / flush.
 */
import { table } from "@/server/db/table";
import { initial, type GatewayState } from "../../../../data-gateway/src/core.mjs";
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
  const { listings, usage, ...main } = s;
  return { main: JSON.stringify(main), listings: JSON.stringify(listings), usage: JSON.stringify(usage) };
}
function join(docs: Partial<Record<Part, unknown>>): GatewayState {
  const base = initial();
  const main = (docs.main ?? {}) as Partial<GatewayState>;
  return { ...base, ...main, version: 1, listings: (docs.listings as GatewayState["listings"]) ?? [], usage: (docs.usage as GatewayState["usage"]) ?? [] };
}

export class SupabaseGatewayStore implements GatewayStore {
  private snap: { state: GatewayState; versions: Partial<Record<Part, number>>; at: number } | null = null;
  private loading: Promise<void> | null = null;
  private pending: ((s: GatewayState) => void)[] = [];

  private async load() {
    const found = await rows().findIn("id", PARTS);
    const docs: Partial<Record<Part, unknown>> = {};
    const versions: Partial<Record<Part, number>> = {};
    for (const r of found) if ((PARTS as string[]).includes(r.id)) { docs[r.id as Part] = r.doc; versions[r.id as Part] = Number(r.version); }
    this.snap = { state: join(docs), versions, at: Date.now() };
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
