import { BarChart3, BookOpen, Briefcase, Calendar, Dna, FileText, Home, LayoutList, LifeBuoy, MessagesSquare, Search, Settings2, Timer, Zap, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/app", label: "Home", icon: Home, exact: true },
  { href: "/app/jobs", label: "Jobs", icon: Search },
  { href: "/app/runs", label: "Runs", icon: Zap },
  { href: "/app/applications", label: "Applications", icon: LayoutList },
  { href: "/app/calendar", label: "Calendar", icon: Calendar },
  { href: "/app/career-dna", label: "Career DNA", icon: Dna },
  { href: "/app/insights", label: "Insights", icon: BarChart3 },
];

export const AUTOMATION_NAV: NavItem[] = [
  { href: "/app/automation/scheduled", label: "Scheduled Runs", icon: Timer },
  { href: "/app/automation/settings", label: "Automation Settings", icon: Settings2 },
];

export const RESOURCES_NAV: NavItem[] = [
  { href: "/app/resume-studio", label: "Resume Studio", icon: FileText },
  { href: "/app/interview-prep", label: "Interview Prep", icon: MessagesSquare },
  { href: "/app/learning", label: "Learning", icon: BookOpen },
  // Public page: reachable signed out too, which is the point — people need it most when they can't get in.
  { href: "/help", label: "Help & Guide", icon: LifeBuoy },
];

// The 4 highest-traffic destinations get their own tab; everything else (Calendar, Career DNA, Insights,
// Automation, Resources) lives one tap away behind "More" (MobileNav's 5th slot), which opens
// MobileSidebarDrawer — the same full nav the desktop Sidebar shows. Profile isn't repeated here: the
// TopBar's avatar menu is reachable at every width, mobile included.
export const MOBILE_NAV: NavItem[] = [
  { href: "/app", label: "Home", icon: Home, exact: true },
  { href: "/app/jobs", label: "Jobs", icon: Briefcase },
  { href: "/app/runs", label: "Runs", icon: Zap },
  { href: "/app/applications", label: "Applications", icon: LayoutList },
];

export function isActivePath(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}
