"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createRemoteStorage } from "./remoteStorage";
import type { ActivityItem, CareerDNA, CareerInsight, Notification, UpcomingItem } from "@/domain/career/types";
import { EMPTY_DNA } from "@/domain/career/types";
import { computeLearnedSignals, type LearnedSignal, type RejectionRecord } from "@/domain/career/learning";
import { newId } from "@/lib/ids";
import { MAX_SAVED_RESUMES, type SavedResume } from "@/domain/resume/saved";
import type { MemoryKey, RememberedAnswer } from "@/domain/jobs-apply/types";

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
  /** Every "not for me" rejection, capped, with the reason if the candidate gave one. Feeds computeLearnedSignals. */
  rejectionHistory: RejectionRecord[];
  /** Signal ids the candidate dismissed — never resurfaced even once evidence clears the threshold again. */
  dismissedSignals: string[];
  /** Recomputed after every rejection change; read by matching (spec: "not for me" must affect ranking). */
  learnedSignals: LearnedSignal[];
  /** Records one rejection and recomputes learned signals from the full history. */
  recordRejection: (record: RejectionRecord) => void;
  /** Undoing a rejection removes that one record and recomputes — the signal can lose its evidence. */
  clearRejection: (jobId: string) => void;
  /** The candidate agrees the pattern is real; status becomes visible history, behavior is unchanged (it was already active). */
  confirmLearnedSignal: (id: string) => void;
  /** Turns a signal off and remembers not to suggest it again. */
  dismissLearnedSignal: (id: string) => void;
  updateDNA: (patch: Partial<CareerDNA>) => void;
  /** The résumé template the candidate chose (presentation only — never changes a fact). */
  resumeTemplateId?: string;
  setResumeTemplate: (id: string) => void;
  /** Generated résumés, newest first; each a snapshot with its template version. */
  savedResumes: SavedResume[];
  /** Answers the candidate gave on application forms, with when they last confirmed them (JobsApply §83–§85). Offered, never filled on their own. */
  answerMemory: RememberedAnswer[];
  rememberAnswer: (key: MemoryKey, value: string) => void;
  forgetAnswer: (key: MemoryKey) => void;
  saveResume: (r: Omit<SavedResume, "id" | "createdAt">) => SavedResume;
  deleteResume: (id: string) => void;
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
      dna: EMPTY_DNA,
      onboarded: false,
      activity: [],
      upcoming: [],
      insights: [],
      notifications: [],
      plan: "free",
      reminded: [],
      markReminded: (id) => set((s) => ({ reminded: s.reminded.includes(id) ? s.reminded : [...s.reminded, id].slice(-200) })),
      rejectionHistory: [],
      dismissedSignals: [],
      learnedSignals: [],
      recordRejection: (record) =>
        set((s) => {
          const rejectionHistory = [...s.rejectionHistory.filter((r) => r.jobId !== record.jobId), record].slice(-300);
          const dismissed = new Set(s.dismissedSignals);
          return { rejectionHistory, learnedSignals: computeLearnedSignals(rejectionHistory, dismissed) };
        }),
      clearRejection: (jobId) =>
        set((s) => {
          const rejectionHistory = s.rejectionHistory.filter((r) => r.jobId !== jobId);
          const dismissed = new Set(s.dismissedSignals);
          return { rejectionHistory, learnedSignals: computeLearnedSignals(rejectionHistory, dismissed) };
        }),
      confirmLearnedSignal: (id) => set((s) => ({ learnedSignals: s.learnedSignals.map((sig) => (sig.id === id ? { ...sig, status: "confirmed" } : sig)) })),
      dismissLearnedSignal: (id) =>
        set((s) => {
          const dismissedSignals = s.dismissedSignals.includes(id) ? s.dismissedSignals : [...s.dismissedSignals, id].slice(-100);
          return { dismissedSignals, learnedSignals: s.learnedSignals.filter((sig) => sig.id !== id) };
        }),
      updateDNA: (patch) => set((s) => ({ dna: { ...s.dna, ...patch, updatedAt: new Date().toISOString() } })),
      resumeTemplateId: undefined,
      setResumeTemplate: (id) => set({ resumeTemplateId: id }),
      savedResumes: [],
      answerMemory: [],
      rememberAnswer: (key, value) =>
        set((s) => ({ answerMemory: [...(s.answerMemory ?? []).filter((m) => m.key !== key), { key, value: value.trim().slice(0, 500), confirmedAt: new Date().toISOString(), source: "USER_PROVIDED" as const }] })),
      forgetAnswer: (key) => set((s) => ({ answerMemory: (s.answerMemory ?? []).filter((m) => m.key !== key) })),
      saveResume: (r) => {
        const saved: SavedResume = { ...r, id: newId("res"), createdAt: new Date().toISOString() };
        set((s) => ({ savedResumes: [saved, ...s.savedResumes].slice(0, MAX_SAVED_RESUMES) }));
        return saved;
      },
      deleteResume: (id) => set((s) => ({ savedResumes: s.savedResumes.filter((r) => r.id !== id) })),
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
