"use client";
import { moduleStore } from "@/wonderworks/store";
import type { MarketListing, Persona } from "./domain";

/** Buy, Sell & Rent's own saves, searches and details (wj.m.marketplace), separate from every other module's stores. */
export const useMarketplaceStore = moduleStore("marketplace");

/** The person's area, or null until they save it. */
export const selectPersona = (s: { persona: Record<string, unknown> | null }) => s.persona as Persona | null;

/** A saved listing as its card showed it. */
export const savedItems = (s: { saved: Record<string, string>; items: Record<string, unknown> }) =>
  Object.entries(s.saved)
    .sort(([, a], [, b]) => b.localeCompare(a))
    .flatMap(([id]) => (s.items[id] ? [s.items[id] as MarketListing] : []));
