"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, ChevronRight, History, Sparkles, Timer } from "lucide-react";
import { AUTOMATION_LEVEL_META } from "@/domain/automation/policy";
import { AI_PROVIDERS } from "@/domain/ai/types";
import { useAskWonder } from "@/lib/useAskWonder";
import { useAutomationStore } from "@/store/automation";
import { useAIStore } from "@/store/ai";
import { useWorkflowStore } from "@/store/workflow";
import { Input } from "@/components/common/Input";

// Questions Wonder answers from the candidate's own data (domain/wonder/resolve.ts) — tapping one only fills the box.
const EXAMPLES = ["What should I focus on today?", "How are my applications going?", "What skills am I missing?"];

/** Wonder: ask it something, and set how much it does on its own. */
export default function WonderPage() {
  const [q, setQ] = useState("");
  const { results, go } = useAskWonder(q);
  const level = useAutomationStore((s) => s.defaultLevel);
  const provider = useAIStore((s) => s.config.activeProvider);
  const schedules = useWorkflowStore((s) => s.schedules);
  const runCount = useWorkflowStore((s) => Object.keys(s.runs).length);
  const active = Object.values(schedules).filter((x) => x.enabled).length;
  const shown = q.trim() ? results.slice(0, 5) : [];

  const rows = [
    { href: "/app/automation/settings", label: "What Wonder can do", value: AUTOMATION_LEVEL_META[level]?.label ?? "Not set", icon: Bot },
    { href: "/app/automation/scheduled", label: "Scheduled searches", value: active ? `${active} on` : "None", icon: Timer },
    { href: "/app/runs", label: "Search history", value: runCount ? `${runCount}` : "None yet", icon: History },
    { href: "/app/settings/ai", label: "AI provider", value: AI_PROVIDERS[provider]?.name ?? provider, icon: Sparkles },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-[26px] font-semibold tracking-tight text-ink md:text-[30px]">Ask Wonder</h1>
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          if (shown[0]) go(shown[0]);
        }}
      >
        <Sparkles className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-brand-500" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your jobs, applications or profile" aria-label="Ask Wonder" className="h-12 rounded-full pl-10" />
      </form>
      {shown.length > 0 ? (
        <ul className="mt-3 overflow-hidden rounded-[14px] border border-line bg-surface">
          {shown.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => go(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] hover:bg-surface-2">
                <c.icon className="size-4 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{c.label}</span>
                  {c.hint && <span className="block truncate text-[12px] text-ink-3">{c.hint}</span>}
                </span>
                <ArrowRight className="size-4 text-ink-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" onClick={() => setQ(x)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-2 hover:bg-surface-2">
              {x}
            </button>
          ))}
        </div>
      )}

      <h2 className="mb-2 mt-8 text-[16px] font-semibold text-ink">Automation</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface">
        {rows.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="flex items-center gap-3 px-4 py-3.5 text-[14px] hover:bg-surface-2">
              <r.icon className="size-4 text-ink-3" aria-hidden />
              <span className="flex-1 text-ink">{r.label}</span>
              <span className="text-[13px] text-ink-3">{r.value}</span>
              <ChevronRight className="size-4 text-ink-4" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
