"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createRemoteStorage } from "./remoteStorage";
import { defaultPolicy, type AutomationLevel, type AutomationPolicy, type Capability, type PolicyMode } from "@/domain/automation/policy";
import { track } from "@/lib/analytics";

interface AutomationState {
  policy: AutomationPolicy;
  defaultLevel: AutomationLevel;
  setCapability: (c: Capability, mode: PolicyMode) => void;
  setDefaultLevel: (l: AutomationLevel) => void;
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
      resetPolicy: () => set({ policy: defaultPolicy() }),
    }),
    { name: "wj.automation", storage: createRemoteStorage(), skipHydration: true, version: 1 },
  ),
);
