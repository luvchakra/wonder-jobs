import { Bookmark, CalendarCheck, CalendarClock, CalendarHeart, ChartNoAxesColumn, Handshake, LayoutList, LifeBuoy, Search, UserRound, type LucideIcon } from "lucide-react";
import type { ModuleManifest } from "@/wonderworks/manifest";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Whether this item is the current page — defaults to the href and anything under it. */
  match?: (pathname: string) => boolean;
}

/** A match for a page and everything under it. */
export const under = (...paths: string[]) => (p: string) => paths.some((x) => p === x || p.startsWith(`${x}/`));

/** Below the four places in the desktop sidebar (and in the account menu on phones): the candidate's own numbers. */
export const REPORT_NAV: NavItem[] = [{ href: "/app/analytics", label: "Analytics", icon: ChartNoAxesColumn }];

export const RESOURCES_NAV: NavItem[] = [
  // Signed-in accounts only (WJ-309). Signed-out visitors get sign-in, password reset and Contact us instead.
  { href: "/help", label: "Help & Guide", icon: LifeBuoy },
];

export function isActivePath(pathname: string, item: NavItem) {
  return item.match ? item.match(pathname) : pathname === item.href || pathname.startsWith(item.href + "/");
}

/* ------------------------------------------------------------------ WonderWorks modules (docs/WONDERSTAR_PLATFORM.md §4.1) */

const PIPELINE_ICONS: Record<string, LucideIcon> = { LayoutList, Handshake, CalendarCheck, CalendarClock, CalendarHeart };
// The pages under You that belong to every module (account, settings, workspaces), so opening one keeps the module's tabs.
const SHARED_YOU = ["/app/ask", "/app/career-dna", "/app/skill-up", "/app/recruiters", "/app/resume-studio", "/app/settings", "/app/automation", "/app/hiring", "/app/profile", "/app/notifications"];

type Tab = keyof ModuleManifest["routes"];

/**
 * A module's four places: WonderWorks' Find, Saved and You, and the module's own Pipeline tab (its label and icon from
 * the manifest). By default each tab is its own page, and You also holds the module's company pages and the pages every
 * module shares (account, settings, workspaces). A module may set its own match for any tab (`undefined`: the tab's
 * route and anything under it).
 */
export function moduleTabs(m: Pick<ModuleManifest, "id" | "routes" | "pipeline">, match: Partial<Record<Tab, NavItem["match"]>> = {}): NavItem[] {
  const r = m.routes;
  const pick = (t: Tab, dflt: NavItem["match"]) => (t in match ? match[t] : dflt);
  const tabs: NavItem[] = [
    { href: r.find, label: "Find", icon: Search, match: pick("find", (p) => p === r.find) },
    { href: r.saved, label: "Saved", icon: Bookmark, match: pick("saved", (p) => p === r.saved) },
    { href: r.pipeline, label: m.pipeline.label, icon: PIPELINE_ICONS[m.pipeline.icon] ?? LayoutList, match: pick("pipeline", (p) => p === r.pipeline) },
    { href: r.you, label: "You", icon: UserRound, match: pick("you", (p) => p === r.you || p.startsWith(`${r.you}/`) || p.startsWith(`/app/m/${m.id}/company`) || p === "/app/runs" || under(...SHARED_YOU)(p)) },
  ];
  return tabs.map((t) => (t.match ? t : { href: t.href, label: t.label, icon: t.icon }));
}

/** The section (and its tabs) a page belongs to, when it belongs to one. */
export function sectionFor(pathname: string, sections: { title: string; items: NavItem[] }[]) {
  return sections.find((x) => x.items.some((i) => isActivePath(pathname, i)));
}
