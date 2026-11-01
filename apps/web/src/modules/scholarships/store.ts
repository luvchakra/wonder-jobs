"use client";
import { moduleStore } from "@/wonderworks/store";
import type { ScholarshipListing, StudentProfile } from "./domain";

/** Scholarships & Projects' own saves, responses, searches and profile (wj.m.scholarships), separate from every other module's. */
export const useScholarshipsStore = moduleStore("scholarships");

/** The student's confirmed profile, or null until they save one. */
export const selectProfile = (s: { persona: Record<string, unknown> | null }) => s.persona as StudentProfile | null;

/** Saved listings as their cards showed them, newest save first. */
export const savedItems = (s: { saved: Record<string, string>; items: Record<string, unknown> }) =>
  Object.entries(s.saved)
    .sort(([, a], [, b]) => b.localeCompare(a))
    .flatMap(([id]) => (s.items[id] ? [s.items[id] as ScholarshipListing] : []));
