import Link from "next/link";
import { CalendarDays, Mail, Timer } from "lucide-react";
import type { UpcomingItem } from "@/domain/career/types";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";

const ICONS = { interview: { icon: CalendarDays, cls: "bg-blue-100 text-blue-600" }, follow_up: { icon: Mail, cls: "bg-brand-50 text-brand-600" }, scheduled_run: { icon: Timer, cls: "bg-[#fbe8ff] text-pink-500" } };

function when(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const dayDiff = Math.round((d.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) / 86_400_000);
  const t = formatTime(iso);
  if (dayDiff === 0) return `Today, ${t}`;
  if (dayDiff === 1) return `Tomorrow, ${t}`;
  if (dayDiff > 1 && dayDiff < 7) return `In ${dayDiff} days`;
  return `${formatDate(iso)}, ${t}`;
}

export function UpcomingList({ items, className }: { items: UpcomingItem[]; className?: string }) {
  if (!items.length) return <p className="text-sm text-ink-3">Nothing scheduled yet.</p>;
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {items.map((u) => {
        const I = ICONS[u.kind];
        return (
          <li key={u.id}>
            <Link href={u.href} className="flex items-center gap-3 rounded-[14px] border border-line bg-surface-2 p-3 transition-colors hover:bg-bg-soft">
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-[12px]", I.cls)}>
                <I.icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-ink">{u.title}</span>
                <span className="block text-[12px] text-ink-3">{when(u.at)}</span>
                <span className="block truncate text-[12px] text-ink-3">{u.subtitle}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
