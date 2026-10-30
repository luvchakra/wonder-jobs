"use client";
import { moduleStore } from "@/wonderworks/store";
import type { ClientProfile, TherapistListing } from "./domain";

/**
 * Therapists' own saves and details (wj.m.therapists), separate from every other module's stores. Its searches are
 * never stored (wonderworks/store.ts::PRIVATE_SEARCH_MODULES).
 */
export const useTherapistsStore = moduleStore("therapists");

/** The client's preferences, or null until they save some. */
export const selectProfile = (s: { persona: Record<string, unknown> | null }) => s.persona as ClientProfile | null;

/** A saved practitioner as their card showed them. */
export const savedItems = (s: { saved: Record<string, string>; items: Record<string, unknown> }) =>
  Object.entries(s.saved)
    .sort(([, a], [, b]) => b.localeCompare(a))
    .flatMap(([id]) => (s.items[id] ? [s.items[id] as TherapistListing] : []));
