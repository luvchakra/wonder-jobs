import { BarChart3, ChartNoAxesColumn, Bookmark, Bot, Building2, CalendarDays, Database, Dna, FileText, GraduationCap, History, LayoutDashboard, LayoutList, LifeBuoy, MessagesSquare, Search, UserRound, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Whether this item is the current page — defaults to the href and anything under it. */
  match?: (pathname: string) => boolean;
}

const under = (...paths: string[]) => (p: string) => paths.some((x) => p === x || p.startsWith(`${x}/`));

/**
 * Four places, one each for the stages of a search: Find (jobs), Saved (the shortlist), Pipeline
 * (applications and follow-ups), You (what Wonder works from, and Skill Up). Account, plan and data live in the avatar menu. The same array drives the
 * desktop sidebar, the mobile bottom bar and the drawer, so they can't drift apart. Each place's
 * own pages are tabs at the top of it (SECTION_TABS). Ask Wonder lives in the top bar.
 */
export const PRIMARY_NAV: NavItem[] = [
  // A search's own page ("Details") belongs to Find; the list of past searches is under You.
  { href: "/app/jobs", label: "Find", icon: Search, match: (p) => p === "/app" || under("/app/jobs")(p) || (p.startsWith("/app/runs/") && p !== "/app/runs/new") },
  { href: "/app/saved", label: "Saved", icon: Bookmark },
  { href: "/app/applications", label: "Pipeline", icon: LayoutList, match: under("/app/applications", "/app/dashboard", "/app/calendar", "/app/insights", "/app/interview-prep") },
  { href: "/app/you", label: "You", icon: UserRound, match: (p) => p === "/app/runs" || under("/app/you", "/app/ask", "/app/career-dna", "/app/skill-up", "/app/recruiters", "/app/resume-studio", "/app/settings", "/app/automation", "/app/hiring", "/app/profile", "/app/notifications")(p) },
];

/** Each place's pages, shown as tabs at the top of it and as a group in the mobile menu. */
export const SECTION_TABS: { title: string; items: NavItem[] }[] = [
  {
    title: "Pipeline",
    items: [
      { href: "/app/applications", label: "Applications", icon: LayoutList },
      { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/app/dashboard", label: "This week", icon: LayoutDashboard },
      { href: "/app/insights", label: "Insights", icon: BarChart3 },
    ],
  },
  {
    title: "You",
    items: [
      // Not shown as tabs (SectionTabs): the You page's rows are the way in. Kept for the place's grouping and Ask Wonder's "Go to".
      { href: "/app/career-dna", label: "Career Profile", icon: Dna },
      { href: "/app/ask", label: "Ask Wonder", icon: Search },
      // Getting better at what the jobs ask for: skill gaps from the candidate's own matches, and where to learn them.
      { href: "/app/skill-up", label: "Skill Up", icon: GraduationCap },
      // Whether companies can find and message them, and those conversations.
      { href: "/app/recruiters", label: "Recruiters", icon: MessagesSquare },
      { href: "/app/resume-studio", label: "My Resume", icon: FileText },
      { href: "/app/settings", label: "Job sources", icon: Database, match: (p) => p === "/app/settings" },
      { href: "/app/automation/settings", label: "Automation", icon: Bot, match: (p) => p.startsWith("/app/automation") },
      { href: "/app/hiring", label: "Hiring", icon: Building2 },
      { href: "/app/runs", label: "Search history", icon: History, match: (p) => p === "/app/runs" },
    ],
  },
];

/** The section (and its tabs) a page belongs to, when it belongs to one. */
export function sectionFor(pathname: string) {
  return SECTION_TABS.find((s) => s.items.some((i) => isActivePath(pathname, i)));
}

/** Below the four places in the desktop sidebar (and in the account menu on phones): the candidate's own numbers. */
export const REPORT_NAV: NavItem[] = [{ href: "/app/analytics", label: "Analytics", icon: ChartNoAxesColumn }];

export const RESOURCES_NAV: NavItem[] = [
  // Signed-in accounts only (WJ-309). Signed-out visitors get sign-in, password reset and Contact us instead.
  { href: "/help", label: "Help & Guide", icon: LifeBuoy },
];

// The mobile bottom bar shows the same four places, full stop — no "More" catch-all. Every page of each
// place is a tab at its top and a group in the drawer the top-left menu opens.
export const MOBILE_NAV: NavItem[] = PRIMARY_NAV;

export function isActivePath(pathname: string, item: NavItem) {
  return item.match ? item.match(pathname) : pathname === item.href || pathname.startsWith(item.href + "/");
}
