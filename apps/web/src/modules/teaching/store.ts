"use client";
import { moduleStore } from "@/wonderworks/store";
import type { TeacherProfile, TeachingListing } from "./domain";

/** Teaching's own saves, responses, searches and profile (wj.m.teaching), separate from every other module's stores. */
export const useTeachingStore = moduleStore("teaching");

/** The teacher's confirmed Teaching profile, or null until they save one. */
export const selectProfile = (s: { persona: Record<string, unknown> | null }) => s.persona as TeacherProfile | null;

/** A saved opening as its card showed it. */
export const savedItems = (s: { saved: Record<string, string>; items: Record<string, unknown> }) =>
  Object.entries(s.saved)
    .sort(([, a], [, b]) => b.localeCompare(a))
    .flatMap(([id]) => (s.items[id] ? [s.items[id] as TeachingListing] : []));
