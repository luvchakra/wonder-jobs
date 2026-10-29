"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useUIStore } from "@/store/ui";
import type { ModuleId } from "@/wonderstar/manifest";
import type { NavItem } from "./nav";
import { useChromeSlots } from "./slots";

/**
 * The four places for the module in use (docs/WONDERSTAR_PLATFORM.md §4.1): the page's own module, or else the one
 * picked last in Find's menu (kept per account). Opening a module's page makes it the active one.
 */
export function useModuleNav(): NavItem[] {
  const pathname = usePathname();
  const { moduleFromPath, tabsFor } = useChromeSlots();
  const fromPath = moduleFromPath(pathname) as ModuleId | null;
  const stored = useUIStore((s) => s.activeModule);
  const setActive = useUIStore((s) => s.setActiveModule);
  useEffect(() => {
    if (fromPath && fromPath !== (stored ?? "jobs")) setActive(fromPath);
  }, [fromPath, stored, setActive]);
  return tabsFor(fromPath ?? stored ?? "jobs");
}
