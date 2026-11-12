/**
 * Hunter, for named contacts at one organisation (WJ-825; docs/PROSPECT_DATA_API.md, A4). Its API reference
 * (hunter.io/api-documentation/v2, read 2026-11-12), key in the X-API-KEY header:
 * - Domain Search: GET api.hunter.io/v2/domain-search?domain=&type=personal&limit= (at most 100). Answers
 *   { data: { emails: [{ value, type, confidence, first_name, last_name, position, seniority, department, linkedin,
 *   verification: { date, status } }] }, meta: { results, limit, offset } }. A search that finds no one costs nothing.
 * - Email Verifier: GET api.hunter.io/v2/email-verifier?email=. Answers { data: { status } }, status one of valid,
 *   invalid, accept_all, webmail, disposable, unknown; 202 while it is still checking (not polled: reported unverified).
 *
 * Terms pending: Hunter's terms of service (hunter.io/terms-of-service, read 2026-11-12) do not address storing or
 * passing results to another product; they make the caller an independent controller under GDPR and forbid building a
 * competing service. Nothing Hunter returns is stored, cached or logged here (owner decision
 * `prospects-contact-providers`).
 */
import { ProviderError, callJson, hostOf, httpsUrl, list, str } from "./shared.mjs";

const API = "https://api.hunter.io/v2/";
const headers = (ctx) => ({ accept: "application/json", "x-api-key": ctx.keys.HUNTER_API_KEY });
/** Hunter's verdict as the contract's emailStatus. */
export const HUNTER_STATUS = Object.freeze({ valid: "verified", invalid: "invalid", disposable: "invalid", accept_all: "risky", webmail: "risky", unknown: "unverified" });

/** People with a personal address at `domain` (named, with a position when Hunter has one). */
export async function hunterPeople(ctx, { domain, size }) {
  const u = new URL(API + "domain-search");
  u.search = new URLSearchParams({ domain, type: "personal", limit: String(Math.max(1, Math.min(100, size))) }).toString();
  const answer = await callJson(ctx, u, { headers: headers(ctx) });
  if (!answer || typeof answer !== "object" || !answer.data || typeof answer.data !== "object") throw new ProviderError("malformed");
  return list(answer.data.emails).map((e) => {
    const email = typeof e?.value === "string" ? e.value.trim().toLowerCase() : "";
    const host = email.slice(email.lastIndexOf("@") + 1);
    if (!/^[^\s@]{1,64}@[a-z0-9.-]{3,190}$/.test(email) || (host !== domain && !host.endsWith("." + domain)) || e.type === "generic") return null;
    const linkedin = httpsUrl(e.linkedin);
    return {
      firstName: str(e.first_name, 80), lastName: str(e.last_name, 80), title: str(e.position, 160), email,
      emailStatus: HUNTER_STATUS[e.verification?.status] ?? "unverified",
      linkedinUrl: linkedin && /(^|\.)linkedin\.com$/.test(hostOf(linkedin) ?? "") ? linkedin : null,
    };
  }).filter(Boolean);
}

/** One address checked: the contract's emailStatus. Still checking (202) is "unverified". */
export async function hunterVerify(ctx, email) {
  const u = new URL(API + "email-verifier");
  u.search = new URLSearchParams({ email }).toString();
  const res = await ctx.fetch(String(u), { headers: headers(ctx), redirect: "error", signal: ctx.signal }).catch(() => null);
  if (res?.status === 202) return "unverified";
  if (!res) throw new ProviderError(ctx.signal?.aborted ? "timeout" : "no_answer");
  // The same reading as every other call, so a refused key or a rate limit fails it the same way.
  const answer = await callJson({ ...ctx, fetch: async () => res }, u);
  return HUNTER_STATUS[answer?.data?.status] ?? "unverified";
}

export default {
  id: "hunter", label: "Hunter", kinds: ["contact"], paid: true, units: 1, coverage: ["global"], attribution: "Hunter", termsPending: true,
  cost: "1 paid unit a domain search that finds someone, 1 a verification",
  keys: ["HUNTER_API_KEY"], defaultCacheHours: 0,
};
