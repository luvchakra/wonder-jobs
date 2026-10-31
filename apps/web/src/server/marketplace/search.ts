/**
 * Buy, Sell & Rent Find: one search of WorksLake's Marketplace dataset (module = 'marketplace'), turned into listings with
 * their terms, and the per-source provenance the person sees ("searched X across Y"). Anyone the viewer blocked, or who
 * blocked them, and the viewer's own listings never appear.
 */
import { search } from "@/server/jobslake/core";
import type { Session } from "@/server/auth";
import { MARKETPLACE, type MarketListing } from "@/modules/marketplace/domain";
import { openMarketListings, toListing } from "./listings";
import { WONDERWORKS_MARKETPLACE } from "./sources";

export type SourceState = "ok" | "empty" | "needs_setup" | "unavailable" | "skipped";
export interface MarketplaceSourceLine { id: string; name: string; state: SourceState; count: number; message?: string }
export interface MarketplaceSearchResult { searched: { query: string; places: string[] }; results: MarketListing[]; sources: MarketplaceSourceLine[] }

const MAX_RESULTS = 200;

/** Search listings for these words and places. They are the person's own; there is no default. */
export async function searchMarketplace(s: Session, input: { query: string; places: string[]; refresh?: boolean }): Promise<MarketplaceSearchResult> {
  const query = input.query.trim().slice(0, 120);
  const places = input.places.map((p) => p.trim()).filter(Boolean).slice(0, 5);
  const [{ response, plan }, open] = await Promise.all([
    search({ query: { text: query, locations: places }, searchMode: "balanced", limit: MAX_RESULTS, module: MARKETPLACE, cache: input.refresh ? "refresh" : "use" }, { trigger: "search" }),
    openMarketListings(s.tenantId),
  ]);
  const byId = new Map(open.map((r) => [r.id, r]));
  const results = response.results.flatMap((o) => {
    const ws = o.sourceRecords.find((r) => r.sourceId === WONDERWORKS_MARKETPLACE);
    const r = ws ? byId.get(ws.sourceJobId) : undefined;
    return r ? [toListing(r)] : [];
  });
  const lines: MarketplaceSourceLine[] = response.sources.map((x) => ({
    id: x.sourceId,
    name: x.sourceName,
    state: x.outcome === "ok" ? "ok" : x.outcome === "empty" ? "empty" : x.outcome === "needs_setup" ? "needs_setup" : x.outcome === "skipped" ? "skipped" : "unavailable",
    count: results.filter((r) => r.sourceId === x.sourceId).length,
    ...(x.message ? { message: x.message } : {}),
  }));
  for (const sk of plan.skipped) if (!lines.some((l) => l.id === sk.id)) lines.push({ id: sk.id, name: sk.name, state: /credential/i.test(sk.reason) ? "needs_setup" : "skipped", count: 0, message: /credential/i.test(sk.reason) ? "Needs setup" : sk.reason });
  return { searched: { query, places }, results, sources: lines };
}
