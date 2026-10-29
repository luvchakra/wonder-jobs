"use client";
import { createContext, useContext, type ComponentType } from "react";
import type { NavItem } from "./nav";

/**
 * What the app chrome shows from the modules, without importing any (docs/WONDERSTAR_PLATFORM.md §6): the
 * composition root (`modules/chrome.tsx`) provides it. Each slot falls back to an empty, honest default.
 */
export interface ChromeSlots {
  /** A module's four places (WonderStar's Find, Saved and You, and its own Pipeline tab). */
  tabsFor: (module: string) => NavItem[];
  /** The module a page belongs to, or null for pages every module shares. */
  moduleFromPath: (pathname: string) => string | null;
  /** Each place's own pages, as tabs at its top. */
  sections: { title: string; items: NavItem[] }[];
  /** The menu in the middle of the top bar. */
  FindMenu?: ComponentType;
  /** How many things need the person (Tasks' badge), and their status line in the account menu. */
  useStatus: (hydrated: boolean) => { tasks: number; careerStatus: string };
}

const NONE: ChromeSlots = { tabsFor: () => [], moduleFromPath: () => null, sections: [], useStatus: () => ({ tasks: 0, careerStatus: "Career Explorer" }) };
const Slots = createContext<ChromeSlots>(NONE);

export const ChromeSlotsProvider = Slots.Provider;
export const useChromeSlots = () => useContext(Slots);
