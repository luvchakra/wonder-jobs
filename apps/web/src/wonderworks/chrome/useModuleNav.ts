"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useUIStore } from "@/store/ui";
import type { ModuleId } from "@/wonderworks/manifest";
import type { NavItem } from "./nav";
import { useChromeSlots } from "./slots";

/**
 * The four places for the module in use (docs/WONDERWORKS_PLATFORM.md §4.1): the page's own module, or else the one
 * picked last in Find's menu (kept per account). Opening a module's page makes it the active one.
 */
export function useModuleNav(): NavItem[] {
  const { tabsFor } = useChromeSlots();
  return tabsFor(useSelectedModule());
}

/**
 * The module selected: the page's own, else the one picked last in Find's menu, else Jobs. Opening a module's page makes
 * it the active one. What the bell and Notifications show follows it.
 */
export function useSelectedModule(): ModuleId {
  const pathname = usePathname();
  const { moduleFromPath } = useChromeSlots();
  const fromPath = moduleFromPath(pathname) as ModuleId | null;
  const stored = useUIStore((s) => s.activeModule);
  const setActive = useUIStore((s) => s.setActiveModule);
  useEffect(() => {
    if (fromPath && fromPath !== (stored ?? "jobs")) setActive(fromPath);
  }, [fromPath, stored, setActive]);
  return fromPath ?? stored ?? "jobs";
}
