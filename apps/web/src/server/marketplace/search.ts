/**
 * Buy, Sell & Rent Find: one search of WorksLake's Marketplace dataset (module = 'marketplace'), turned into listings with
 * their terms, and the per-source provenance the person sees ("searched X across Y"). Anyone the viewer blocked, or who
 * blocked them, and the viewer's own listings never appear.
 */
import { search } from "@/server/jobslake/core";
import type { Session } from "@/server/auth";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { categoryOfProductType, MARKETPLACE, MAX_PRICE, type MarketListing } from "@/modules/marketplace/domain";
import { openMarketListings, toListing } from "./listings";
import { WONDERWORKS_MARKETPLACE } from "./sources";
import { proxiedImage } from "@/server/imageProxy";

export type SourceState = "ok" | "empty" | "needs_setup" | "unavailable" | "skipped";
export interface MarketplaceSourceLine { id: string; name: string; state: SourceState; count: number; message?: string }
export interface MarketplaceSearchResult { searched: { query: string; places: string[] }; results: MarketListing[]; sources: MarketplaceSourceLine[] }

const MAX_RESULTS = 200;
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * A shop's or dealer's own item, read from a WorksLake outside source (the gateway's business catalogues), as a link-out
 * listing. Null when it can't be shown honestly: no https link back to the shop, no business name, no price, or the shop
 * says it is out of stock. The price is the one the shop states, in rupees (the sources are Indian, INR); the condition is
 * New (a shop's own stock); the seller is the business, never a person. Nothing is messaged or paid for here.
 */
export function outsideListing(o: CanonicalOpportunity): MarketListing | null {
  const a = (o.attributes ?? {}) as Record<string, unknown>;
  const rec = o.sourceRecords.find((r) => r.canonical) ?? o.sourceRecords[0];
  const price = Math.round(Number(str(a.price, 20).replace(/[, ]/g, "")));
  const business = str(o.employer?.name, 120);
  let url: URL;
  try {
    url = new URL(o.canonicalApplyUrl ?? "");
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (!business || !o.title.trim() || !Number.isFinite(price) || price < 1 || price > MAX_PRICE) return null;
  if (a.available === false || a.available === "false") return null;
  return {
    id: `mk_out_${o.id}`,
    listingId: o.id,
    outside: { url: url.toString(), business, ...(proxiedImage(a.image) ? { image: proxiedImage(a.image) } : {}) },
    title: o.title.trim().slice(0, 160),
    description: o.description.slice(0, 1200),
    area: o.locations?.[0] || "India · online shop",
    terms: { category: categoryOfProductType(`${str(a.category, 80)} ${o.title}`), price, negotiable: false, condition: "New", photos: [] },
    sellerVerified: false,
    seller: business,
    ...(o.postedAt ? { postedAt: o.postedAt } : {}),
    sourceId: rec?.sourceId ?? "",
    sourceName: rec?.sourceName ?? "",
  };
}

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
    if (!ws) {
      // A listing from an outside source (a shop's own catalogue): shown as a link-out, or left out when it isn't complete.
      const outside = outsideListing(o);
      return outside ? [outside] : [];
    }
    const r = byId.get(ws.sourceJobId);
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
