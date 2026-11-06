"use client";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChromeSlotsProvider, type ChromeSlots } from "@/wonderworks/chrome/slots";
import { ModuleMenu } from "@/wonderworks/chrome/ModuleMenu";
import { ICONS } from "@/wonderworks/brand/tiles";
import { arrangeMenu } from "@/domain/navigation/menus";
import { useMenu } from "@/lib/menus";
import { useUIStore } from "@/store/ui";
import { UPCOMING_KINDS } from "@/domain/jobs/upcomingKinds";
import { JOBS_MENU_CHOICES, pickJobsFindMode, useJobsFindMode, useJobsStatus } from "./jobs/chrome";
import { SECTION_TABS } from "./jobs/nav";
import { moduleFromPath, moduleNav } from "./nav";
import { MODULES, type ModuleId, type UpcomingKindId } from "./registry";
import { withNew } from "@/wonderworks/owner/useOpenNew";

// Each other module's icon and tint in the menu are its manifest's; a live one (WJ-418: Internships) is picked like
// Full Time and Part Time — the four tabs become its own (docs/WONDERWORKS_PLATFORM.md §4.1). The rest are "Coming soon".
const LOOK = Object.fromEntries(MODULES.flatMap((m) => (m.menuId ? [[m.menuId, { icon: ICONS[m.icon], tint: m.accent }]] : []))) as Record<UpcomingKindId, { icon: (typeof ICONS)[keyof typeof ICONS]; tint: (typeof MODULES)[number]["accent"] }>;
const LIVE = Object.fromEntries(MODULES.flatMap((m) => (m.menuId && m.status === "live" ? [[m.menuId, { id: m.id, href: m.routes.find }]] : []))) as Partial<Record<UpcomingKindId, { id: ModuleId; href: string }>>;

/**
 * The menu in the middle of the top bar: WonderJobs' Full Time Jobs and Part Time Jobs, then the other modules in the
 * order a platform admin set (Admin → Settings → App menus → Modules). Its value is the module whose pages are open, else
 * Jobs' current kind. A kind of jobs switches Find — in place on Find, or opening Find from anywhere else.
 */
function useFindMenu() {
  const current = useJobsFindMode();
  const router = useRouter();
  const pathname = usePathname();
  // The module whose pages are open, else the one picked last (as the tab bar shows it, useSelectedModule), so a shared
  // page (Automation, Analytics, Notifications) names the same module as its tabs (2026-11-02: "Part Time Jobs" over
  // Talent & Services' tabs).
  const stored = useUIStore((s) => s.activeModule);
  const onModule = moduleFromPath(pathname) ?? stored ?? null;
  const setActiveModule = useUIStore((s) => s.setActiveModule);
  const kinds = arrangeMenu([...UPCOMING_KINDS], useMenu("find_kinds"));
  const liveKinds = kinds.filter((k) => LIVE[k.id]);
  const liveNow = onModule && onModule !== "jobs" ? liveKinds.find((k) => LIVE[k.id]!.id === onModule) : undefined;
  return {
    now: liveNow ? { label: liveNow.label, ...LOOK[liveNow.id] } : JOBS_MENU_CHOICES.find((c) => c.id === current)!,
    choices: JOBS_MENU_CHOICES.map((c) => ({ ...c, on: !liveNow && c.id === current })),
    live: liveKinds.map((k) => ({ ...k, ...LOOK[k.id], on: liveNow?.id === k.id })),
    upcoming: kinds.filter((k) => !LIVE[k.id]).map((k) => ({ ...k, ...LOOK[k.id] })),
    onChoice: (id: string, on: boolean) => {
      if (liveNow) {
        // Back to Jobs, in the kind picked.
        setActiveModule("jobs");
        if (id !== current) pickJobsFindMode(id);
        router.push("/app/jobs");
      } else {
        if (!on) pickJobsFindMode(id);
        if (pathname !== "/app/jobs") router.push("/app/jobs");
      }
    },
    onModule: (id: string, on: boolean) => {
      const target = LIVE[id as UpcomingKindId]!;
      setActiveModule(target.id);
      if (!on) router.push(target.href);
    },
  };
}

function FindMenu() {
  const m = useFindMenu();
  return <ModuleMenu label="Module" now={m.now} choices={m.choices} live={m.live} upcoming={m.upcoming} onChoice={m.onChoice} onModule={m.onModule} />;
}

/** The desktop sidebar's Modules list: the same choices as the top bar's menu (which the sidebar replaces from 1024px). */
function useSidebarModules() {
  const m = useFindMenu();
  return {
    items: [...m.choices.map((c) => ({ id: c.id, label: c.label, icon: c.icon, tint: c.tint, on: c.on, select: () => m.onChoice(c.id, c.on) })), ...m.live.map((k) => ({ id: k.id, label: k.label, icon: k.icon, tint: k.tint, on: k.on, select: () => m.onModule(k.id, k.on) }))],
    soon: m.upcoming.length,
  };
}

/** Jobs' Needs attention (its applications) counts only while Jobs is the module selected; the status line is the account's. */
function useStatus(hydrated: boolean, module: string) {
  const status = useJobsStatus(hydrated);
  return module === "jobs" ? status : { ...status, tasks: 0 };
}

// The + opens the post page with its new-entry form already open (useOpenNew reads ?new=1).
const postFor = (m: string) => {
  const p = MODULES.find((x) => x.id === m)?.post;
  return p ? { ...p, href: withNew(p.href) } : null;
};
const SLOTS: ChromeSlots = { tabsFor: (m) => moduleNav(m as ModuleId), moduleFromPath, sections: SECTION_TABS, FindMenu, useSidebarModules, useStatus, postFor };

/** The composition root for the app chrome: WonderWorks' top bar, tabs and section tabs, filled from the modules. */
export function AppChrome({ children }: { children: ReactNode }) {
  return <ChromeSlotsProvider value={SLOTS}>{children}</ChromeSlotsProvider>;
}
