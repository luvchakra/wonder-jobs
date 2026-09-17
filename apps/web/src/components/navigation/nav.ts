import { BarChart3, BookOpen, Briefcase, Calendar, Dna, FileText, Home, LayoutList, MessagesSquare, Search, Settings2, Timer, User, Zap, type LucideIcon } from "lucide-react";

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
];

export const MOBILE_NAV: NavItem[] = [
  { href: "/app", label: "Home", icon: Home, exact: true },
  { href: "/app/jobs", label: "Jobs", icon: Briefcase },
  { href: "/app/runs", label: "Runs", icon: Zap },
  { href: "/app/applications", label: "Applications", icon: LayoutList },
  { href: "/app/profile", label: "Profile", icon: User },
];

export function isActivePath(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}
