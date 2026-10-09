"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createRemoteStorage } from "./remoteStorage";
import { defaultPolicy, offeredLevel, migratePolicy, POLICY_VERSION, type AutomationLevel, type AutomationPolicy, type Capability, type PolicyMode } from "@/domain/automation/policy";
import { track } from "@/lib/analytics";

interface AutomationState {
  policy: AutomationPolicy;
  defaultLevel: AutomationLevel;
  setCapability: (c: Capability, mode: PolicyMode) => void;
  setDefaultLevel: (l: AutomationLevel) => void;
  /** How the candidate applies by default — set once here, changeable for one job on its apply page. */
  applyMethod: "helper" | "guided" | "pack";
  setApplyMethod: (m: "helper" | "guided" | "pack") => void;
  resetPolicy: () => void;
}

export const useAutomationStore = create<AutomationState>()(
  persist(
    (set) => ({
      policy: defaultPolicy(),
      defaultLevel: "guided",
      setCapability: (c, mode) => {
        track("automation_policy_changed", { capability: c, mode });
        set((s) => ({ policy: { ...s.policy, [c]: mode } }));
      },
      setDefaultLevel: (l) => set({ defaultLevel: l }),
      applyMethod: "helper",
      setApplyMethod: (m) => set({ applyMethod: m }),
      resetPolicy: () => set({ policy: defaultPolicy() }),
    }),
    {
      name: "wj.automation",
      storage: createRemoteStorage(),
      skipHydration: true,
      version: POLICY_VERSION,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<AutomationState>;
        return { ...p, policy: migratePolicy(p.policy, version) } as AutomationState;
      },
      // A capability added after the policy was saved (e.g. fill_application) takes its default, which is
      // never more permissive than "ask" for anything medium or high risk.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AutomationState>;
        // Only two levels are offered now: a saved "Help me" or "Keep watch" becomes the nearest of them.
        return { ...current, ...p, ...(p.defaultLevel ? { defaultLevel: offeredLevel(p.defaultLevel) } : {}), policy: { ...defaultPolicy(), ...(p.policy ?? {}) } };
      },
    },
  ),
);
