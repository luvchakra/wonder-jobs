"use client";
import { moduleStore } from "@/wonderworks/store";
import type { CofounderListing, Persona } from "./domain";

/** Co-founders' own saves, connections, searches and details (wj.m.cofounders), separate from every other module's stores. */
export const useCofoundersStore = moduleStore("cofounders");

/** The person's role, skills and commitment (the manifest's persona), or null until they save a profile. */
export const selectPersona = (s: { persona: Record<string, unknown> | null }) => s.persona as Persona | null;

/** A saved person or team as their card showed them. */
export const savedItems = (s: { saved: Record<string, string>; items: Record<string, unknown> }) =>
  Object.entries(s.saved)
    .sort(([, a], [, b]) => b.localeCompare(a))
    .flatMap(([id]) => (s.items[id] ? [s.items[id] as CofounderListing] : []));
