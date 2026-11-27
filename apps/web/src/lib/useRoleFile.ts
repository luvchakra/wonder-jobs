"use client";
import { useEffect, useState } from "react";
import type { CareerRole } from "@/domain/career/roles";
import type { CareerDNA } from "@/domain/career/types";
import { dnaFromDocument, dnaFromReading, fileRoleSkills, type FileReading } from "@/domain/career/roleFile";
import { getTemplate } from "@/domain/resume/templates";
import { draftingProfile } from "@/domain/career/profiles";
import { useCareerStore } from "@/store/career";
import { useResumeFilesStore } from "@/store/resumeFiles";

/**
 * A role's own résumé as the person things are built from for it (domain/career/roleFile.ts). `none`: the role has
 * no file of its own (the Career Profile is used). `reading` / `failed`: there is one, and nothing is built from the
 * Career Profile in its place — never someone else's details under the file's name.
 */
export type RoleFile = { state: "none" } | { state: "reading"; file: string } | { state: "failed"; file: string; error: string } | { state: "ready"; file: string; dna: CareerDNA };

/** Readings of stored files this session, by file id (a changed file is another id): at most a few, newest kept. */
const MAX_READINGS = 8;
const readings = new Map<string, Promise<{ dna: CareerDNA } | { error: string }>>();

function readStored(fileId: string): Promise<{ dna: CareerDNA } | { error: string }> {
  const had = readings.get(fileId);
  if (had) return had;
  const p = fetch(`/api/resume-files/${encodeURIComponent(fileId)}/read`, { method: "POST" })
    .then(async (r) => {
      const body = (await r.json().catch(() => null)) as (FileReading & { error?: string }) | null;
      if (!r.ok || !body?.draft || !body.history) return { error: body?.error ?? "That file couldn't be read just now." };
      return { dna: dnaFromReading(body, new Date().toISOString()) };
    })
    .catch(() => ({ error: "That file couldn't be read just now." }));
  readings.set(fileId, p);
  // A failed read is tried again next time; the oldest reading goes once there are too many.
  void p.then((x) => "error" in x && readings.delete(fileId));
  while (readings.size > MAX_READINGS) readings.delete(readings.keys().next().value!);
  return p;
}

/** The role's file, read (outside React too: a run's preparation). */
export async function loadRoleFile(role: Pick<CareerRole, "baseResume"> | undefined): Promise<RoleFile> {
  const ref = role?.baseResume;
  if (!ref) return { state: "none" };
  if (ref.kind === "saved") {
    const saved = useCareerStore.getState().savedResumes.find((r) => r.id === ref.id);
    const file = saved ? (saved.name ?? `${saved.document.header.name} — ${getTemplate(saved.templateId)?.name ?? "résumé"}`) : "the chosen résumé";
    return saved ? { state: "ready", file, dna: dnaFromDocument(saved.document) } : { state: "failed", file, error: "That résumé was deleted. Choose another one for this role in Career Profile." };
  }
  const file = useResumeFilesStore.getState().files.find((f) => f.id === ref.id)?.filename ?? "your file";
  const got = await readStored(ref.id);
  return "dna" in got ? { state: "ready", file, dna: got.dna } : { state: "failed", file, error: got.error };
}

export function useRoleFile(role: Pick<CareerRole, "id" | "baseResume"> | undefined): RoleFile {
  const ref = role?.baseResume;
  const key = ref ? `${ref.kind}:${ref.id}` : "";
  const files = useResumeFilesStore((s) => s.files);
  const load = useResumeFilesStore((s) => s.load);
  const [got, setGot] = useState<{ key: string; file: RoleFile } | null>(null);
  useEffect(() => {
    if (ref?.kind === "upload") void load();
  }, [ref?.kind, load]);
  useEffect(() => {
    if (!key) return;
    let live = true;
    void loadRoleFile(role).then((f) => live && setGot({ key, file: f }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per file (its name arrives with the file list)
  }, [key, files.length]);
  if (!key) return { state: "none" };
  if (got?.key === key) return got.file;
  return { state: "reading", file: (ref?.kind === "upload" ? files.find((f) => f.id === ref.id)?.filename : undefined) ?? "your file" };
}

/**
 * The profile something for a job is built from: the role's own file's person with the role's fields over it, the
 * Career Profile with them when the role has no file, or null while its file is unread or couldn't be read (then
 * nothing is built — the caller says why).
 */
export function jobProfile(dna: CareerDNA, role: CareerRole | undefined, file: RoleFile): CareerDNA | null {
  if (file.state === "none") return draftingProfile(dna, role);
  // The file's skills, plus any added to the role by hand (never ones copied in from My profile).
  return file.state === "ready" ? draftingProfile(file.dna, role && { ...role, skills: fileRoleSkills(file.dna.skills, role.skills, dna.skills) }) : null;
}

/** What to say about the file a role's things are built from, one short line. */
export function roleFileLine(file: RoleFile): string | null {
  if (file.state === "none") return null;
  if (file.state === "ready") return `From ${file.file}`;
  return file.state === "reading" ? `Reading ${file.file}…` : `Couldn't read ${file.file}: ${file.error}`;
}
