"use client";
import { create } from "zustand";
import type { UploadedResume } from "@/domain/resume/files";
import { getClientMode } from "@/lib/mode";

/**
 * The candidate's uploaded résumé files, as the server lists them. Metadata only; not persisted in the
 * browser (the files live encrypted on the server). The demo has no account, so nothing is fetched there.
 */
interface ResumeFilesState {
  files: UploadedResume[];
  status: "idle" | "loading" | "ready" | "error" | "demo";
  load: (force?: boolean) => Promise<void>;
  upload: (file: File) => Promise<UploadedResume>;
  remove: (id: string) => Promise<void>;
}

async function errorOf(res: Response, fallback: string) {
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(d.error ?? fallback);
}

export const useResumeFilesStore = create<ResumeFilesState>((set, get) => ({
  files: [],
  status: "idle",
  load: async (force = false) => {
    if (getClientMode().mode === "demo") return set({ status: "demo", files: [] });
    if (!force && (get().status === "loading" || get().status === "ready")) return;
    set({ status: "loading" });
    try {
      const res = await fetch("/api/resume-files", { cache: "no-store" });
      if (!res.ok) throw await errorOf(res, "Couldn't load your files");
      set({ files: ((await res.json()) as { files: UploadedResume[] }).files, status: "ready" });
    } catch {
      set({ status: "error" });
    }
  },
  upload: async (file) => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/resume-files", { method: "POST", body });
    if (!res.ok) throw await errorOf(res, "Your file couldn't be uploaded");
    const { file: meta } = (await res.json()) as { file: UploadedResume };
    set((s) => ({ files: [meta, ...s.files.filter((f) => f.id !== meta.id)] }));
    return meta;
  },
  remove: async (id) => {
    const res = await fetch(`/api/resume-files/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw await errorOf(res, "That file couldn't be deleted");
    set((s) => ({ files: s.files.filter((f) => f.id !== id) }));
  },
}));
