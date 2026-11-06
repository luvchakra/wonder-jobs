"use client";
import { createContext, useContext, type ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { ModuleTint } from "@/wonderworks/manifest";
import type { NavItem } from "./nav";

/** One module (or Jobs' Full Time / Part Time) in the desktop sidebar's Modules list. */
export interface SidebarModule {
  id: string;
  label: string;
  icon: LucideIcon;
  tint: ModuleTint;
  /** The one in use. */
  on: boolean;
  select: () => void;
}

/**
 * What the app chrome shows from the modules, without importing any (docs/WONDERWORKS_PLATFORM.md §6): the
 * composition root (`modules/chrome.tsx`) provides it. Each slot falls back to an empty, honest default.
 */
export interface ChromeSlots {
  /** A module's four places (WonderWorks' Find, Saved and You, and its own Pipeline tab). */
  tabsFor: (module: string) => NavItem[];
  /** The module a page belongs to, or null for pages every module shares. */
  moduleFromPath: (pathname: string) => string | null;
  /** Each place's own pages, as tabs at its top. */
  sections: { title: string; items: NavItem[] }[];
  /** The menu in the middle of the top bar. */
  FindMenu?: ComponentType;
  /** The same choices as the desktop sidebar's Modules list (from 1024px), and how many modules are still to come. */
  useSidebarModules?: () => { items: SidebarModule[]; soon: number };
  /** How many things need the person in the module selected (Needs attention, the bell's badge), and their status line in the account menu. */
  useStatus: (hydrated: boolean, module: string) => { tasks: number; careerStatus: string };
  /** Where a module's new entry is posted (the page its You tab links to: Hiring, Post internships, Host an event …), for the + button. */
  postFor?: (module: string) => { href: string; label: string } | null;
}

const NONE: ChromeSlots = { tabsFor: () => [], moduleFromPath: () => null, sections: [], useStatus: () => ({ tasks: 0, careerStatus: "Career Explorer" }) };
const Slots = createContext<ChromeSlots>(NONE);

export const ChromeSlotsProvider = Slots.Provider;
export const useChromeSlots = () => useContext(Slots);
