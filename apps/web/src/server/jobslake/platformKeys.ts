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
}

export const PLATFORM_KEYS: PlatformKeySpec[] = [
  { name: "ADZUNA_APP_ID", label: "Adzuna app ID", usedBy: "Jobs (India), Internships, Teaching (India + UK, US, Canada, Australia, New Zealand, South Africa, Singapore)", signup: "https://developer.adzuna.com/signup", free: true },
  { name: "ADZUNA_APP_KEY", label: "Adzuna app key", usedBy: "With the Adzuna app ID", signup: "https://developer.adzuna.com/signup", free: true },
  { name: "USAJOBS_API_KEY", label: "USAJOBS API key", usedBy: "Jobs, Teaching and Internships: US government roles", signup: "https://developer.usajobs.gov/APIRequest/Index", free: true },
  { name: "USAJOBS_EMAIL", label: "USAJOBS email", usedBy: "The email the USAJOBS key was registered to", signup: "https://developer.usajobs.gov/APIRequest/Index", free: true },
  { name: "TICKETMASTER_API_KEY", label: "Ticketmaster API key", usedBy: "Events: concerts, sport, theatre and family events", signup: "https://developer.ticketmaster.com/", free: true },
  { name: "JOOBLE_API_KEY", label: "Jooble API key", usedBy: "Jobs, Teaching and Internships searches through Jooble", signup: "https://jooble.org/api/about", free: true },
  { name: "KAGGLE_USERNAME", label: "Kaggle username", usedBy: "Scholarships & Projects: Kaggle competitions (with the Kaggle key)", signup: "https://www.kaggle.com/settings/account", free: true },
  { name: "KAGGLE_KEY", label: "Kaggle API key", usedBy: "Scholarships & Projects: Kaggle competitions (Settings → API → Create New Token)", signup: "https://www.kaggle.com/settings/account", free: true },
  { name: "THEMUSE_API_KEY", label: "The Muse API key", usedBy: "Internships from The Muse (higher rate limit)", signup: "https://www.themuse.com/developers/api/v2", free: true },
];

const NAMES = new Set(PLATFORM_KEYS.map((k) => k.name));
const ref = (name: string) => `platform:${name}`;
const TTL = 60_000;
let cache: { at: number; values: Record<string, string> } | null = null;

/** Reads the admin's keys into memory (at most once a minute; a failed read keeps what was there). */
export async function loadPlatformKeys(now = Date.now(), force = false): Promise<void> {
  if (!force && cache && now - cache.at < TTL) return;
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

export interface PlatformKeyStatus extends PlatformKeySpec {
  set: boolean;
  from: "platform" | "environment" | null;
  masked: string;
}

/** Every key, whether it's set and where from, masked — never a value. */
export async function platformKeyStatus(): Promise<PlatformKeyStatus[]> {
  await loadPlatformKeys(Date.now(), true);
  return PLATFORM_KEYS.map((k) => {
    const env = process.env[k.name]?.trim();
    const mine = cache?.values[k.name];
    return { ...k, set: !!(env || mine), from: env ? "environment" : mine ? "platform" : null, masked: env ? "Set in the deployment" : mine ? maskCredential(mine) : "Not set" };
  });
}

/** The admin sets, replaces or (with null) removes one key. */
export async function setPlatformKey(name: string, value: string | null, now = new Date().toISOString()): Promise<{ ok: boolean; message: string }> {
  if (!NAMES.has(name)) return { ok: false, message: "Unknown key." };
  const store = jobsLakeStore();
  if (value === null) {
    await store.deleteCredential(ref(name));
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

/** Tests only. */
export function __resetPlatformKeys() {
  cache = null;
}
