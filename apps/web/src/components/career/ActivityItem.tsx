import Link from "next/link";
import { Bookmark, CalendarCheck, FileText, Search, Send, Zap } from "lucide-react";
import type { ActivityItem as Activity } from "@/domain/career/types";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";

const ICONS = { search_completed: Search, resume_tailored: FileText, application_prepared: Send, job_saved: Bookmark, run_completed: Zap, interview_scheduled: CalendarCheck } as const;

/** Every activity item is actionable — it links to the thing it describes. */
export function ActivityItem({ item, className }: { item: Activity; className?: string }) {
  const Icon = ICONS[item.kind];
  return (
    <Link href={item.href} className={cn("wj-card wj-elevate flex items-center gap-3 p-4", className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-ink">{item.title}</span>
        <span className="block truncate text-[12px] text-ink-3">
          {relativeTime(item.at)} <span className="mx-1 text-ink-4">·</span> {item.subtitle}
        </span>
      </span>
    </Link>
  );
}
