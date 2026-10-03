import { DEFAULT_PLANS, mergePlansConfig, monthKey, type PlansConfig, type PlanId } from "@/domain/billing/plans";
import { stateStore } from "@/server/state";
import { razorpayConfig, stripeConfig } from "./config";

/** The operator's plan configuration lives under a tenant no account can be: it's read by everyone, written only from the operator page. */
const PLATFORM_TENANT = "__platform__";

/** The current plans: stored overrides on top of the defaults, with the deployment's price ids filling any gap. */
export async function getPlansConfig(): Promise<PlansConfig> {
  const doc = await stateStore.get(PLATFORM_TENANT, "wj.plans").catch(() => undefined);
  const cfg = mergePlansConfig(doc?.state ?? DEFAULT_PLANS);
  const s = stripeConfig();
  const r = razorpayConfig();
  cfg.priceRefs.pro.stripe ||= s?.priceId;
  cfg.priceRefs.pro.razorpay ||= r?.planId;
  cfg.priceRefs.max.stripe ||= s?.priceIdMax;
  cfg.priceRefs.max.razorpay ||= r?.planIdMax;
  return cfg;
}

export async function savePlansConfig(input: unknown, actor: string): Promise<PlansConfig> {
  const cfg = { ...mergePlansConfig(input), updatedAt: new Date().toISOString(), updatedBy: actor };
  await stateStore.put(PLATFORM_TENANT, "wj.plans", cfg);
  return cfg;
}

interface PlanUsageDoc {
  /** Drafts written by WonderJobs AI, by calendar month. */
  drafts?: Record<string, number>;
  /** A plan switched on for testing, with no payment (see `testPlanAllowed`). */
  testPlan?: { plan: PlanId; at: string; byAdmin: boolean };
}

/** The testing plan this tenant switched to, if any. */
export async function readTestPlan(tenantId: string): Promise<PlanUsageDoc["testPlan"]> {
  const doc = await stateStore.get(tenantId, "wj.plan").catch(() => undefined);
  return ((doc?.state ?? {}) as PlanUsageDoc).testPlan;
}

/** Switch this tenant to a plan for testing (null goes back to what was paid for). */
export async function writeTestPlan(tenantId: string, plan: PlanId | null, byAdmin: boolean): Promise<void> {
  const doc = await stateStore.get(tenantId, "wj.plan").catch(() => undefined);
  const state = { ...((doc?.state ?? {}) as PlanUsageDoc) };
  if (plan) state.testPlan = { plan, at: new Date().toISOString(), byAdmin };
  else delete state.testPlan;
  await stateStore.put(tenantId, "wj.plan", state);
}

/** WonderJobs AI drafts this tenant has used this month. A connected own-AI key never goes through here. */
export async function draftUsage(tenantId: string, now = new Date()): Promise<number> {
  const doc = await stateStore.get(tenantId, "wj.plan").catch(() => undefined);
  const state = (doc?.state ?? {}) as PlanUsageDoc;
  return state.drafts?.[monthKey(now)] ?? 0;
}

export async function countDraft(tenantId: string, now = new Date()): Promise<void> {
  const doc = await stateStore.get(tenantId, "wj.plan").catch(() => undefined);
  const state = (doc?.state ?? {}) as PlanUsageDoc;
  const key = monthKey(now);
  // Only the current and previous month are kept — enough for the quota and a "last month" line.
  const drafts = Object.fromEntries(Object.entries(state.drafts ?? {}).filter(([k]) => k >= monthKey(new Date(now.getTime() - 31 * 86_400_000))));
  drafts[key] = (drafts[key] ?? 0) + 1;
  await stateStore.put(tenantId, "wj.plan", { ...state, drafts });
}
