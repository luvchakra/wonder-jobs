"use client";
import { useEffect } from "react";
import { Building2, Database, FileText, GraduationCap, History, MessagesSquare, Search } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useWorkflowStore } from "@/store/workflow";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { arrangeMenu } from "@/domain/navigation/menus";
import { useMenu } from "@/lib/menus";
import { YouOverview } from "@/wonderstar/you/YouOverview";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** WonderJobs' You: WonderStar's You with Jobs' rows — what Wonder works with, in the order a search uses it. */
export function JobsYou() {
  const resumes = useCareerStore((s) => s.savedResumes.length);
  const files = useResumeFilesStore((s) => s.files.length);
  const loadFiles = useResumeFilesStore((s) => s.load);
  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);
  const sources = useJobsStore((s) => s.sources);
  const runCount = useWorkflowStore((s) => Object.keys(s.runs).length);
  const integrated = sources.filter((s) => s.integrated);
  const on = integrated.filter((s) => s.enabled && s.available !== false).length;
  // The order and rows a platform admin set for everyone (Admin → Settings → Menus).
  const menu = useMenu("you");

  const rows = arrangeMenu([
    { id: "ask_wonder", href: "/app/ask", label: "Ask Wonder", value: "Ask, search or jump anywhere", icon: Search },
    { id: "skill_up", href: "/app/skill-up", label: "Skill Up", value: "What your jobs ask for", icon: GraduationCap },
    { id: "recruiters", href: "/app/recruiters", label: "Recruiters", value: "Let companies find you", icon: MessagesSquare },
    { id: "resumes", href: "/app/resume-studio", label: "My Resume", value: files || resumes ? [files ? `${files} uploaded` : "", resumes ? `${resumes} designed` : ""].filter(Boolean).join(" · ") : "None yet", icon: FileText },
    { id: "job_sources", href: "/app/settings", label: "Job sources", value: `${on} of ${integrated.length} searched`, icon: Database },
    // Employers and recruiters: the company's hiring workspace (anyone can set one up or join by invitation).
    { id: "hiring", href: "/app/hiring", label: "Hiring", value: "Post jobs, review applicants", icon: Building2 },
    { id: "search_history", href: "/app/runs", label: "Search history", value: runCount ? plural(runCount, "search", "searches") : "None yet", icon: History },
  ], menu);

  return <YouOverview rows={rows} />;
}
