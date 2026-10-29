"use client";
import { moduleStore } from "@/wonderworks/store";
import type { InternshipListing, StudentProfile } from "./domain";

/** Internships' own saves, responses, searches and profile (wj.m.internships), separate from Jobs' stores. */
export const useInternshipsStore = moduleStore("internships");

/** The student's confirmed Internships profile, or null until they save one. */
export const selectProfile = (s: { persona: Record<string, unknown> | null }) => s.persona as StudentProfile | null;

/** A saved internship as its card showed it. */
export const savedItems = (s: { saved: Record<string, string>; items: Record<string, unknown> }) =>
  Object.entries(s.saved)
    .sort(([, a], [, b]) => b.localeCompare(a))
    .flatMap(([id]) => (s.items[id] ? [s.items[id] as InternshipListing] : []));
