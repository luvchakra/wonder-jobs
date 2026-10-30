"use client";
import { moduleStore } from "@/wonderworks/store";
import type { ClientProfile, ServiceListing } from "./domain";

/** Talent & Services' own saves, requests, searches and details (wj.m.services), separate from every other module's stores. */
export const useServicesStore = moduleStore("services");

/** The client's confirmed area, or null until they save one. */
export const selectProfile = (s: { persona: Record<string, unknown> | null }) => s.persona as ClientProfile | null;

/** A saved listing as its card showed it. */
export const savedItems = (s: { saved: Record<string, string>; items: Record<string, unknown> }) =>
  Object.entries(s.saved)
    .sort(([, a], [, b]) => b.localeCompare(a))
    .flatMap(([id]) => (s.items[id] ? [s.items[id] as ServiceListing] : []));
