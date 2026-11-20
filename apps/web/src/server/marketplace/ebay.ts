/**
 * eBay's Browse API as a Buy, Sell & Rent source (US, UK, Australia, Canada and the larger EU marketplaces): live fixed-price
 * items with the price, condition and link eBay states. Free self-serve keyset (https://developer.ebay.com), 5,000 calls a
 * day. Off until both the Client ID and the Client Secret are set ("Needs setup").
 *
 * Terms pending (owner to confirm): the eBay API License Agreement, and EPN attribution if links should earn commission
 * (none is added: items link to eBay's own page, as eBay returns it). The app token comes from the OAuth client-credentials
 * grant (POST /identity/v1/oauth2/token; the application scope), kept in memory until it expires. NOTE: eBay's developer
 * pages refused our server's fetch (403) when this was written, so the request and response shapes follow the Browse API's
 * published contract from memory; the admin's Test on the keys checks the credentials, and the first live search is the check
 * of the rest.
 *
 * Real data only: one call per marketplace per search, for the person's words and only the fixed-price ("Buy It Now") items, so
 * the price shown is a price the seller states, never a bid. Each item shows eBay's title, price in its own currency (as
 * stated, never converted), condition, one photo, country and link. The seller's username and feedback are never shown: the
 * seller line reads "eBay seller". The credentials go only in the token request and are never kept, logged or returned.
 */
import { normalizePosting, type RawPosting } from "@/services/jobs/normalize";
import type { Job } from "@/domain/jobs/types";
import type { SearchCriteria } from "@/server/jobs/providers";
import { platformKey } from "@/server/jobslake/platformKeys";

export const EBAY = "mkt_ebay";
export const EBAY_ID_KEY = "EBAY_CLIENT_ID";
export const EBAY_SECRET_KEY = "EBAY_CLIENT_SECRET";
const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const PER_MARKETPLACE = 25;

export const ebayAvailable = () => !!(platformKey(EBAY_ID_KEY) && platformKey(EBAY_SECRET_KEY));

/** The marketplaces searched, with the words a typed place can name them by. */
const MARKETPLACES: { id: string; country: string; words: RegExp }[] = [
  { id: "EBAY_US", country: "US", words: /\b(usa?|united states|america)\b/i },
  { id: "EBAY_GB", country: "GB", words: /\b(uk|u\.k\.|united kingdom|britain|england|scotland|wales|london)\b/i },
  { id: "EBAY_AU", country: "AU", words: /\b(australia|sydney|melbourne)\b/i },
  { id: "EBAY_CA", country: "CA", words: /\b(canada|toronto|vancouver)\b/i },
  { id: "EBAY_DE", country: "DE", words: /\b(germany|deutschland|berlin)\b/i },
  { id: "EBAY_FR", country: "FR", words: /\b(france|paris)\b/i },
  { id: "EBAY_IT", country: "IT", words: /\b(italy|italia|rome|milan)\b/i },
  { id: "EBAY_ES", country: "ES", words: /\b(spain|españa|madrid|barcelona)\b/i },
];
/** With no marketplace named, the four English-language ones (four calls of the day's 5,000, once per uncached search). */
const DEFAULT_MARKETPLACES = ["EBAY_US", "EBAY_GB", "EBAY_AU", "EBAY_CA"];

/** The marketplaces for the places the person typed: those they name, else the four English-language ones. */
export function marketplacesFor(places: string[]): string[] {
  const named = MARKETPLACES.filter((m) => places.some((p) => m.words.test(p))).map((m) => m.id);
  return named.length ? named : DEFAULT_MARKETPLACES;
}

export interface EbayItem {
  itemId?: string;
  title?: string;
  shortDescription?: string;
  price?: { value?: string; currency?: string };
  condition?: string;
  image?: { imageUrl?: string };
  itemWebUrl?: string;
  itemLocation?: { country?: string };
  itemCreationDate?: string;
  buyingOptions?: string[];
  categories?: { categoryName?: string }[];
}

const clean = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const countryName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? "";
  } catch {
    return "";
  }
};

/** One eBay item as a WorksLake posting, or null when it can't honestly be shown. */
export function toRawItem(it: EbayItem): RawPosting | null {
  const id = clean(it.itemId, 80);
  const title = clean(it.title, 200);
  const url = clean(it.itemWebUrl, 1000);
  const amount = Number(it.price?.value);
  const currency = clean(it.price?.currency, 3).toUpperCase();
  if (!id || !title || !(amount > 0) || !/^[A-Z]{3}$/.test(currency)) return null;
  // Only a fixed price is a price the seller states; an auction's is the current bid.
  if (!it.buyingOptions?.includes("FIXED_PRICE")) return null;
  let host = "";
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    host = u.hostname;
  } catch {
    return null;
  }
  if (!/(^|\.)ebay\.[a-z.]+$/i.test(host)) return null;
  const category = clean(it.categories?.[0]?.categoryName, 80);
  const condition = clean(it.condition, 40);
  const country = countryName(clean(it.itemLocation?.country, 2).toUpperCase());
  const image = clean(it.image?.imageUrl, 300);
  return {
    externalId: id,
    title,
    company: "eBay seller",
    location: country,
    remote: false,
    description: clean(it.shortDescription, 1200) || [condition, category].filter(Boolean).join(" · ") || title,
    tags: [],
    postedAt: clean(it.itemCreationDate, 40) || undefined,
    applyUrl: url,
    employerSite: false,
    attributes: { price: String(amount), currency, available: true, ...(category ? { category } : {}), ...(condition ? { condition } : {}), ...(/^https:\/\//i.test(image) ? { image } : {}) },
  };
}

let token: { value: string; expiresAt: number } | null = null;

/** An application access token (cached until a minute before it expires). Throws with the status only, never a credential. */
async function appToken(s: { name: string; limits: { timeoutMs: number } }, needsSetup: (m: string) => Error): Promise<string> {
  if (token && token.expiresAt - 60_000 > Date.now()) return token.value;
  const id = platformKey(EBAY_ID_KEY);
  const secret = platformKey(EBAY_SECRET_KEY);
  if (!id || !secret) throw needsSetup(`${s.name} needs ${EBAY_ID_KEY} and ${EBAY_SECRET_KEY} on this deployment.`);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
    signal: AbortSignal.timeout(s.limits.timeoutMs),
  });
  if (res.status === 400 || res.status === 401 || res.status === 403) throw needsSetup(`${s.name} refused the credentials on this deployment (check ${EBAY_ID_KEY} and ${EBAY_SECRET_KEY}).`);
  if (!res.ok) throw new Error(`${s.name} answered ${res.status} to the sign-in.`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error(`${s.name} gave no access token.`);
  token = { value: body.access_token, expiresAt: Date.now() + Math.max(60, body.expires_in ?? 7200) * 1000 };
  return token.value;
}

/** One search of eBay for the person's words, in the marketplaces their places name (or the four default ones). */
export async function ebaySearch(s: { id: string; name: string; limits: { timeoutMs: number } }, c: SearchCriteria, needsSetup: (m: string) => Error): Promise<Job[]> {
  if (!ebayAvailable()) throw needsSetup(`${s.name} needs ${EBAY_ID_KEY} and ${EBAY_SECRET_KEY} on this deployment.`);
  const query = c.query.trim().slice(0, 120);
  // eBay's search needs words; with none there is nothing to ask, and nothing is made up.
  if (!query) return [];
  const bearer = await appToken(s, needsSetup);
  const params = new URLSearchParams({ q: query, limit: String(PER_MARKETPLACE), filter: "buyingOptions:{FIXED_PRICE}" });
  const results = await Promise.allSettled(
    marketplacesFor(c.locations).map(async (market) => {
      const res = await fetch(`${SEARCH_URL}?${params}`, { headers: { accept: "application/json", authorization: `Bearer ${bearer}`, "X-EBAY-C-MARKETPLACE-ID": market }, signal: AbortSignal.timeout(s.limits.timeoutMs) });
      if (res.status === 401) token = null;
      if (res.status === 401 || res.status === 403) throw needsSetup(`${s.name} refused the access on this deployment.`);
      if (res.status === 429) throw new Error(`${s.name} is rate limited right now.`);
      if (!res.ok) throw new Error(`${s.name} answered ${res.status}.`);
      return ((await res.json()) as { itemSummaries?: EbayItem[] }).itemSummaries ?? [];
    }),
  );
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  // Every marketplace failing is the source failing; some failing still answers with the rest.
  if (failed.length === results.length) throw failed[0].reason;
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const it of r.value) {
      const raw = toRawItem(it);
      if (!raw) continue;
      const job = normalizePosting(s.id, raw);
      if (seen.has(job.id)) continue;
      seen.add(job.id);
      out.push(job);
    }
  }
  return out;
}

/** Tests only. */
export const __resetEbayToken = () => {
  token = null;
};
