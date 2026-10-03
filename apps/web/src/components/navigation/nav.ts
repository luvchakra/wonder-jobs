import { BarChart3, BookOpen, Dna, FileText, LayoutList, LifeBuoy, MessagesSquare, Search, Settings2, Timer, Zap, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Other paths that belong to this item (a job's own page belongs to Jobs). */
  also?: string[];
}

// The real destinations of the product (spec: "Home / Jobs / Applications / Career / Wonder").
// Same array drives the desktop sidebar, the mobile bottom bar and the mobile drawer, so all three
// can never drift out of sync with each other.
export const PRIMARY_NAV: NavItem[] = [
  // Signed in = the job list: /app is Jobs (a job's page and comparison belong to it too).
  { href: "/app", label: "Jobs", icon: Search, exact: true, also: ["/app/jobs"] },
  { href: "/app/applications", label: "Applications", icon: LayoutList },
  { href: "/app/career-dna", label: "Career", icon: Dna },
  { href: "/app/runs", label: "Wonder", icon: Zap },
];

// Scheduling and automation policy are Wonder's own advanced controls — one tap from the "Wonder"
// primary item, not a separate top-level destination.
export const WONDER_NAV: NavItem[] = [
  { href: "/app/automation/scheduled", label: "Scheduled searches", icon: Timer },
  { href: "/app/automation/settings", label: "What Wonder can do", icon: Settings2 },
];

// Everything that helps a candidate improve their profile, grouped under "Career" rather than each
// getting its own primary nav slot.
export const CAREER_NAV: NavItem[] = [
  { href: "/app/insights", label: "Insights", icon: BarChart3 },
  { href: "/app/resume-studio", label: "Resume Studio", icon: FileText },
  { href: "/app/interview-prep", label: "Interview Prep", icon: MessagesSquare },
  { href: "/app/learning", label: "Learning", icon: BookOpen },
];

export const RESOURCES_NAV: NavItem[] = [
  // Public page: reachable signed out too, which is the point — people need it most when they can't get in.
  { href: "/help", label: "Help & Guide", icon: LifeBuoy },
];

// The mobile bottom bar shows the same 5 real destinations, full stop — no "More" catch-all. The
// Wonder/Career secondary groups above are still one tap away via the drawer TopBar's hamburger
// opens (MobileSidebarDrawer), so nothing here is actually harder to reach, just not duplicated.
export const MOBILE_NAV: NavItem[] = PRIMARY_NAV;

export function isActivePath(pathname: string, item: NavItem) {
  if (item.also?.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}
