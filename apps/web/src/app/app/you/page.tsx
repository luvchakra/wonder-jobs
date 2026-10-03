"use client";
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
import { Avatar } from "@/components/common/Avatar";

/** You: who Wonder is searching for, and everything it's been told to do. One row per page, with its current value. */
export default function YouPage() {
  const dna = useCareerStore((s) => s.dna);
  const resumes = useCareerStore((s) => s.savedResumes.length);
  const email = useAuthStore((s) => s.email);
  const sources = useJobsStore((s) => s.sources);
  const level = useAutomationStore((s) => s.defaultLevel);
  const provider = useAIStore((s) => s.config.activeProvider);
  const schedules = useWorkflowStore((s) => s.schedules);
  const runCount = useWorkflowStore((s) => Object.keys(s.runs).length);
  const name = dna.name || email?.split("@")[0] || "You";
  const on = sources.filter((s) => s.integrated && s.enabled).length;
  const active = Object.values(schedules).filter((x) => x.enabled).length;

  const rows = [
    { href: "/app/career-dna", label: "Career Profile", value: dna.headline || "Not filled in", icon: Dna },
    { href: "/app/resume-studio", label: "Résumés", value: resumes ? `${resumes}` : "None yet", icon: FileText },
    { href: "/app/settings", label: "Job sources", value: `${on} on`, icon: Database },
    { href: "/app/automation/settings", label: "What Wonder can do", value: AUTOMATION_LEVEL_META[level]?.label ?? "Not set", icon: Bot },
    { href: "/app/automation/scheduled", label: "Scheduled searches", value: active ? `${active} on` : "None", icon: Timer },
    { href: "/app/runs", label: "Search history", value: runCount ? `${runCount}` : "None yet", icon: History },
    { href: "/app/settings/ai", label: "AI provider", value: AI_PROVIDERS[provider]?.name ?? provider, icon: Sparkles },
    { href: "/app/profile", label: "Account", value: email ?? "", icon: UserRoundCog },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/career-dna" className="mb-4 flex items-center gap-3 rounded-[16px] border border-line bg-surface p-4 hover:bg-surface-2">
        <Avatar name={name} size={48} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-semibold text-ink">{name}</span>
          <span className="block truncate text-[13px] text-ink-3">{dna.headline || "Add your headline"}</span>
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
