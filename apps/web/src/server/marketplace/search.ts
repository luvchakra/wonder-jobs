/**
 * Buy, Sell & Rent Find: one search of WorksLake's Marketplace dataset (module = 'marketplace'), turned into listings with
 * their terms, and the per-source provenance the person sees ("searched X across Y"). Anyone the viewer blocked, or who
 * blocked them, and the viewer's own listings never appear.
 */
import { search } from "@/server/jobslake/core";
import type { Session } from "@/server/auth";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { categoryOfProductType, CONDITIONS, MARKETPLACE, MAX_PRICE, type MarketListing } from "@/modules/marketplace/domain";
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
 * says it is out of stock. The price is the one the shop states: rupees for the Indian shops, or its own currency (eBay),
 * shown as stated and never converted; the condition is the shop's own words (New when it names none, being its own
 * stock); the seller is the business, never a person. Nothing is messaged or paid for here.
 */
export function outsideListing(o: CanonicalOpportunity): MarketListing | null {
  const a = (o.attributes ?? {}) as Record<string, unknown>;
  const rec = o.sourceRecords.find((r) => r.canonical) ?? o.sourceRecords[0];
  const amount = typeof a.price === "number" ? a.price : Number(str(a.price, 20).replace(/[, ]/g, ""));
  const price = Math.round(amount);
  // A price in another currency (eBay) is kept as the shop states it; a missing or odd code means rupees, as the shops' own are.
  const code = str(a.currency, 3).toUpperCase();
  const currency = /^[A-Z]{3}$/.test(code) && code !== "INR" ? code : undefined;
  const business = str(o.employer?.name, 120);
  let url: URL;
  try {
    url = new URL(o.canonicalApplyUrl ?? "");
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (!business || !o.title.trim() || !Number.isFinite(amount) || price < 1 || price > MAX_PRICE) return null;
  if (a.available === false || a.available === "false") return null;
  const priceText = currency ? statedPrice(amount, currency) : undefined;
  if (currency && !priceText) return null;
  const image = proxiedImage(a.image);
  return {
    id: `mk_out_${o.id}`,
    listingId: o.id,
    outside: { url: url.toString(), business, ...(image ? { image } : {}), ...(currency && priceText ? { currency, priceText } : {}) },
    title: o.title.trim().slice(0, 160),
    description: o.description.slice(0, 1200),
    area: o.locations?.[0] || (currency ? "Online shop" : "India · online shop"),
    terms: { category: categoryOfProductType(`${str(a.category, 80)} ${o.title}`), price, negotiable: false, condition: conditionOf(str(a.condition, 40)), photos: [] },
    sellerVerified: false,
    seller: business,
    ...(o.postedAt ? { postedAt: o.postedAt } : {}),
    sourceId: rec?.sourceId ?? "",
    sourceName: rec?.sourceName ?? "",
  };
}

/** A price exactly as its currency writes it ("$12.50"), or undefined when the currency code isn't one Intl knows. */
function statedPrice(amount: number, currency: string): string | undefined {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
  } catch {
    return undefined;
  }
}

/** A shop's own condition words as ours: only an explicit New is New, Like new/open box are Like new, anything else Used. A shop that names none sells new stock. */
function conditionOf(text: string): (typeof CONDITIONS)[number] {
  if (!text) return "New";
  if (/^(brand )?new\b/i.test(text)) return "New";
  if (/like new|open box/i.test(text)) return "Like new";
  return "Used";
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
