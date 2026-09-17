"use client";
import { Bookmark, CalendarDays, FileCheck, Flag, Mail, MessageSquare, Search, Send, StickyNote } from "lucide-react";
import type { ApplicationEvent } from "@/domain/applications/types";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/motion";

const ICONS = { discovered: Search, saved: Bookmark, prepared: FileCheck, submitted: Send, follow_up: Mail, recruiter_response: MessageSquare, interview: CalendarDays, outcome: Flag, note: StickyNote } as const;

export function ApplicationTimeline({ events, className }: { events: ApplicationEvent[]; className?: string }) {
  const now = useNow();
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  if (!sorted.length) return <p className="text-sm text-ink-3">No events yet.</p>;
  return (
    <ol className={cn("relative", className)} aria-label="Application timeline">
      {sorted.map((e, i) => {
        const Icon = ICONS[e.type];
        const future = new Date(e.at).getTime() > now;
        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < sorted.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-16px)] w-0.5 bg-line" aria-hidden />}
            <span className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border", future ? "border-dashed border-brand-300 bg-surface text-brand-500" : "border-line bg-brand-50 text-brand-600")}>
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-[14px] font-medium text-ink">
                {e.title} {future && <span className="ml-1 text-[11px] font-normal text-brand-600">upcoming</span>}
              </p>
              {e.detail && <p className="text-[13px] text-ink-3">{e.detail}</p>}
              <p className="mt-0.5 text-[11px] text-ink-4">
                {formatDate(e.at)} · {formatTime(e.at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
