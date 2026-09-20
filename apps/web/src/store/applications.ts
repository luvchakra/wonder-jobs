"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createRemoteStorage } from "./remoteStorage";
import type { Application, ApplicationArtifact, ApplicationEvent, ApplicationStatus, ArtifactType, ArtifactVersion } from "@/domain/applications/types";
import { newId } from "@/lib/ids";

interface ApplicationsState {
  applications: Record<string, Application>;
  create: (jobId: string, status?: ApplicationStatus) => Application;
  setStatus: (id: string, status: ApplicationStatus, event?: Omit<ApplicationEvent, "id" | "applicationId" | "at">) => void;
  addEvent: (id: string, event: Omit<ApplicationEvent, "id" | "applicationId" | "at">) => void;
  addVersion: (id: string, type: ArtifactType, version: Omit<ArtifactVersion, "id" | "createdAt">) => ArtifactVersion;
  /** Autosave: rewrites the *current* version's content in place rather than creating a new version — a version is a deliberate snapshot (a generation or a restore), not every keystroke. */
  updateVersionContent: (id: string, type: ArtifactType, content: string) => void;
  restoreVersion: (id: string, type: ArtifactType, versionId: string) => void;
  setNextAction: (id: string, nextAction?: string, followUpAt?: string) => void;
  completeFollowUp: (id: string, followUpId: string) => void;
  addFollowUp: (id: string, f: { dueAt: string; kind: "follow_up" | "interview" | "thank_you"; note: string }) => void;
  remove: (id: string) => void;
}

export const useApplicationsStore = create<ApplicationsState>()(
  persist(
    (set, get) => ({
      applications: {},
      create: (jobId, status = "saved") => {
        const existing = Object.values(get().applications).find((a) => a.jobId === jobId);
        if (existing) return existing;
        const app: Application = {
          id: newId("app"),
          jobId,
          status,
          createdAt: new Date().toISOString(),
          artifacts: [],
          events: [{ id: newId("ev"), applicationId: "", type: "discovered", at: new Date().toISOString(), title: "Job discovered" }],
          followUps: [],
          submissionKey: `submit:${jobId}:me`,
        };
        app.events[0].applicationId = app.id;
        set((s) => ({ applications: { ...s.applications, [app.id]: app } }));
        return app;
      },
      setStatus: (id, status, event) =>
        set((s) => {
          const a = s.applications[id];
          if (!a) return s;
          const events = event ? [...a.events, { ...event, id: newId("ev"), applicationId: id, at: new Date().toISOString() }] : a.events;
          return { applications: { ...s.applications, [id]: { ...a, status, events, appliedAt: status === "submitted" ? new Date().toISOString() : a.appliedAt } } };
        }),
      addEvent: (id, event) =>
        set((s) => {
          const a = s.applications[id];
          if (!a) return s;
          return { applications: { ...s.applications, [id]: { ...a, events: [...a.events, { ...event, id: newId("ev"), applicationId: id, at: new Date().toISOString() }] } } };
        }),
      addVersion: (id, type, version) => {
        const v: ArtifactVersion = { ...version, id: newId("ver"), createdAt: new Date().toISOString() };
        set((s) => {
          const a = s.applications[id];
          if (!a) return s;
          let artifacts = a.artifacts;
          const existing = artifacts.find((x) => x.type === type);
          if (existing) {
            artifacts = artifacts.map((x) => (x.type === type ? { ...x, versions: [...x.versions, v], currentVersionId: v.id } : x));
          } else {
            const art: ApplicationArtifact = { id: newId("art"), applicationId: id, type, versions: [v], currentVersionId: v.id };
            artifacts = [...artifacts, art];
          }
          return { applications: { ...s.applications, [id]: { ...a, artifacts } } };
        });
        return v;
      },
      updateVersionContent: (id, type, content) =>
        set((s) => {
          const a = s.applications[id];
          if (!a) return s;
          return {
            applications: {
              ...s.applications,
              [id]: {
                ...a,
                artifacts: a.artifacts.map((x) => {
                  if (x.type !== type) return x;
                  const versions = x.versions.map((v) => (v.id === x.currentVersionId ? { ...v, content, provenance: v.provenance === "AI_GENERATED" ? "USER_MODIFIED" : v.provenance } : v));
                  return { ...x, versions };
                }),
              },
            },
          };
        }),
      restoreVersion: (id, type, versionId) =>
        set((s) => {
          const a = s.applications[id];
          if (!a) return s;
          return { applications: { ...s.applications, [id]: { ...a, artifacts: a.artifacts.map((x) => (x.type === type ? { ...x, currentVersionId: versionId } : x)) } } };
        }),
      setNextAction: (id, nextAction, followUpAt) =>
        set((s) => {
          const a = s.applications[id];
          if (!a) return s;
          return { applications: { ...s.applications, [id]: { ...a, nextAction, followUpAt } } };
        }),
      completeFollowUp: (id, followUpId) =>
        set((s) => {
          const a = s.applications[id];
          if (!a) return s;
          return { applications: { ...s.applications, [id]: { ...a, followUps: a.followUps.map((f) => (f.id === followUpId ? { ...f, done: true } : f)) } } };
        }),
      addFollowUp: (id, f) =>
        set((s) => {
          const a = s.applications[id];
          if (!a) return s;
          return { applications: { ...s.applications, [id]: { ...a, followUps: [...a.followUps, { ...f, id: newId("fu"), applicationId: id, done: false }], followUpAt: f.dueAt } } };
        }),
      remove: (id) =>
        set((s) => {
          const applications = { ...s.applications };
          delete applications[id];
          return { applications };
        }),
    }),
    { name: "wj.applications", storage: createRemoteStorage(), skipHydration: true, version: 1 },
  ),
);
