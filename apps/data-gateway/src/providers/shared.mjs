/**
 * What every live prospect provider shares (WJ-822, docs/PROSPECT_DATA_API.md, A3): one JSON call to the provider's
 * official API with the request's time limit, and the small readers the adapters map answers with. A provider's answer
 * is data: text has its markup removed, and nothing in it changes what a request may do.
 */
import { plainText } from "../core.mjs";

/** A provider that could not answer. `reason` is a short code for the response's metadata; it never carries a key or a body. */
export class ProviderError extends Error {
  constructor(reason) { super("Provider call failed: " + reason); this.reason = reason; }
}
/** The largest answer read (bytes of text); a larger one is refused, not cut. */
export const MAX_ANSWER = 2_000_000;

/**
 * One call to a provider's own API host, answered as JSON. A refused key, a rate limit, another status, an answer
 * that is not JSON or is too large, a redirect and a timeout all fail the same way: `ProviderError` with a reason.
 * Nothing is retried, so a provider's rate limit is never worked around.
 */
export async function callJson(ctx, url, init = {}) {
  let res;
  try { res = await ctx.fetch(String(url), { ...init, redirect: "error", signal: ctx.signal }); }
  catch { throw new ProviderError(ctx.signal?.aborted ? "timeout" : "no_answer"); }
  if (!res.ok) throw new ProviderError("http_" + res.status);
  let body;
  try { body = await res.text(); } catch { throw new ProviderError(ctx.signal?.aborted ? "timeout" : "no_answer"); }
  if (body.length > MAX_ANSWER) throw new ProviderError("too_large");
  try { return JSON.parse(body); } catch { throw new ProviderError("malformed"); }
}

export const str = (v, max) => (typeof v === "string" && v.trim() ? plainText(v).slice(0, max) || null : null);
export const count = (v) => { const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,15}$/.test(v) ? Number(v) : NaN; return Number.isInteger(n) && n >= 0 ? n : null; };
export const list = (v) => (Array.isArray(v) ? v : []);
/** A public https link a provider states, or null (never a link with a login in it, never another scheme). */
export function httpsUrl(v) {
  if (typeof v !== "string" || !v.trim()) return null;
  try { const u = new URL(v.trim()); return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) ? u.toString() : null; } catch { return null; }
}
export const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; } };
/** The words a provider is asked for: the request's query, else its first categories. */
export const wordsOf = (plan) => plan.query || plan.categoryWords.slice(0, 3).join(" ");
/** The request's first named place and first country, as the provider's own filters take them. */
export const placeOf = (plan) => plan.locations.find((l) => l.text)?.text ?? null;
export const countryOf = (plan) => plan.locations.find((l) => l.country)?.country ?? null;
export const pointOf = (plan) => plan.locations.find((l) => l.lat !== null) ?? null;
/** An empty business in the contract's shape: every field the provider does not state stays null. */
export const blankBusiness = () => ({ id: "", kind: "business", name: "", domain: null, website: null, phone: null, email: null, categories: [], industry: null, employeeRange: null, description: null, location: { text: null, city: null, region: null, country: null, postcode: null, lat: null, lon: null }, signals: { openJobs: null, newJobs7d: null }, source: null, observedAt: "", provenance: {} });
