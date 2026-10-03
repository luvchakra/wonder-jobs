import { BarChart3, BookOpen, Bookmark, Bot, CalendarDays, Database, Dna, FileText, History, LayoutList, LifeBuoy, MessagesSquare, Search, Sparkles, UserRound, UserRoundCog, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Whether this item is the current page — defaults to the href and anything under it. */
  match?: (pathname: string) => boolean;
}

const under = (...paths: string[]) => (p: string) => paths.some((x) => p === x || p.startsWith(`${x}/`));

/**
 * Four places, one each for the stages of a search: Find (jobs), Saved (the shortlist), Applied
 * (applications and follow-ups), You (profile, résumés and settings). The same array drives the
 * desktop sidebar, the mobile bottom bar and the drawer, so they can't drift apart. Each place's
 * own pages are tabs at the top of it (SECTION_TABS). Ask Wonder lives in the top bar.
 */
export const PRIMARY_NAV: NavItem[] = [
  // A search's own page ("Details") belongs to Find; the list of past searches is under You.
  { href: "/app/jobs", label: "Find", icon: Search, match: (p) => p === "/app" || under("/app/jobs")(p) || (p.startsWith("/app/runs/") && p !== "/app/runs/new") },
  { href: "/app/saved", label: "Saved", icon: Bookmark },
  { href: "/app/applications", label: "Applied", icon: LayoutList, match: under("/app/applications", "/app/calendar", "/app/insights", "/app/interview-prep", "/app/learning") },
  { href: "/app/you", label: "You", icon: UserRound, match: (p) => p === "/app/runs" || under("/app/you", "/app/career-dna", "/app/resume-studio", "/app/settings", "/app/automation", "/app/profile")(p) },
];

/** Each place's pages, shown as tabs at the top of it and as a group in the mobile menu. */
export const SECTION_TABS: { title: string; items: NavItem[] }[] = [
  {
    title: "Applied",
    items: [
      { href: "/app/applications", label: "Applications", icon: LayoutList },
      { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/app/insights", label: "Insights", icon: BarChart3 },
      { href: "/app/interview-prep", label: "Interview Prep", icon: MessagesSquare },
      { href: "/app/learning", label: "Learning", icon: BookOpen },
    ],
  },
  {
    title: "You",
    items: [
      { href: "/app/career-dna", label: "Career Profile", icon: Dna },
      { href: "/app/resume-studio", label: "Résumés", icon: FileText },
      { href: "/app/settings", label: "Job sources", icon: Database, match: (p) => p === "/app/settings" },
      { href: "/app/automation/settings", label: "Automation", icon: Bot, match: (p) => p.startsWith("/app/automation") },
      { href: "/app/runs", label: "Search history", icon: History, match: (p) => p === "/app/runs" },
      { href: "/app/settings/ai", label: "AI provider", icon: Sparkles },
      { href: "/app/profile", label: "Account", icon: UserRoundCog },
    ],
  },
];

/** The section (and its tabs) a page belongs to, when it belongs to one. */
export function sectionFor(pathname: string) {
  return SECTION_TABS.find((s) => s.items.some((i) => isActivePath(pathname, i)));
}

export const RESOURCES_NAV: NavItem[] = [
  // Public page: reachable signed out too, which is the point — people need it most when they can't get in.
  { href: "/help", label: "Help & Guide", icon: LifeBuoy },
];

// The mobile bottom bar shows the same four places, full stop — no "More" catch-all. Every page of each
// place is a tab at its top and a group in the drawer the top-left menu opens.
export const MOBILE_NAV: NavItem[] = PRIMARY_NAV;

export function isActivePath(pathname: string, item: NavItem) {
  return item.match ? item.match(pathname) : pathname === item.href || pathname.startsWith(item.href + "/");
}
