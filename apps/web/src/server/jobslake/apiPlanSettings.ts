import { apiPlanConfig, type ApiPlanConfig, type StoredApiPlan } from "@/domain/jobslake/apiPlan";
import { stateStore } from "@/server/state";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";

/**
 * JobsLake API pricing as a billing admin set it (Billing → JobsLake API), kept in the platform
 * state store. Precedence everywhere: this stored value, then the environment, then the defaults.
 *
 * Read through a short cache so a metered request doesn't add a database round trip; a save
 * refreshes this instance at once and every other within CACHE_MS. If the store can't be read,
 * the last value read is kept (never silently dropped back to the environment while one exists).
 */
const CACHE_MS = 30_000;
const DOC = "wj.apiplan";
let cache: { at: number; value: StoredApiPlan | undefined } | null = null;

function clean(raw: unknown): StoredApiPlan | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined);
  const ids = Array.isArray(r.sourceIds) ? r.sourceIds.filter((s): s is string => typeof s === "string" && /^[\w.-]{1,80}$/.test(s)) : undefined;
  return {
    freeMonthly: int(r.freeMonthly),
    maxMonthly: int(r.maxMonthly),
    sourceIds: ids?.length ? ids : undefined,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : undefined,
    updatedBy: typeof r.updatedBy === "string" ? r.updatedBy : undefined,
  };
}

/** The stored settings (cached). */
export async function loadApiPlan(force = false): Promise<StoredApiPlan | undefined> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const doc = await stateStore.get(PLATFORM_TENANT, DOC);
    cache = { at: Date.now(), value: clean(doc?.state) };
  } catch (e) {
    console.error(`[jobslake-api] stored API pricing unreadable: ${e instanceof Error ? e.message : "unknown"}`);
    cache = { at: Date.now(), value: cache?.value };
  }
  return cache.value;
}

/** What was last read — for code that can't wait (shaping a streamed event). Entry points call `loadApiPlan` first. */
export function cachedApiPlan(): StoredApiPlan | undefined {
  return cache?.value;
}

/** The free allowance and safety cap in force now. */
export async function currentApiPlan(): Promise<ApiPlanConfig> {
  return apiPlanConfig(process.env, await loadApiPlan());
}

export async function saveApiPlan(value: Required<Pick<StoredApiPlan, "freeMonthly" | "maxMonthly" | "sourceIds">>, actor: string): Promise<StoredApiPlan> {
  const doc: StoredApiPlan = { ...value, updatedAt: new Date().toISOString(), updatedBy: actor };
  await stateStore.put(PLATFORM_TENANT, DOC, doc);
  cache = { at: Date.now(), value: doc };
  return doc;
}

/** Tests only. */
export function __resetApiPlanCache() {
  cache = null;
}
