import { decrypt, encrypt } from "@/server/secrets";
import { maskCredential } from "./credentials";
import { jobsLakeStore } from "./store";

/**
 * API keys the platform admin sets in the admin itself (owner, 2026-11-01: "instead of vercel, get them added to the
 * platform itself"), for the sources that need one. Each is kept in WorksLake's credential store under a fixed ref
 * (`platform:<NAME>`), AES-256-GCM encrypted like every source credential, masked on read, never logged or returned.
 *
 * A source reads its key with `platformKey(NAME)`: a deployment environment variable of the same name still wins (so
 * nothing already set breaks), else the admin's value. The admin's values are read into memory at most once a minute
 * (`loadPlatformKeys`, called at the start of every search, availability check and credential view), so the sync
 * `platformKey` stays cheap. Secrets are platform-wide, never tenant data.
 */
export interface PlatformKeySpec {
  name: string;
  label: string;
  /** What it unlocks, in words. */
  usedBy: string;
  signup: string;
  free: boolean;
  /** Holds several keys (one per line), used in turn; each is shown masked and can be removed on its own. */
  multi?: boolean;
}

export const PLATFORM_KEYS: PlatformKeySpec[] = [
  { name: "ADZUNA_APP_ID", label: "Adzuna app ID", usedBy: "Jobs (India), Internships, Teaching (India + UK, US, Canada, Australia, New Zealand, South Africa, Singapore)", signup: "https://developer.adzuna.com/signup", free: true },
  { name: "ADZUNA_APP_KEY", label: "Adzuna app key", usedBy: "With the Adzuna app ID", signup: "https://developer.adzuna.com/signup", free: true },
  { name: "USAJOBS_API_KEY", label: "USAJOBS API key", usedBy: "Jobs, Teaching and Internships: US government roles", signup: "https://developer.usajobs.gov/APIRequest/Index", free: true },
  { name: "USAJOBS_EMAIL", label: "USAJOBS email", usedBy: "The email the USAJOBS key was registered to", signup: "https://developer.usajobs.gov/APIRequest/Index", free: true },
  { name: "TICKETMASTER_API_KEY", label: "Ticketmaster API key", usedBy: "Events: concerts, sport, theatre and family events", signup: "https://developer.ticketmaster.com/", free: true },
  { name: "OPENAGENDA_API_KEY", label: "OpenAgenda API key", usedBy: "Events: the public agendas of French and European towns, museums and associations (a public key, oa_pk_…)", signup: "https://developers.openagenda.com/authentification/", free: true },
  { name: "THESPORTSDB_API_KEY", label: "TheSportsDB API key (optional)", usedBy: "Events: cricket and Indian Super League fixtures; without one the free test key is used (about three results a call)", signup: "https://www.thesportsdb.com/pricing", free: false },
  { name: "THEIRSTACK_API_KEYS", label: "TheirStack API keys", usedBy: "Jobs: licensed jobs from LinkedIn, Indeed, ATS boards and career sites. Add one or several keys; Wonder takes them in turn and skips one that is out of credits. Keys set in the deployment are used too.", signup: "https://app.theirstack.com/settings/api-key", free: true, multi: true },
  { name: "JOOBLE_API_KEY", label: "Jooble API key", usedBy: "Jobs, Teaching and Internships searches through Jooble", signup: "https://jooble.org/api/about", free: true },
  { name: "KAGGLE_API_TOKEN", label: "Kaggle API token", usedBy: "Scholarships & Projects: Kaggle competitions (Settings → API → Generate New Token, starts KGAT_; replaces the older username + key)", signup: "https://www.kaggle.com/settings/account", free: true },
  { name: "THEMUSE_API_KEY", label: "The Muse API key", usedBy: "Internships from The Muse (higher rate limit)", signup: "https://www.themuse.com/developers/api/v2", free: true },
  { name: "NAV_PAM_STILLING_FEED_TOKEN", label: "NAV job feed token (Norway)", usedBy: "Jobs: every Norwegian vacancy from NAV's pam-stilling-feed, once its connector is built (WJ-550)", signup: "https://navikt.github.io/pam-stilling-feed/", free: true },
  { name: "FIND_APPRENTICESHIP_API_KEY", label: "Find an apprenticeship API key (UK)", usedBy: "Internships: live apprenticeship vacancies in England (DfE Display Advert API v2)", signup: "https://developer.apprenticeships.education.gov.uk/third-party-accounts/register", free: true },
  { name: "SIMPLER_GRANTS_API_KEY", label: "Simpler.Grants.gov API key", usedBy: "Scholarships & Projects: US federal funding open to individuals, with summaries, from Simpler.Grants.gov (self-serve key via Login.gov; disabled after 30 days unused)", signup: "https://simpler.grants.gov/developers", free: true },
  { name: "CLIST_USERNAME", label: "clist.by username", usedBy: "Scholarships & Projects: upcoming programming contests on about 200 platforms (with the clist.by API key)", signup: "https://clist.by/api/v4/doc/", free: true },
  { name: "CLIST_API_KEY", label: "clist.by API key", usedBy: "Scholarships & Projects: upcoming programming contests from clist.by (log in, then API → your key; 10 requests a minute)", signup: "https://clist.by/api/v4/doc/", free: true },
  { name: "RELIEFWEB_APPNAME", label: "ReliefWeb app name", usedBy: "Internships: humanitarian and development internships worldwide from ReliefWeb", signup: "https://apidoc.reliefweb.int/parameters#appname", free: true },
  { name: "FLIPKART_AFFILIATE_ID", label: "Flipkart affiliate tracking ID", usedBy: "Buy, Sell & Rent (India): items from Flipkart. Terms pending: Flipkart's affiliate API terms of use", signup: "https://affiliate.flipkart.com/", free: true },
  { name: "FLIPKART_AFFILIATE_TOKEN", label: "Flipkart affiliate API token", usedBy: "With the Flipkart tracking ID (generated on the affiliate dashboard)", signup: "https://affiliate.flipkart.com/", free: true },
  { name: "EBAY_CLIENT_ID", label: "eBay Client ID (App ID)", usedBy: "Buy, Sell & Rent: fixed-price eBay items in the US, UK, Australia, Canada and larger EU marketplaces (5,000 calls a day). Terms pending: the eBay API licence and EPN attribution", signup: "https://developer.ebay.com/my/keys", free: true },
  { name: "EBAY_CLIENT_SECRET", label: "eBay Client Secret (Cert ID)", usedBy: "With the eBay Client ID (the Production keyset's Cert ID)", signup: "https://developer.ebay.com/my/keys", free: true },
];

const NAMES = new Set(PLATFORM_KEYS.map((k) => k.name));
const SPEC = new Map(PLATFORM_KEYS.map((k) => [k.name, k]));
const ref = (name: string) => `platform:${name}`;
const TTL = 60_000;
let cache: { at: number; values: Record<string, string> } | null = null;
// One read at a time: a page that resolves 100+ sources at once used to start 100+ reads of every key in parallel, and
// the burst failed ("fetch failed"). Concurrent callers now share the read in flight.
let inflight: Promise<void> | null = null;

/** Reads the admin's keys into memory (at most once a minute; a failed read keeps what was there). */
export function loadPlatformKeys(now = Date.now(), force = false): Promise<void> {
  if (!force && cache && now - cache.at < TTL) return Promise.resolve();
  // A forced read (right after a key was saved) never reuses a read that started before the save.
  if (force) return readKeys(now);
  if (inflight) return inflight;
  inflight = readKeys(now).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function readKeys(now: number): Promise<void> {
  const store = jobsLakeStore();
  const values: Record<string, string> = {};
  try {
    await Promise.all(
      PLATFORM_KEYS.map(async (k) => {
        const c = await store.getCredential(ref(k.name));
        if (c) values[k.name] = decrypt(c.ciphertext);
      }),
    );
    cache = { at: now, values };
  } catch (e) {
    console.warn(`[jobslake] couldn't read platform keys: ${e instanceof Error ? e.message : e}`);
    cache = { at: now, values: cache?.values ?? {} };
  }
}

/** A source's key: the deployment's environment variable if set, else the one the admin set on the platform. */
export function platformKey(name: string): string | undefined {
  const env = process.env[name]?.trim();
  if (env) return env;
  return cache?.values[name]?.trim() || undefined;
}

/** The keys the admin set for a multi-key entry, in order (the deployment's own variable is not included). */
export function adminKeyList(name: string): string[] {
  return splitKeys(cache?.values[name]);
}
const splitKeys = (v: string | undefined) => [...new Set((v ?? "").split(/[\s,]+/).map((k) => k.trim()).filter(Boolean))];

export interface PlatformKeyStatus extends PlatformKeySpec {
  set: boolean;
  /** A multi-key entry: each admin key, masked, and how many more the deployment sets. */
  keys?: string[];
  envCount?: number;
  /** Admin → Keys shows a Test for it (keyTest.ts). */
  testable?: boolean;
  from: "platform" | "environment" | null;
  masked: string;
}

/** Every key, whether it's set and where from, masked — never a value. */
export async function platformKeyStatus(): Promise<PlatformKeyStatus[]> {
  await loadPlatformKeys(Date.now(), true);
  return PLATFORM_KEYS.map((k) => {
    const env = process.env[k.name]?.trim();
    const mine = cache?.values[k.name];
    if (k.multi) {
      // Several keys: the admin's are listed (masked) and editable even when the deployment also sets some.
      const keys = splitKeys(mine).map(maskCredential);
      const envCount = splitKeys(env).length;
      const masked = keys.length ? `${keys.length} key${keys.length === 1 ? "" : "s"}${envCount ? ` + ${envCount} in the deployment` : ""}` : envCount ? `${envCount} in the deployment` : "Not set";
      return { ...k, set: keys.length + envCount > 0, from: keys.length ? ("platform" as const) : envCount ? ("environment" as const) : null, masked, keys, envCount };
    }
    return { ...k, set: !!(env || mine), from: env ? "environment" : mine ? "platform" : null, masked: env ? "Set in the deployment" : mine ? maskCredential(mine) : "Not set" };
  });
}

/** The admin sets, replaces or (with null) removes one key. */
export async function setPlatformKey(name: string, value: string | null, now = new Date().toISOString()): Promise<{ ok: boolean; message: string }> {
  if (!NAMES.has(name)) return { ok: false, message: "Unknown key." };
  const store = jobsLakeStore();
  if (value === null) {
    await store.deleteCredential(ref(name));
  } else if (SPEC.get(name)?.multi) {
    // A multi-key entry adds the pasted keys (one per line or comma-separated) to the ones already saved.
    const existing = await store.getCredential(ref(name));
    const before = existing ? splitKeys(decrypt(existing.ciphertext)) : [];
    const added = splitKeys(value).filter((k) => k.length >= 4 && k.length <= 512);
    if (!added.length) return { ok: false, message: "Paste at least one key (one per line)." };
    const all = [...new Set([...before, ...added])];
    if (all.join(",").length > 4096 || all.length > 30) return { ok: false, message: "Too many keys (at most 30)." };
    await store.putCredential({ ref: ref(name), ciphertext: encrypt(all.join(",")), masked: `${all.length} keys`, createdAt: existing?.createdAt ?? now, replacedAt: existing ? now : undefined });
    cache = null;
    await loadPlatformKeys(Date.now(), true);
    const n = all.length - before.length;
    return { ok: true, message: `${n} key${n === 1 ? "" : "s"} added (${all.length} saved).` };
  } else {
    const v = value.trim();
    if (v.length < 4 || v.length > 4096) return { ok: false, message: "That doesn't look like a key (4–4,096 characters)." };
    const existing = await store.getCredential(ref(name));
    await store.putCredential({ ref: ref(name), ciphertext: encrypt(v), masked: maskCredential(v), createdAt: existing?.createdAt ?? now, replacedAt: existing ? now : undefined });
  }
  cache = null;
  await loadPlatformKeys(Date.now(), true);
  return { ok: true, message: value === null ? `${name} removed.` : `${name} saved. Sources that need it can run now.` };
}

/** Removes one key of a multi-key entry, by its place in the masked list. */
export async function removePlatformKeyAt(name: string, index: number, now = new Date().toISOString()): Promise<{ ok: boolean; message: string }> {
  if (!SPEC.get(name)?.multi) return { ok: false, message: "Unknown key." };
  const store = jobsLakeStore();
  const existing = await store.getCredential(ref(name));
  const keys = existing ? splitKeys(decrypt(existing.ciphertext)) : [];
  if (!Number.isInteger(index) || index < 0 || index >= keys.length) return { ok: false, message: "That key isn't there any more." };
  keys.splice(index, 1);
  if (keys.length) await store.putCredential({ ref: ref(name), ciphertext: encrypt(keys.join(",")), masked: `${keys.length} keys`, createdAt: existing!.createdAt, replacedAt: now });
  else await store.deleteCredential(ref(name));
  cache = null;
  await loadPlatformKeys(Date.now(), true);
  return { ok: true, message: `Key removed (${keys.length} left).` };
}

/**
 * The Authorization header for Kaggle's API: the new single token (KGAT_…, sent as Bearer) when set, else the older
 * username + key pair (Basic), which is no longer on Admin → Keys (owner, 2026-11-05) and works only as deployment
 * variables. Undefined when neither is set ("Needs setup").
 */
export function kaggleAuthorization(): string | undefined {
  const token = platformKey("KAGGLE_API_TOKEN");
  if (token) return `Bearer ${token}`;
  const user = platformKey("KAGGLE_USERNAME");
  const key = platformKey("KAGGLE_KEY");
  return user && key ? `Basic ${Buffer.from(`${user}:${key}`).toString("base64")}` : undefined;
}

/** Tests only. */
export function __resetPlatformKeys() {
  cache = null;
}
