/**
 * The JobsLake developer API: API keys, which sources a key may reach, and metering against the
 * free allowance / pay-as-you-go (domain/jobslake/apiPlan.ts).
 *
 * Keys look like `jl_live_<43 base64url chars>` (256 random bits). Only their SHA-256 is stored; the
 * key is returned once, at creation, and never logged. Every owner-facing operation takes the
 * session's tenant id and touches only that owner's keys.
 */
import { randomBytes } from "node:crypto";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { apiPlanConfig, decideQuota, utcDay } from "@/domain/jobslake/apiPlan";
import { sha256Hex } from "@/server/crypto";
import { apiStore, type ApiKeyRecord } from "./apiStore";
import { BUILTIN_SOURCES } from "./registry";
import type { SourceRecord } from "./types";

export const KEY_PREFIX = "jl_live_";
export const MAX_ACTIVE_KEYS = 5;
const SHOWN_PREFIX = 12;

export class ApiKeyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiKeyError";
  }
}

/** What the owner sees of a key: never the hash, never the key. */
export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

const view = (k: ApiKeyRecord): ApiKeyView => ({ id: k.id, name: k.name, prefix: k.prefix, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt, revokedAt: k.revokedAt });

export const hashKey = (key: string) => sha256Hex(key);

export async function listApiKeys(ownerId: string): Promise<ApiKeyView[]> {
  return (await apiStore().listKeys(ownerId)).map(view);
}

/** Creates a key for the owner. The returned `key` is the only time it exists outside the caller's hands. */
export async function createApiKey(ownerId: string, name: string): Promise<{ key: string; apiKey: ApiKeyView }> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!clean) throw new ApiKeyError("Name the key so you can tell it apart later.", 400);
  const store = apiStore();
  const active = (await store.listKeys(ownerId)).filter((k) => !k.revokedAt);
  if (active.length >= MAX_ACTIVE_KEYS) throw new ApiKeyError(`You can have up to ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`, 409);
  const key = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  const rec: ApiKeyRecord = { id: `key_${randomBytes(9).toString("base64url")}`, ownerId, name: clean, prefix: key.slice(0, SHOWN_PREFIX), keyHash: hashKey(key), createdAt: new Date().toISOString() };
  await store.createKey(rec);
  return { key, apiKey: view(rec) };
}

export async function revokeApiKey(ownerId: string, id: string): Promise<boolean> {
  if (!/^key_[\w-]{6,40}$/.test(id)) return false;
  return apiStore().revokeKey(ownerId, id, new Date().toISOString());
}

/** The key a request presents, if it presents one: `Authorization: Bearer jl_live_…` or `x-api-key`. */
export function presentedKey(req: Request): string | null {
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (bearer.startsWith(KEY_PREFIX)) return bearer;
  const header = (req.headers.get("x-api-key") ?? "").trim();
  return header ? header : null;
}

/** The key's owner, or null for an unknown, malformed or revoked key. */
export async function authenticateKey(key: string): Promise<{ ownerId: string; keyId: string } | null> {
  if (!key.startsWith(KEY_PREFIX) || key.length < KEY_PREFIX.length + 32 || key.length > 200) return null;
  const store = apiStore();
  const k = await store.findKeyByHash(hashKey(key));
  if (!k || k.revokedAt) return null;
  // Last-used is a convenience for the owner; failing to record it never fails the request.
  store.touchKey(k.ownerId, k.id, new Date().toISOString()).catch(() => undefined);
  return { ownerId: k.ownerId, keyId: k.id };
}

/* ------------------------------------------------------------- sources */

/**
 * Sources an API key may reach: only those whose terms permit redistribution. Set explicitly with
 * JOBSLAKE_API_SOURCE_IDS; by default the built-in employer career-board (ATS) sources — public
 * postings employers publish through their own ATS's public API.
 */
export function apiSourceIds(env: Record<string, string | undefined> = process.env): string[] {
  const set = (env.JOBSLAKE_API_SOURCE_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (set.length) return [...new Set(set)];
  return BUILTIN_SOURCES.filter((s) => s.category === "ats" && s.accessStrategy === "official_api").map((s) => s.id);
}

/** The sources a developer search may use: the allowlist, narrowed to the ones they asked for (by id or WonderJobs source id). */
export function developerSources(requested: string[] | undefined, sources: Pick<SourceRecord, "id" | "legacySourceId">[], allow = apiSourceIds()): string[] {
  const allowed = new Set(allow);
  const wanted = requested?.length ? new Set(requested) : null;
  return sources.filter((s) => allowed.has(s.id) && (!wanted || wanted.has(s.id) || (!!s.legacySourceId && wanted.has(s.legacySourceId)))).map((s) => s.id);
}

/**
 * What a developer may receive of an opportunity: only one whose canonical fields all came from
 * allowed sources, with sightings on other sources removed. Undefined when it isn't theirs to have.
 */
export function forDeveloper(o: CanonicalOpportunity, allow: Set<string>): CanonicalOpportunity | undefined {
  const canonical = o.sourceRecords.find((r) => r.canonical) ?? o.sourceRecords[0];
  if (!canonical || !allow.has(canonical.sourceId)) return undefined;
  if (o.provenance.some((p) => !allow.has(p.sourceId))) return undefined;
  const records = o.sourceRecords.filter((r) => allow.has(r.sourceId));
  return records.length === o.sourceRecords.length ? o : { ...o, sourceRecords: records, quality: { ...o.quality, sourceCount: records.length } };
}

/* ------------------------------------------------------------ metering */

export type MeterResult = { ok: true; refund: () => Promise<void> } | { ok: false; status: number; code: "QUOTA_EXCEEDED" | "INTERNAL"; message: string };

/**
 * Charges `units` to the owner for a request that already passed validation and the gate: meters
 * atomically, then decides. A refused request is refunded at once, so a 402 costs nothing. Fails
 * closed: if usage can't be recorded, or billing can't be read, nothing past the free allowance runs.
 */
export async function chargeUnits(ownerId: string, units = 1, now = new Date()): Promise<MeterResult> {
  const store = apiStore();
  const day = utcDay(now);
  let total: number;
  try {
    total = await store.meter(ownerId, day, units);
  } catch (e) {
    console.error(`[jobslake-api] metering failed: ${e instanceof Error ? e.message : "unknown"}`);
    return { ok: false, status: 503, code: "INTERNAL", message: "Usage couldn't be recorded just now, so the request didn't run. Try again shortly." };
  }
  const refund = async () => {
    await store.meter(ownerId, day, -units).catch((e) => console.error(`[jobslake-api] refund failed: ${e instanceof Error ? e.message : "unknown"}`));
  };
  const config = apiPlanConfig();
  let billingActive = false;
  if (total > config.freeMonthly) billingActive = (await store.getBilling(ownerId).catch(() => undefined))?.status === "active";
  const d = decideQuota({ totalAfter: total, units, billingActive, config });
  if (d.allowed) return { ok: true, refund };
  await refund();
  return { ok: false, status: d.reason === "safety_cap" ? 429 : 402, code: "QUOTA_EXCEEDED", message: d.message };
}
