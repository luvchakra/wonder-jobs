import { MODULES, searchPlan, type GatewayListing } from "../../../../data-gateway/src/core.mjs";
import { hostedGateway } from "./index";

/**
 * What the gateway holds for one module, for that module's own search in this app (e.g. Events' outside events):
 * only active sources that cover the module, unexpired, matching the words and places given, newest first. Read in
 * process with WorksLake's own rights (no key needed); the module decides how to show each one, and shows its source.
 */
export async function gatewayListings(module: string, input: { query?: string; places?: string[]; limit?: number } = {}): Promise<{ configured: boolean; results: GatewayListing[]; sources: { id: string; name: string; count: number }[] }> {
  const hosted = hostedGateway();
  const secret = process.env.GATEWAY_CURSOR_SECRET;
  if (!hosted || !secret || !MODULES.includes(module)) return { configured: !!hosted, results: [], sources: [] };
  const internal = { id: "in-app", consumerId: "workslake", scopes: [`read:${module}`] };
  const plan = await hosted.store.read((s) => searchPlan(s, internal, { module, query: input.query ?? "", locations: input.places ?? [], limit: Math.min(100, input.limit ?? 50) }, secret));
  const r = { results: (await hosted.store.listings.search(plan)).rows };
  const counts = new Map<string, { id: string; name: string; count: number }>();
  for (const l of r.results) {
    const c = counts.get(l.sourceId) ?? { id: l.sourceId, name: l.sourceName, count: 0 };
    c.count++;
    counts.set(l.sourceId, c);
  }
  return { configured: true, results: r.results, sources: [...counts.values()] };
}
