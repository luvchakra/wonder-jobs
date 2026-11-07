/**
 * The admin's own tags, note and reminder on each key (owner, 2026-11-07: "allow to add some tags and notes to this for
 * further filtering and reminders"). Plain text about a key, never its value: "waiting approval", "asked on 7 Nov",
 * a date to follow up. Platform tenant only, written only by admins.
 */
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { PLATFORM_KEYS } from "./platformKeys";

const KEY = "wj.keynotes" as const;
export const MAX_TAGS = 6;
export const MAX_TAG = 24;
export const MAX_NOTE = 500;

export interface KeyNote {
  tags: string[];
  note: string;
  /** A day to follow up (YYYY-MM-DD); the page shows the key as due from that day. */
  remindOn?: string;
  by: string;
  at: string;
}

const NAMES = new Set(PLATFORM_KEYS.map((k) => k.name));

/** Pure: a note as the admin sent it, cleaned; null when it holds nothing (the note is then removed). */
export function cleanKeyNote(input: { tags?: unknown; note?: unknown; remindOn?: unknown }): Omit<KeyNote, "by" | "at"> | null {
  const tags = [
    ...new Set(
      (Array.isArray(input.tags) ? input.tags : [])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.replace(/\s+/g, " ").trim().toLowerCase().slice(0, MAX_TAG))
        .filter(Boolean),
    ),
  ].slice(0, MAX_TAGS);
  const note = typeof input.note === "string" ? input.note.trim().slice(0, MAX_NOTE) : "";
  const remindOn = typeof input.remindOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.remindOn) && !Number.isNaN(Date.parse(input.remindOn)) ? input.remindOn : undefined;
  if (!tags.length && !note && !remindOn) return null;
  return { tags, note, ...(remindOn ? { remindOn } : {}) };
}

export async function readKeyNotes(): Promise<Record<string, KeyNote>> {
  try {
    const d = (await stateStore.get(PLATFORM_TENANT, KEY))?.state as { notes?: Record<string, KeyNote> } | undefined;
    return d?.notes && typeof d.notes === "object" ? d.notes : {};
  } catch {
    return {};
  }
}

/** Saves (or, when empty, removes) one key's note. Only keys the platform knows. */
export async function setKeyNote(name: string, input: { tags?: unknown; note?: unknown; remindOn?: unknown }, by: string, now = new Date()): Promise<{ ok: true; note: KeyNote | null } | { ok: false; message: string }> {
  if (!NAMES.has(name)) return { ok: false, message: "No such key." };
  const clean = cleanKeyNote(input);
  const notes = { ...(await readKeyNotes()) };
  const note = clean ? { ...clean, by: by.slice(0, 120), at: now.toISOString() } : null;
  if (note) notes[name] = note;
  else delete notes[name];
  await stateStore.put(PLATFORM_TENANT, KEY, { notes });
  return { ok: true, note };
}
