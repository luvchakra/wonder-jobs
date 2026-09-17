"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { remoteStorage } from "./remoteStorage";
import { AI_PROVIDERS, type AIProviderConfig, type AIProviderId, type AIUsageRecord, type BYOKStatus } from "@/domain/ai/types";
import { track } from "@/lib/analytics";

interface AIState {
  config: AIProviderConfig;
  usage: AIUsageRecord[];
  keysLoaded: boolean;
  selectProvider: (id: AIProviderId, model?: string) => void;
  setModel: (model: string) => void;
  setBYOK: (status: BYOKStatus) => void;
  clearBYOK: (id: AIProviderId) => void;
  setAllowPlatformFallback: (v: boolean) => void;
  recordUsage: (r: AIUsageRecord) => void;
  /** Loads masked key status from the server (never plaintext). */
  refreshKeys: () => Promise<void>;
  connectKey: (id: AIProviderId, apiKey: string, model?: string) => Promise<BYOKStatus>;
  revokeKey: (id: AIProviderId) => Promise<void>;
}

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      config: { activeProvider: "wonderjobs", activeModel: "wonder-1", byok: {}, allowPlatformFallback: false },
      usage: [],
      keysLoaded: false,
      selectProvider: (id, model) => {
        track("provider_selected", { provider: id });
        set((s) => ({ config: { ...s.config, activeProvider: id, activeModel: model ?? AI_PROVIDERS[id].models.find((m) => m.default)?.id ?? AI_PROVIDERS[id].models[0].id } }));
      },
      setModel: (model) => set((s) => ({ config: { ...s.config, activeModel: model } })),
      setBYOK: (status) => set((s) => ({ config: { ...s.config, byok: { ...s.config.byok, [status.provider]: status } } })),
      clearBYOK: (id) =>
        set((s) => {
          const byok = { ...s.config.byok };
          delete byok[id];
          const active = s.config.activeProvider === id ? "wonderjobs" : s.config.activeProvider;
          return { config: { ...s.config, byok, activeProvider: active, activeModel: active === "wonderjobs" ? "wonder-1" : s.config.activeModel } };
        }),
      setAllowPlatformFallback: (v) => set((s) => ({ config: { ...s.config, allowPlatformFallback: v } })),
      recordUsage: (r) => set((s) => ({ usage: [r, ...s.usage].slice(0, 500) })),
      refreshKeys: async () => {
        try {
          const res = await fetch("/api/ai/keys", { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as { keys: BYOKStatus[] };
          set((s) => ({ keysLoaded: true, config: { ...s.config, byok: Object.fromEntries(data.keys.map((k) => [k.provider, k])) } }));
        } catch {
          set({ keysLoaded: true });
        }
      },
      connectKey: async (id, apiKey, model) => {
        const res = await fetch("/api/ai/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: id, apiKey, model }) });
        const data = (await res.json()) as { status?: BYOKStatus; error?: string };
        if (!res.ok || !data.status) throw new Error(data.error ?? "Could not save the key");
        track("byok_connected", { provider: id });
        get().setBYOK(data.status);
        return data.status;
      },
      revokeKey: async (id) => {
        const res = await fetch(`/api/ai/keys?provider=${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Could not remove the key");
        track("byok_removed", { provider: id });
        get().clearBYOK(id);
      },
    }),
    {
      name: "wj.ai",
      storage: createJSONStorage(() => remoteStorage),
      skipHydration: true,
      version: 1,
      // BYOK status is server-owned; only the selection and usage persist locally.
      partialize: (s) => ({ config: { ...s.config, byok: {} }, usage: s.usage }),
    },
  ),
);
