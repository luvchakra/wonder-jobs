import { BarChart3, Bot, Building2, CalendarDays, Database, Dna, FileText, GraduationCap, History, LayoutDashboard, LayoutList, MessagesSquare, Search } from "lucide-react";
import { moduleTabs, under, type NavItem } from "@/wonderstar/chrome/nav";
import { jobsManifest } from "./manifest";

/**
 * WonderJobs' four places, one each for the stages of a search: Find (jobs), Saved (the shortlist), Pipeline
 * (applications and follow-ups), You (what Wonder works from, and Skill Up) — WonderStar's tabs, from Jobs' manifest.
 * Account, plan and data live in the avatar menu. The same array drives the desktop sidebar, the mobile bottom bar
 * and the drawer, so they can't drift apart. Each place's own pages are tabs at the top of it (SECTION_TABS). Ask
 * Wonder lives in the top bar.
 */
export const PRIMARY_NAV: NavItem[] = moduleTabs(jobsManifest, {
  // A search's own page ("Details") belongs to Find; the list of past searches is under You.
  find: (p) => p === "/app" || under("/app/jobs")(p) || (p.startsWith("/app/runs/") && p !== "/app/runs/new"),
  saved: undefined,
  pipeline: under("/app/applications", "/app/dashboard", "/app/calendar", "/app/insights", "/app/interview-prep"),
  you: (p) => p === "/app/runs" || under("/app/you", "/app/ask", "/app/career-dna", "/app/skill-up", "/app/recruiters", "/app/resume-studio", "/app/settings", "/app/automation", "/app/hiring", "/app/profile", "/app/notifications")(p),
});

/** Each place's pages, shown as tabs at the top of it and as a group in the mobile menu. Pipeline's are Jobs' views. */
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
