/**
 * Flipkart's Affiliate API as a Buy, Sell & Rent source (India): new items on flipkart.com, each linking to its own Flipkart
 * page. Free self-serve registration (https://affiliate.flipkart.com/api-docs/af_register.html) gives a tracking ID and an API
 * token; both are needed. Off until both are set ("Needs setup").
 *
 * Terms pending (owner to confirm; affiliate.flipkart.com/api-docs/af_tou.html, read 2026-11-05): licensed to registered
 * affiliates, royalty-free and non-sub-licensable; "not use it in a similar or competitive platform" and no use of Flipkart's
 * name or trademarks without written consent (the source line and "View on" link name it; the owner confirms that is
 * allowed); 20 calls a second (one call per search here). Its keyword search, one of the two search calls the docs list, is
 * marked "will be deprecated soon" in favour of the category feeds; this reads that search, at most 10 items a call.
 *
 * Real data only: an item shows what Flipkart states: title, its selling price in rupees, brand, category and photo, and
 * links to its own page (with the affiliate id Flipkart's link already carries; nothing is added). An item Flipkart marks out of
 * stock, or one without a rupee price or an https link, is left out. Flipkart's sellers are not named: the seller line reads
 * "Flipkart seller". The two credentials go only in request headers and are never kept, logged or returned.
 */
import { normalizePosting, type RawPosting } from "@/services/jobs/normalize";
import type { Job } from "@/domain/jobs/types";
import type { SearchCriteria } from "@/server/jobs/providers";
import { platformKey } from "@/server/jobslake/platformKeys";

export const FLIPKART = "mkt_flipkart";
export const FLIPKART_ID_KEY = "FLIPKART_AFFILIATE_ID";
export const FLIPKART_TOKEN_KEY = "FLIPKART_AFFILIATE_TOKEN";
const ENDPOINT = "https://affiliate-api.flipkart.net/affiliate/search/json";
const MAX_RESULTS = 10;

export const flipkartAvailable = () => !!(platformKey(FLIPKART_ID_KEY) && platformKey(FLIPKART_TOKEN_KEY));

interface Money { amount?: number; currency?: string }
export interface FlipkartItem {
  productBaseInfo?: {
    productIdentifier?: { productId?: string; categoryPaths?: { categoryPath?: { title?: string }[][] } };
    productAttributes?: {
      title?: string;
      productDescription?: string | null;
      imageUrls?: Record<string, string>;
      sellingPrice?: Money;
      productUrl?: string;
      productBrand?: string;
      inStock?: boolean;
    };
  };
}

const clean = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const FLIPKART_HOST = /(^|\.)(flipkart\.com|flixcart\.com)$/i;

/** Flipkart's own http links as https (its hosts serve both); any other host stays as given, and is dropped later if not https. */
function https(raw: unknown): string {
  const v = clean(raw, 1000);
  try {
    const u = new URL(v);
    if (u.protocol === "http:" && FLIPKART_HOST.test(u.hostname)) u.protocol = "https:";
    return u.toString();
  } catch {
    return "";
  }
}

/** One Flipkart item as a WorksLake posting, or null when it can't honestly be shown. */
export function toRawItem(it: FlipkartItem): RawPosting | null {
  const base = it.productBaseInfo;
  const a = base?.productAttributes;
  const id = clean(base?.productIdentifier?.productId, 80);
  const title = clean(a?.title, 200);
  const url = https(a?.productUrl);
  const price = a?.sellingPrice;
  if (!id || !title || !/^https:\/\//i.test(url) || !FLIPKART_HOST.test(new URL(url).hostname)) return null;
  if (a?.inStock !== true || typeof price?.amount !== "number" || !(price.amount >= 1) || price.currency !== "INR") return null;
  const path = (base?.productIdentifier?.categoryPaths?.categoryPath?.[0] ?? []).map((c) => clean(c.title, 60)).filter(Boolean);
  const brand = clean(a?.productBrand, 60);
  const images = a?.imageUrls ?? {};
  const image = https(images["400x400"] ?? images["275x275"] ?? images.unknown ?? "");
  return {
    externalId: id,
    title,
    company: "Flipkart seller",
    location: "India · online shop",
    remote: false,
    description: clean(a?.productDescription, 1200) || [brand, path.join(" › ")].filter(Boolean).join(" · ") || title,
    tags: [],
    applyUrl: url,
    employerSite: false,
    attributes: { price: String(price.amount), currency: "INR", available: true, ...(path.length ? { category: path[path.length - 1] } : {}), ...(image ? { image } : {}), ...(brand ? { brand } : {}) },
  };
}

/** One search of Flipkart for the person's words. Throws what the caller turns into a source line. */
export async function flipkartSearch(s: { id: string; name: string; limits: { timeoutMs: number } }, c: SearchCriteria, needsSetup: (m: string) => Error): Promise<Job[]> {
  const id = platformKey(FLIPKART_ID_KEY);
  const token = platformKey(FLIPKART_TOKEN_KEY);
  if (!id || !token) throw needsSetup(`${s.name} needs ${FLIPKART_ID_KEY} and ${FLIPKART_TOKEN_KEY} on this deployment.`);
  const query = c.query.trim().slice(0, 120);
  // Flipkart searches words; with none there is nothing to ask, and nothing is made up.
  if (!query) return [];
  const params = new URLSearchParams({ query, resultCount: String(MAX_RESULTS) });
  const res = await fetch(`${ENDPOINT}?${params}`, { headers: { accept: "application/json", "Fk-Affiliate-Id": id, "Fk-Affiliate-Token": token }, signal: AbortSignal.timeout(s.limits.timeoutMs) });
  // Never the credentials: status only.
  if (res.status === 401 || res.status === 403) throw needsSetup(`${s.name} refused the credentials on this deployment (check ${FLIPKART_ID_KEY} and ${FLIPKART_TOKEN_KEY}).`);
  if (res.status === 429) throw new Error(`${s.name} is rate limited right now.`);
  if (!res.ok) throw new Error(`${s.name} answered ${res.status}.`);
  const body = (await res.json()) as { productInfoList?: FlipkartItem[] };
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const it of body.productInfoList ?? []) {
    const raw = toRawItem(it);
    if (!raw) continue;
    const job = normalizePosting(s.id, raw);
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    out.push(job);
  }
  return out;
}
