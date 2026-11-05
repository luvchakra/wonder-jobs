import { loadPlatformKeys, platformKey, PLATFORM_KEYS } from "./platformKeys";

/**
 * Test (Admin → Keys): one small request to the provider with the saved key, so the admin knows the key works before a
 * source relies on it. Never a search on anyone's behalf, never stored; the answer names only the HTTP outcome, never
 * the key. Paired keys (Adzuna, USAJOBS, Flipkart, eBay) test together, whichever of the pair is pressed.
 */
export interface KeyTestResult {
  ok: boolean;
  message: string;
}

interface Probe {
  /** Every key the request needs. */
  needs: string[];
  request: (k: (name: string) => string) => { url: string; init?: RequestInit };
}

const PROBES: Record<string, Probe> = {
  adzuna: { needs: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"], request: (k) => ({ url: `https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=${encodeURIComponent(k("ADZUNA_APP_ID"))}&app_key=${encodeURIComponent(k("ADZUNA_APP_KEY"))}&results_per_page=1` }) },
  usajobs: { needs: ["USAJOBS_API_KEY", "USAJOBS_EMAIL"], request: (k) => ({ url: "https://data.usajobs.gov/api/search?ResultsPerPage=1", init: { headers: { "Authorization-Key": k("USAJOBS_API_KEY"), "User-Agent": k("USAJOBS_EMAIL") } } }) },
  ticketmaster: { needs: ["TICKETMASTER_API_KEY"], request: (k) => ({ url: `https://app.ticketmaster.com/discovery/v2/events.json?size=1&apikey=${encodeURIComponent(k("TICKETMASTER_API_KEY"))}` }) },
  openagenda: { needs: ["OPENAGENDA_API_KEY"], request: (k) => ({ url: "https://api.openagenda.com/v2/agendas?size=1", init: { headers: { key: k("OPENAGENDA_API_KEY") } } }) },
  thesportsdb: { needs: ["THESPORTSDB_API_KEY"], request: (k) => ({ url: `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(k("THESPORTSDB_API_KEY"))}/all_leagues.php` }) },
  // Jooble answers 400 to an empty search even with a good key (owner, 2026-11-05), so the test names a common word;
  // it's a connection check, never anyone's search.
  jooble: { needs: ["JOOBLE_API_KEY"], request: (k) => ({ url: `https://jooble.org/api/${encodeURIComponent(k("JOOBLE_API_KEY"))}`, init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keywords: "engineer", page: "1" }) } }) },
  // One small search (one request off the RapidAPI quota, not off the daily cap): a connection check, never anyone's search.
  jsearch: { needs: ["JSEARCH_API_KEY"], request: (k) => ({ url: "https://jsearch.p.rapidapi.com/search?query=engineer%20in%20london&page=1&num_pages=1&country=gb&date_posted=today", init: { headers: { "X-RapidAPI-Key": k("JSEARCH_API_KEY"), "X-RapidAPI-Host": "jsearch.p.rapidapi.com" } } }) },
  kaggleToken: { needs: ["KAGGLE_API_TOKEN"], request: (k) => ({ url: "https://www.kaggle.com/api/v1/competitions/list?page=1", init: { headers: { authorization: `Bearer ${k("KAGGLE_API_TOKEN")}` } } }) },
  simplerGrants: { needs: ["SIMPLER_GRANTS_API_KEY"], request: (k) => ({ url: "https://api.simpler.grants.gov/v1/opportunities/search", init: { method: "POST", headers: { "content-type": "application/json", "X-API-Key": k("SIMPLER_GRANTS_API_KEY") }, body: JSON.stringify({ pagination: { page_offset: 1, page_size: 1, sort_order: [{ order_by: "post_date", sort_direction: "descending" }] } }) } }) },
  clist: { needs: ["CLIST_USERNAME", "CLIST_API_KEY"], request: (k) => ({ url: "https://clist.by/api/v4/contest/?limit=1&format=json", init: { headers: { authorization: `ApiKey ${k("CLIST_USERNAME")}:${k("CLIST_API_KEY")}` } } }) },
  themuse: { needs: ["THEMUSE_API_KEY"], request: (k) => ({ url: `https://www.themuse.com/api/public/jobs?page=0&api_key=${encodeURIComponent(k("THEMUSE_API_KEY"))}` }) },
  findApprenticeship: { needs: ["FIND_APPRENTICESHIP_API_KEY"], request: (k) => ({ url: "https://api.apprenticeships.education.gov.uk/vacancies/vacancy?PageSize=1&PageNumber=1", init: { headers: { "Ocp-Apim-Subscription-Key": k("FIND_APPRENTICESHIP_API_KEY"), "X-Version": "2" } } }) },
  reliefweb: { needs: ["RELIEFWEB_APPNAME"], request: (k) => ({ url: `https://api.reliefweb.int/v2/jobs?appname=${encodeURIComponent(k("RELIEFWEB_APPNAME"))}&limit=1` }) },
  // Flipkart's product directory answers only to a valid tracking ID and token.
  flipkart: { needs: ["FLIPKART_AFFILIATE_ID", "FLIPKART_AFFILIATE_TOKEN"], request: (k) => ({ url: `https://affiliate-api.flipkart.net/affiliate/api/${encodeURIComponent(k("FLIPKART_AFFILIATE_ID"))}.json`, init: { headers: { "Fk-Affiliate-Id": k("FLIPKART_AFFILIATE_ID"), "Fk-Affiliate-Token": k("FLIPKART_AFFILIATE_TOKEN") } } }) },
  // eBay: asking for an application token checks the keyset itself (a wrong one is refused with 401); no item is searched.
  ebay: { needs: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"], request: (k) => ({ url: "https://api.ebay.com/identity/v1/oauth2/token", init: { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${k("EBAY_CLIENT_ID")}:${k("EBAY_CLIENT_SECRET")}`).toString("base64")}` }, body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope" } }) },
};

/** The probe a key belongs to, if any. */
export function probeFor(name: string): Probe | undefined {
  return Object.values(PROBES).find((p) => p.needs.includes(name));
}

/** Every key that has a Test. */
export const TESTABLE = new Set(PLATFORM_KEYS.map((k) => k.name).filter((n) => !!probeFor(n) || n === "THEIRSTACK_API_KEYS"));

function outcome(status: number): KeyTestResult {
  if (status >= 200 && status < 300) return { ok: true, message: "Works: the provider accepted the key." };
  if (status === 401 || status === 403) return { ok: false, message: `Rejected (${status}): the provider didn't accept the key.` };
  if (status === 429) return { ok: false, message: "Rate limited (429): the key may be fine; try again later." };
  return { ok: false, message: `The provider answered ${status}.` };
}

/**
 * TheirStack's keys, each tested on its own against its free location catalogue (no credits used): "2 of 3 keys work"
 * (owner, 2026-11-05: several keys on Admin → Keys).
 */
async function testTheirStackKeys(fetcher: typeof fetch): Promise<KeyTestResult> {
  const { theirStackKeys } = await import("@/server/jobs/theirstack");
  const keys = theirStackKeys();
  if (!keys.length) return { ok: false, message: "Add a TheirStack key first." };
  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        const res = await fetcher("https://api.theirstack.com/v0/catalog/locations?name=London&limit=1", { headers: { authorization: `Bearer ${key}`, accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
        await res.body?.cancel().catch(() => undefined);
        return res.status;
      } catch {
        return 0;
      }
    }),
  );
  const ok = results.filter((st) => st >= 200 && st < 300).length;
  const rejected = results.filter((st) => st === 401 || st === 403).length;
  const parts = [`${ok} of ${keys.length} key${keys.length === 1 ? "" : "s"} work`];
  if (rejected) parts.push(`${rejected} rejected`);
  if (keys.length - ok - rejected) parts.push(`${keys.length - ok - rejected} didn't answer`);
  return { ok: ok > 0, message: `${parts.join(", ")}. Credits aren't checked here; a key out of credits is skipped during searches.` };
}

export async function testPlatformKey(name: string, fetcher: typeof fetch = fetch): Promise<KeyTestResult> {
  if (name === "THEIRSTACK_API_KEYS") {
    await loadPlatformKeys(Date.now(), true);
    return testTheirStackKeys(fetcher);
  }
  const probe = probeFor(name);
  if (!probe) return { ok: false, message: "No test for this key." };
  await loadPlatformKeys(Date.now(), true);
  const missing = probe.needs.filter((n) => !platformKey(n));
  if (missing.length) return { ok: false, message: `Set ${missing.join(" and ")} first.` };
  const { url, init } = probe.request((n) => platformKey(n) ?? "");
  try {
    const res = await fetcher(url, { ...init, signal: AbortSignal.timeout(10_000), redirect: "follow" });
    await res.body?.cancel().catch(() => undefined);
    return outcome(res.status);
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, message: timeout ? "Unavailable: the provider didn't answer in 10 s." : "Unavailable: couldn't reach the provider." };
  }
}
