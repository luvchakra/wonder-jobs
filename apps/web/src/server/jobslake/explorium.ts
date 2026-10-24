/**
 * Explorium's employee-review ratings (`company_ratings_by_employees`), asked for by company website. A company
 * Explorium can't match comes back with no data and isn't charged. The API key is only ever sent in the `api_key`
 * header, and nothing here puts it in a thrown message or a log.
 */
import { parseExploriumRatings, type CompanyRatings } from "@/domain/jobslake/ratings";

const API = "https://api.explorium.ai";
const TIMEOUT_MS = 30_000;
/** Explorium takes at most 50 companies in one request. */
export const EXPLORIUM_BATCH = 50;

export type CreditsResult = { kind: "ok"; remaining: number } | { kind: "rejected" } | { kind: "error"; message: string };

/** The credits a key has left — a cheap read that costs none. A rejected key (401/403) is dead. */
export async function exploriumCredits(key: string, fetcher: typeof fetch = fetch): Promise<CreditsResult> {
  try {
    const res = await fetcher(`${API}/v2/credits`, { headers: { api_key: key, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 401 || res.status === 403) return { kind: "rejected" };
    if (!res.ok) return { kind: "error", message: `Explorium answered ${res.status}` };
    const body = (await res.json().catch(() => null)) as { remaining_credits?: unknown } | null;
    return typeof body?.remaining_credits === "number" ? { kind: "ok", remaining: Math.max(0, Math.floor(body.remaining_credits)) } : { kind: "error", message: "Explorium didn't say how many credits are left" };
  } catch {
    return { kind: "error", message: "Couldn't reach Explorium" };
  }
}

export type EnrichResult =
  /** `ratings` holds each asked domain Explorium had a rating for; the others were looked up and had none. */
  | { kind: "ok"; ratings: Map<string, CompanyRatings> }
  /** The key is out of credits (402), or Explorium refused it (401/403): it won't work again. */
  | { kind: "exhausted" }
  | { kind: "rejected" }
  /** Too many requests: the key is fine, try again shortly. */
  | { kind: "limited" }
  | { kind: "error"; message: string };

/** One request for up to 50 companies, matched by their website. */
export async function exploriumRatings(key: string, companies: { domain: string; name: string }[], fetcher: typeof fetch = fetch): Promise<EnrichResult> {
  if (!companies.length) return { kind: "ok", ratings: new Map() };
  try {
    const res = await fetcher(`${API}/v2/businesses/company_ratings_by_employees/enrich`, {
      method: "POST",
      headers: { api_key: key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ businesses_to_match: companies.slice(0, EXPLORIUM_BATCH).map((c) => ({ name: c.name.slice(0, 200), domain: c.domain })) }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 402) return { kind: "exhausted" };
    if (res.status === 401 || res.status === 403) return { kind: "rejected" };
    if (res.status === 429) return { kind: "limited" };
    if (!res.ok) return { kind: "error", message: `Explorium answered ${res.status}` };
    const body = (await res.json().catch(() => null)) as { data?: { input?: { domain?: string | null }; business_id?: string | null; data?: unknown }[] } | null;
    if (!Array.isArray(body?.data)) return { kind: "error", message: "Explorium's answer wasn't in the expected shape" };
    const ratings = new Map<string, CompanyRatings>();
    for (const row of body.data) {
      const domain = row.input?.domain?.toLowerCase();
      const r = row.business_id ? parseExploriumRatings(row.data) : undefined;
      if (domain && r) ratings.set(domain, r);
    }
    return { kind: "ok", ratings };
  } catch {
    return { kind: "error", message: "Couldn't reach Explorium" };
  }
}
