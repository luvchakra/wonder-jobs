"use client";
import { moduleStore } from "@/wonderworks/store";
import type { EventListing, Persona } from "./domain";

/** Events' own saves, RSVPs, searches and details (wj.m.events), separate from every other module's stores. */
export const useEventsStore = moduleStore("events");

/** The person's interests and city, or null until they save some. */
export const selectPersona = (s: { persona: Record<string, unknown> | null }) => s.persona as Persona | null;

/** A saved event as its card showed it. */
export const savedItems = (s: { saved: Record<string, string>; items: Record<string, unknown> }) =>
  Object.entries(s.saved)
    .sort(([, a], [, b]) => b.localeCompare(a))
    .flatMap(([id]) => (s.items[id] ? [s.items[id] as EventListing] : []));
