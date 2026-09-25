"use client";
import Link from "next/link";
import { ArrowRight, BarChart3, FileText, LayoutList, Mic, Search, Sparkles } from "lucide-react";
import type { WorkflowRun } from "@/domain/workflow/types";
import type { HomeAttention } from "@/domain/career/attention";
import type { CanonicalJob, JobMatch, JobQuality } from "@/domain/jobs/types";
import { AUTOMATION_LEVEL_META, type AutomationLevel } from "@/domain/automation/policy";
import { greeting } from "@/lib/format";
import { Avatar } from "@/components/common/Avatar";
import { ProgressAndWatch } from "./ProgressAndWatch";
import { ActiveRunCard } from "@/components/workflow/ActiveRunCard";
import { HomeAttentionSections } from "./HomeAttentionSections";
import { useUIStore } from "@/store/ui";
import { cn } from "@/lib/cn";

const QUICK = [
  { href: "/app/jobs", label: "Search Jobs", icon: Search, cls: "bg-brand-50 text-brand-600" },
  { href: "/app/resume-studio", label: "Update Resume", icon: FileText, cls: "bg-blue-100 text-blue-600" },
  { href: "/app/applications", label: "Track Applications", icon: LayoutList, cls: "bg-warning-100 text-warning-600" },
  { href: "/app/insights", label: "Career Insights", icon: BarChart3, cls: "bg-[#fbe8ff] text-pink-500" },
];

/** Mobile Home. Rendered below `md`; the desktop Home takes over above it. Shares
 * `HomeAttentionSections` with the desktop so the two can never show different "what deserves
 * your attention today" content for the same real state. */
export function MobileHome({
  name,
  level,
  activeRun,
  attention,
  jobs,
  matches,
  quality,
  saved,
  onToggleSave,
}: {
  name: string;
  level: AutomationLevel;
  activeRun?: WorkflowRun;
  attention: HomeAttention;
  jobs: Record<string, CanonicalJob>;
  matches: Record<string, JobMatch>;
  quality: Record<string, JobQuality>;
  saved: Record<string, string>;
  onToggleSave: (jobId: string) => void;
}) {
  const openCommand = useUIStore((s) => s.setCommandOpen);
  const firstName = name.split(" ")[0];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[15px] text-ink-2">{greeting()},</p>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink">{firstName} 👋</h1>
          <p className="mt-1 text-[13px] text-ink-3">Let&apos;s make progress on your career goals.</p>
        </div>
        <Link href="/app/profile" aria-label="Profile">
          <Avatar name={name} size={44} />
        </Link>
      </div>

      <button type="button" onClick={() => openCommand(true)} className="flex h-12 w-full items-center gap-2 rounded-full border border-line bg-surface px-4 text-left text-[14px] text-ink-4">
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">What would you like to do today?</span>
        <Mic className="size-4 shrink-0" aria-hidden />
      </button>

      {activeRun ? (
        <ActiveRunCard run={activeRun} />
      ) : (
        <Link href="/app/runs/new" className="wj-gradient-bg relative block overflow-hidden rounded-[24px] p-5 text-white shadow-brand">
          <div className="absolute -right-8 -top-8 size-40 rounded-full bg-white/10" aria-hidden />
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/20">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[18px] font-semibold">Find opportunities</p>
              <p className="text-[13px] text-white/85">Tell Wonder what you want. It searches, compares and prepares — you decide.</p>
            </div>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-600">
              <ArrowRight className="size-4" aria-hidden />
            </span>
          </div>
          <p className="mt-4 text-[12px] text-white/85">
            <span className="font-semibold text-white">{AUTOMATION_LEVEL_META[level].label}:</span> {AUTOMATION_LEVEL_META[level].short}
          </p>
        </Link>
      )}

      <ul className="grid grid-cols-4 gap-2" aria-label="Quick actions">
        {QUICK.map((q) => (
          <li key={q.href}>
            <Link href={q.href} className="flex flex-col items-center gap-2 rounded-[16px] py-2 text-center text-[11px] font-medium text-ink-2">
              <span className={cn("flex size-12 items-center justify-center rounded-[14px]", q.cls)}>
                <q.icon className="size-5" aria-hidden />
              </span>
              {q.label}
            </Link>
          </li>
        ))}
      </ul>

      {!activeRun && attention.recentRunLine && <p className="px-1 text-[13px] text-ink-3">{attention.recentRunLine}</p>}
      <ProgressAndWatch />

      <HomeAttentionSections attention={attention} jobs={jobs} matches={matches} quality={quality} saved={saved} onToggleSave={onToggleSave} />
    </div>
  );
}
