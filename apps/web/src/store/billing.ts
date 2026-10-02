"use client";
import { create } from "zustand";
import type { BillingProviderId, ProviderAvailability, SubscriptionStatus } from "@/domain/billing/types";

/**
 * The account's plan, as the SERVER reports it (`/api/billing`). Not persisted and never written
 * by the browser: the plan badge reflects what a verified payment-provider webhook established.
 */
export interface BillingSnapshot {
  providers: ProviderAvailability[];
  plan: "free" | "pro";
  reason: string;
  until: string | null;
  subscription: { provider: BillingProviderId; status: SubscriptionStatus; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null; canManage: boolean } | null;
  payments: { at: string; provider: BillingProviderId; kind: "payment_succeeded" | "payment_failed"; amount: number | null; currency: string | null }[];
}

interface BillingState {
  data: BillingSnapshot | null;
  status: "idle" | "loading" | "ready" | "error";
  load: (force?: boolean) => Promise<BillingSnapshot | null>;
}

export const useBillingStore = create<BillingState>((set, get) => ({
  data: null,
  status: "idle",
  load: async (force = false) => {
    if (!force && (get().status === "loading" || get().status === "ready")) return get().data;
    set({ status: "loading" });
    try {
      const res = await fetch("/api/billing", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as BillingSnapshot;
      set({ data, status: "ready" });
      return data;
    } catch {
      set({ status: "error" });
      return null;
    }
  },
}));

/** Any provider the candidate could pay with right now. */
export const canUpgrade = (d: BillingSnapshot | null) => !!d && d.plan === "free" && d.providers.some((p) => p.state === "ready");
