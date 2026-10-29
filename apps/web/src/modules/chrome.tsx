"use client";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChromeSlotsProvider, type ChromeSlots } from "@/wonderstar/chrome/slots";
import { ModuleMenu } from "@/wonderstar/chrome/ModuleMenu";
import { ICONS } from "@/wonderstar/brand/tiles";
import { arrangeMenu } from "@/domain/navigation/menus";
import { useMenu } from "@/lib/menus";
import { useUIStore } from "@/store/ui";
import { UPCOMING_KINDS } from "@/domain/jobs/upcomingKinds";
import { JOBS_MENU_CHOICES, pickJobsFindMode, useJobsFindMode, useJobsStatus } from "./jobs/chrome";
import { SECTION_TABS } from "./jobs/nav";
import { moduleFromPath, moduleNav } from "./nav";
import { MODULES, type ModuleId, type UpcomingKindId } from "./registry";

// Each other module's icon and tint in the menu are its manifest's; a live one (WJ-418: Internships) is picked like
// Full Time and Part Time — the four tabs become its own (docs/WONDERWORKS_PLATFORM.md §4.1). The rest are "Coming soon".
const LOOK = Object.fromEntries(MODULES.flatMap((m) => (m.menuId ? [[m.menuId, { icon: ICONS[m.icon], tint: m.accent }]] : []))) as Record<UpcomingKindId, { icon: (typeof ICONS)[keyof typeof ICONS]; tint: (typeof MODULES)[number]["accent"] }>;
const LIVE = Object.fromEntries(MODULES.flatMap((m) => (m.menuId && m.status === "live" ? [[m.menuId, { id: m.id, href: m.routes.find }]] : []))) as Partial<Record<UpcomingKindId, { id: ModuleId; href: string }>>;

/**
 * The menu in the middle of the top bar: WonderJobs' Full Time Jobs and Part Time Jobs, then the other modules in the
 * order a platform admin set (Admin → Settings → Menus → Find menu). Its value is the module whose pages are open, else
 * Jobs' current kind. A kind of jobs switches Find — in place on Find, or opening Find from anywhere else.
 */
function FindMenu() {
  const current = useJobsFindMode();
  const router = useRouter();
  const pathname = usePathname();
  const onModule = moduleFromPath(pathname);
  const setActiveModule = useUIStore((s) => s.setActiveModule);
  const kinds = arrangeMenu([...UPCOMING_KINDS], useMenu("find_kinds"));
  const liveKinds = kinds.filter((k) => LIVE[k.id]);
  const liveNow = onModule && onModule !== "jobs" ? liveKinds.find((k) => LIVE[k.id]!.id === onModule) : undefined;
  return (
    <ModuleMenu
      label="Kind of jobs"
      now={liveNow ? { label: liveNow.label, ...LOOK[liveNow.id] } : JOBS_MENU_CHOICES.find((c) => c.id === current)!}
      choices={JOBS_MENU_CHOICES.map((c) => ({ ...c, on: !liveNow && c.id === current }))}
      live={liveKinds.map((k) => ({ ...k, ...LOOK[k.id], on: liveNow?.id === k.id }))}
      upcoming={kinds.filter((k) => !LIVE[k.id]).map((k) => ({ ...k, ...LOOK[k.id] }))}
      onChoice={(id, on) => {
        if (liveNow) {
          // Back to Jobs, in the kind picked.
          setActiveModule("jobs");
          if (id !== current) pickJobsFindMode(id);
          router.push("/app/jobs");
        } else {
          if (!on) pickJobsFindMode(id);
          if (pathname !== "/app/jobs") router.push("/app/jobs");
        }
      }}
      onModule={(id, on) => {
        const target = LIVE[id as UpcomingKindId]!;
        setActiveModule(target.id);
        if (!on) router.push(target.href);
      }}
    />
  );
}

const SLOTS: ChromeSlots = { tabsFor: (m) => moduleNav(m as ModuleId), moduleFromPath, sections: SECTION_TABS, FindMenu, useStatus: useJobsStatus };

/** The composition root for the app chrome: WonderWorks' top bar, tabs and section tabs, filled from the modules. */
export function AppChrome({ children }: { children: ReactNode }) {
  return <ChromeSlotsProvider value={SLOTS}>{children}</ChromeSlotsProvider>;
}
