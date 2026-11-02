/**
 * Puts a module's gateway-collected listings into WorksLake's stored listings (its warm pool), from a background job:
 * after Setup's job activates a source and after the weekly OpenStreetMap delivery (owner, 2026-11-02: "add/update in
 * the cache in the job"). Reads only data WonderWorks already collected, through the module's `liveRead` sources, so a
 * search without words shows them from the store at once. Never an outside site, never per user search.
 */
import { canonicalize } from "@/domain/jobslake/canonical";
import { validateOpportunity } from "@/domain/jobslake/protocol";
import { placeWithCountry } from "@/domain/jobslake/country";
import type { ModuleId } from "@/modules/registry";
import { isAvailable, listSources, runConnector } from "./registry";
import { jobsLakeStore } from "./store";

export interface WarmResult {
  module: string;
  sourceId: string;
  stored: number;
  error?: string;
}

/** Stores the latest gateway-collected listings of these modules; one source's failure doesn't stop the rest. */
export async function warmGatewayModules(modules: Iterable<string>): Promise<WarmResult[]> {
  const out: WarmResult[] = [];
  for (const mod of new Set(modules)) {
    const sources = (await listSources(mod as ModuleId)).filter((s) => s.liveRead && (s.status === "active" || s.status === "degraded"));
    for (const s of sources) {
      try {
        if (!(await isAvailable(s))) continue;
        const r = await runConnector(s, { query: "", locations: [] }, "shallow");
        const jobs = placeWithCountry(r.jobs, s.geography);
        const opps = canonicalize(jobs.map((job) => ({ source: s, job }))).opportunities.filter((o) => validateOpportunity(o).length === 0);
        if (opps.length) await jobsLakeStore().upsertOpportunities(opps, mod as ModuleId);
        out.push({ module: mod, sourceId: s.id, stored: opps.length });
      } catch (e) {
        out.push({ module: mod, sourceId: s.id, stored: 0, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
      }
    }
  }
  return out;
}
