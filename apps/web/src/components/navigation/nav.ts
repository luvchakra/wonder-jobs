import { BarChart3, BookOpen, Bot, CalendarDays, Database, Dna, FileText, History, House, LayoutList, LifeBuoy, MessagesSquare, Search, Settings2, Sparkles, Timer, UserRound, UserRoundCog, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Whether this item is the current page — defaults to the href and anything under it. */
  match?: (pathname: string) => boolean;
}

const under = (...paths: string[]) => (p: string) => paths.some((x) => p === x || p.startsWith(`${x}/`));

/**
 * Five places, one question each: Home (what needs me today), Find (jobs), Wonder (ask it; what it
 * does on its own), Applied (applications and follow-ups), Career (profile, résumés, preferences).
 * The same array drives the desktop sidebar, the mobile bottom bar and the drawer, so they can't
 * drift apart. Each place's own pages are tabs at the top of it (SECTION_TABS).
 */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/app", label: "Home", icon: House, match: (p) => p === "/app" },
  // A search's own page ("Details") belongs to Find; the list of past searches is under Wonder.
  { href: "/app/jobs", label: "Find", icon: Search, match: (p) => under("/app/jobs")(p) || (p.startsWith("/app/runs/") && p !== "/app/runs/new") },
  { href: "/app/wonder", label: "Wonder", icon: Sparkles, match: (p) => p === "/app/runs" || under("/app/wonder", "/app/automation", "/app/settings/ai")(p) },
  { href: "/app/applications", label: "Applied", icon: LayoutList, match: under("/app/applications", "/app/calendar", "/app/insights", "/app/interview-prep", "/app/learning") },
  { href: "/app/career-dna", label: "Career", icon: UserRound, match: (p) => under("/app/career-dna", "/app/resume-studio", "/app/profile")(p) || p === "/app/settings" },
];

/** Each place's pages, shown as tabs at the top of it and as a group in the mobile menu. */
export const SECTION_TABS: { title: string; items: NavItem[] }[] = [
  {
    title: "Wonder",
    items: [
      { href: "/app/automation/settings", label: "What Wonder can do", icon: Bot },
      { href: "/app/automation/scheduled", label: "Scheduled searches", icon: Timer },
      { href: "/app/runs", label: "Search history", icon: History, match: (p) => p === "/app/runs" },
      { href: "/app/settings/ai", label: "AI provider", icon: Settings2 },
    ],
  },
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
    title: "Career",
    items: [
      { href: "/app/career-dna", label: "Career Profile", icon: Dna },
      { href: "/app/resume-studio", label: "Résumés", icon: FileText },
      { href: "/app/settings", label: "Job sources", icon: Database, match: (p) => p === "/app/settings" },
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

// The mobile bottom bar shows the same five places, full stop — no "More" catch-all. Every page of each
// place is a tab at its top and a group in the drawer the top-left menu opens.
export const MOBILE_NAV: NavItem[] = PRIMARY_NAV;

export function isActivePath(pathname: string, item: NavItem) {
  return item.match ? item.match(pathname) : pathname === item.href || pathname.startsWith(item.href + "/");
}
