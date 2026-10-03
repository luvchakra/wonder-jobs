"use client";
import { useEffect } from "react";
import { DEFAULT_PLANS, limitsFor, type PlanId, type PlanLimits, type PlansConfig } from "@/domain/billing/plans";
import { getClientMode } from "@/lib/mode";
import { useBillingStore } from "@/store/billing";

/** The account's plan and its limits, as the server reports them; Free's defaults until then. The demo is never limited. */
export function usePlan(): { plan: PlanId; limits: PlanLimits; plans: PlansConfig["plans"]; loaded: boolean } {
  const data = useBillingStore((s) => s.data);
  const status = useBillingStore((s) => s.status);
  const load = useBillingStore((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);
  const plans = data?.plans ?? DEFAULT_PLANS.plans;
  if (typeof document !== "undefined" && getClientMode().mode === "demo") return { plan: "max", limits: plans.max, plans, loaded: true };
  const plan = data?.plan ?? "free";
  return { plan, limits: data?.limits ?? limitsFor(plan, { ...DEFAULT_PLANS, plans }), plans, loaded: status === "ready" || status === "error" };
}
