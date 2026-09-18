"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createRemoteStorage } from "./remoteStorage";
import type { ActivityItem, CareerDNA, CareerInsight, Notification, UpcomingItem } from "@/domain/career/types";
import { SEED_DNA, seedActivity, seedInsights, seedNotifications, seedUpcoming } from "@/services/mock/seed";
import { newId } from "@/lib/ids";

interface CareerState {
  dna: CareerDNA;
  onboarded: boolean;
  activity: ActivityItem[];
  upcoming: UpcomingItem[];
  insights: CareerInsight[];
  notifications: Notification[];
  plan: "free" | "pro";
  /** Follow-up ids already turned into a notification, so reminders fire once. */
  reminded: string[];
  markReminded: (id: string) => void;
  updateDNA: (patch: Partial<CareerDNA>) => void;
  completeOnboarding: () => void;
  addActivity: (item: Omit<ActivityItem, "id" | "at">) => void;
  addUpcoming: (item: Omit<UpcomingItem, "id">) => void;
  notify: (n: Omit<Notification, "id" | "at" | "read">) => void;
  markRead: (id?: string) => void;
  setInsights: (insights: CareerInsight[]) => void;
}

export const useCareerStore = create<CareerState>()(
  persist(
    (set) => ({
      dna: SEED_DNA,
      onboarded: true,
      activity: seedActivity(),
      upcoming: seedUpcoming(),
      insights: seedInsights(),
      notifications: seedNotifications(),
      plan: "free",
      reminded: [],
      markReminded: (id) => set((s) => ({ reminded: s.reminded.includes(id) ? s.reminded : [...s.reminded, id].slice(-200) })),
      updateDNA: (patch) => set((s) => ({ dna: { ...s.dna, ...patch, updatedAt: new Date().toISOString() } })),
      completeOnboarding: () => set({ onboarded: true }),
      addActivity: (item) => set((s) => ({ activity: [{ ...item, id: newId("act"), at: new Date().toISOString() }, ...s.activity].slice(0, 30) })),
      addUpcoming: (item) => set((s) => ({ upcoming: [...s.upcoming, { ...item, id: newId("up") }].sort((a, b) => a.at.localeCompare(b.at)) })),
      notify: (n) => set((s) => ({ notifications: [{ ...n, id: newId("ntf"), at: new Date().toISOString(), read: false }, ...s.notifications].slice(0, 50) })),
      markRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (id == null || n.id === id ? { ...n, read: true } : n)) })),
      setInsights: (insights) => set({ insights }),
    }),
    { name: "wj.career", storage: createRemoteStorage(), skipHydration: true, version: 1 },
  ),
);
