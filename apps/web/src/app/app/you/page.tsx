"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Bot, ChevronRight, Database, Dna, FileText, History, Sparkles, Timer, UserRoundCog } from "lucide-react";
import { AUTOMATION_LEVEL_META } from "@/domain/automation/policy";
import { AI_PROVIDERS } from "@/domain/ai/types";
import { useAuthStore } from "@/store/auth";
import { useAutomationStore } from "@/store/automation";
import { useAIStore } from "@/store/ai";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useWorkflowStore } from "@/store/workflow";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { stripHeadlineLabel, stripSelfReference } from "@/services/jobs/normalize";
import { Avatar } from "@/components/common/Avatar";

/** What each automation level means in a few words — the level's name alone ("Work with me") doesn't say what Wonder does. */
const LEVEL_IN_WORDS: Record<string, string> = { assist: "Asks before everything", guided: "Asks when it matters", autonomous: "Acts on your rules", continuous: "Acts and keeps watch" };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** You: who Wonder is searching for, and everything it's been told to do. One row per page, with its current value. */
export default function YouPage() {
  const dna = useCareerStore((s) => s.dna);
  const resumes = useCareerStore((s) => s.savedResumes.length);
  const files = useResumeFilesStore((s) => s.files.length);
  const loadFiles = useResumeFilesStore((s) => s.load);
  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);
  const email = useAuthStore((s) => s.email);
  const sources = useJobsStore((s) => s.sources);
  const level = useAutomationStore((s) => s.defaultLevel);
  const provider = useAIStore((s) => s.config.activeProvider);
  const schedules = useWorkflowStore((s) => s.schedules);
  const runCount = useWorkflowStore((s) => Object.keys(s.runs).length);
  const name = dna.name || email?.split("@")[0] || "You";
  const integrated = sources.filter((s) => s.integrated);
  const on = integrated.filter((s) => s.enabled && s.available !== false).length;
  const headline = stripHeadlineLabel(dna.headline);
  // The headline says what they do; failing that, the goal without its lead-in ("Find senior product roles…" → "senior product roles…").
  const goal = stripSelfReference(dna.careerGoal.trim()).replace(/^(?:find(?:\s+me)?|looking\s+for|search(?:\s+for)?|i\s+want)\s+/i, "");
  const wants = headline || goal;
  const active = Object.values(schedules).filter((x) => x.enabled).length;

  const rows = [
    { href: "/app/career-dna", label: "Career Profile", value: wants ? (headline ? headline : `Looking for ${wants}`) : "Not filled in", icon: Dna },
    { href: "/app/resume-studio", label: "Résumés", value: files || resumes ? [files ? `${files} uploaded` : "", resumes ? `${resumes} designed` : ""].filter(Boolean).join(" · ") : "None yet", icon: FileText },
    { href: "/app/settings", label: "Job sources", value: `${on} of ${integrated.length} searched`, icon: Database },
    { href: "/app/automation/settings", label: "What Wonder can do", value: LEVEL_IN_WORDS[level] ?? AUTOMATION_LEVEL_META[level]?.label ?? "Not set", icon: Bot },
    { href: "/app/automation/scheduled", label: "Scheduled searches", value: active ? `${active} running` : "None set up", icon: Timer },
    { href: "/app/runs", label: "Search history", value: runCount ? plural(runCount, "search", "searches") : "None yet", icon: History },
    { href: "/app/settings/ai", label: "AI provider", value: AI_PROVIDERS[provider] ? (AI_PROVIDERS[provider].billing === "byok" ? `Your ${AI_PROVIDERS[provider].name} key` : `${AI_PROVIDERS[provider].name} · included`) : provider, icon: Sparkles },
    { href: "/app/profile", label: "Account", value: email ?? "", icon: UserRoundCog },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/career-dna" className="mb-4 flex items-center gap-3 rounded-[16px] border border-line bg-surface p-4 hover:bg-surface-2">
        <Avatar name={name} size={48} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-semibold text-ink">{name}</span>
          <span className="block truncate text-[13px] text-ink-3">{headline || "Add your headline"}</span>
        </span>
        <ChevronRight className="size-4 text-ink-4" aria-hidden />
      </Link>
      <ul className="divide-y divide-line overflow-hidden rounded-[16px] border border-line bg-surface">
        {rows.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="flex items-center gap-3 px-4 py-3.5 text-[14px] hover:bg-surface-2">
              <r.icon className="size-4 shrink-0 text-ink-3" aria-hidden />
              <span className="flex-1 text-ink">{r.label}</span>
              <span className="max-w-[45%] truncate text-[13px] text-ink-3">{r.value}</span>
              <ChevronRight className="size-4 shrink-0 text-ink-4" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
