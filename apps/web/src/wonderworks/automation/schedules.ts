"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createRemoteStorage, onRemoteChange } from "@/store/remoteStorage";
import { cleanSchedule, MODULE_SCHEDULES_CAP, type ModuleSchedule } from "@/domain/moduleSchedules";

interface SchedulesState {
  schedules: ModuleSchedule[];
  add: (raw: Partial<ModuleSchedule>) => ModuleSchedule | null;
  setEnabled: (id: string, enabled: boolean) => void;
  remove: (id: string) => void;
}

const NAME = "wj.m.schedules";

/**
 * The person's scheduled searches in every module but Jobs (owner, 2026-11-01), synced to the account like the module
 * stores. Only what they set lives here; the server keeps each one's run state (wj.schedruns), so the two never race.
 */
export const useModuleSchedules = create<SchedulesState>()(
  persist(
    (set, get) => ({
      schedules: [],
      add: (raw) => {
        if (get().schedules.length >= MODULE_SCHEDULES_CAP) return null;
        const id = `ms_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const s = cleanSchedule({ offsetMin: -new Date().getTimezoneOffset(), ...raw }, new Date(), id);
        if (s) set((st) => ({ schedules: [s, ...st.schedules] }));
        return s;
      },
      setEnabled: (id, enabled) => set((st) => ({ schedules: st.schedules.map((s) => (s.id === id ? { ...s, enabled } : s)) })),
      remove: (id) => set((st) => ({ schedules: st.schedules.filter((s) => s.id !== id) })),
    }),
    { name: NAME, version: 1, storage: createRemoteStorage<{ schedules: ModuleSchedule[] }>(), skipHydration: true, partialize: (s) => ({ schedules: s.schedules.slice(0, MODULE_SCHEDULES_CAP) }) },
  ),
);

if (typeof window !== "undefined") {
  void useModuleSchedules.persist.rehydrate();
  onRemoteChange((changed) => {
    if (changed === NAME) void useModuleSchedules.persist.rehydrate();
  });
}
