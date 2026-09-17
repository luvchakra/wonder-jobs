"use client";
import Link from "next/link";
import { ArrowRight, BarChart3, FileText, LayoutList, Mic, Search, Sparkles, Bot } from "lucide-react";
import type { ActivityItem as Activity } from "@/domain/career/types";
import type { WorkflowRun } from "@/domain/workflow/types";
import { AUTOMATION_LEVEL_META, type AutomationLevel } from "@/domain/automation/policy";
import { greeting } from "@/lib/format";
import { Avatar } from "@/components/common/Avatar";
import { ActivityItem } from "./ActivityItem";
import { ActiveRunCard } from "@/components/workflow/ActiveRunCard";
import { useUIStore } from "@/store/ui";
import { cn } from "@/lib/cn";

const QUICK = [
  { href: "/app/jobs", label: "Search Jobs", icon: Search, cls: "bg-brand-50 text-brand-600" },
  { href: "/app/resume-studio", label: "Update Resume", icon: FileText, cls: "bg-blue-100 text-blue-600" },
  { href: "/app/applications", label: "Track Applications", icon: LayoutList, cls: "bg-warning-100 text-warning-600" },
  { href: "/app/insights", label: "Career Insights", icon: BarChart3, cls: "bg-[#fbe8ff] text-pink-500" },
];

/** Mobile Home (spec §6). Rendered below `md`; the desktop dashboard takes over above it. */
export function MobileHome({ name, level, activity, activeRun }: { name: string; level: AutomationLevel; activity: Activity[]; activeRun?: WorkflowRun }) {
  const openCommand = useUIStore((s) => s.setCommandOpen);
  const firstName = name.split(" ")[0];
  const chips: { label: string; on: boolean }[] = [
    { label: "Automated", on: level === "autonomous" || level === "continuous" },
    { label: "Guided", on: level === "guided" },
    { label: "You're in control", on: true },
  ];
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
              <p className="text-[18px] font-semibold">Run Wonder</p>
              <p className="text-[13px] text-white/85">Find, Analyze, Prepare, Track. All in one go.</p>
            </div>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-600">
              <ArrowRight className="size-4" aria-hidden />
            </span>
          </div>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Automation state">
            {chips.map((c) => (
              <li key={c.label} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium", c.on ? "bg-white/25 text-white" : "bg-white/10 text-white/60")}>
                <span className={cn("size-1.5 rounded-full", c.on ? "bg-white" : "bg-white/40")} aria-hidden /> {c.label}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-white/70">Default level: {AUTOMATION_LEVEL_META[level].label}</p>
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

      <section aria-labelledby="m-activity">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="m-activity" className="text-[16px] font-semibold text-ink">
            Recent Activity
          </h2>
          <Link href="/app/runs" className="text-[13px] font-medium text-brand-600">
            See all
          </Link>
        </div>
        {activity.length ? (
          <ul className="flex flex-col gap-2">
            {activity.slice(0, 3).map((a) => (
              <li key={a.id}>
                <ActivityItem item={a} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-3">Your searches, tailored resumes and prepared applications will show up here.</p>
        )}
      </section>

      <button type="button" onClick={() => openCommand(true)} className="wj-card flex items-center gap-3 p-4 text-left">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-white">
          <Bot className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink">Hey {firstName}, I&apos;m Wonder</span>
          <span className="block text-[12px] text-ink-3">Tell me what you want to do.</span>
        </span>
        <ArrowRight className="size-4 text-ink-4" aria-hidden />
      </button>
    </div>
  );
}
