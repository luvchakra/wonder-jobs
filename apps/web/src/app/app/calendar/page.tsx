"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { useWorkflowStore } from "@/store/workflow";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { UpcomingList } from "@/components/career/UpcomingList";
import { CalendarSubscribe } from "@/components/calendar/CalendarSubscribe";
import { useNow } from "@/lib/motion";
import type { UpcomingItem } from "@/domain/career/types";
import { cn } from "@/lib/cn";

const DAY = 86_400_000;

export default function CalendarPage() {
  const applications = useApplicationsStore((s) => s.applications);
  const jobs = useJobsStore((s) => s.jobs);
  const schedules = useWorkflowStore((s) => s.schedules);
  const now = useNow();
  const [monthOverride, setMonthOverride] = useState<Date | null>(null);
  const month = monthOverride ?? new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1);

  // Real events: follow-ups and interviews from applications, next scheduled runs.
  const events = useMemo<UpcomingItem[]>(() => {
    const out: UpcomingItem[] = [];
    for (const a of Object.values(applications)) {
      const job = jobs[a.jobId];
      for (const f of a.followUps) {
        if (f.done) continue;
        out.push({ id: f.id, at: f.dueAt, kind: f.kind === "interview" ? "interview" : "follow_up", title: f.kind === "interview" ? "Interview" : f.kind === "thank_you" ? "Thank-you note" : "Follow up", subtitle: `${job?.company ?? ""} – ${job?.title ?? ""}`, href: `/app/applications/${a.id}` });
      }
    }
    for (const s of Object.values(schedules)) if (s.enabled && s.nextRunAt) out.push({ id: s.id, at: s.nextRunAt, kind: "scheduled_run", title: "Scheduled Run", subtitle: s.name, href: `/app/automation/scheduled/${s.id}` });
    return out.sort((a, b) => a.at.localeCompare(b.at));
  }, [applications, jobs, schedules]);

  const first = month;
  const startOffset = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: startOffset + daysInMonth }, (_, i) => (i < startOffset ? null : new Date(first.getFullYear(), first.getMonth(), i - startOffset + 1)));
  const todayKey = new Date(now).toDateString();
  const byDay = new Map<string, UpcomingItem[]>();
  for (const e of events) {
    const k = new Date(e.at).toDateString();
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const upcoming = events.filter((e) => new Date(e.at).getTime() > now - DAY).slice(0, 8);

  return (
    <div>
      <PageHeader title="Calendar" description="Interviews, follow-ups and scheduled runs — everything with a date, in one place." actions={<CalendarSubscribe />} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-ink">{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" aria-label="Previous month" onClick={() => setMonthOverride(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMonthOverride(null)}>
                Today
              </Button>
              <Button size="sm" variant="ghost" aria-label="Next month" onClick={() => setMonthOverride(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-ink-4" aria-hidden>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Month">
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} aria-hidden />;
              const list = byDay.get(d.toDateString()) ?? [];
              const isToday = d.toDateString() === todayKey;
              return (
                <div key={d.toISOString()} role="gridcell" className={cn("min-h-[64px] rounded-[10px] border p-1.5 text-[12px] md:min-h-[84px]", isToday ? "border-brand-500 bg-brand-50/50" : "border-line")}>
                  <span className={cn("font-medium", isToday ? "text-brand-700" : "text-ink-2")}>{d.getDate()}</span>
                  <ul className="mt-1 space-y-0.5">
                    {list.slice(0, 2).map((e) => (
                      <li key={e.id}>
                        <Link href={e.href} className={cn("block truncate rounded px-1 py-0.5 text-[10px] font-medium", e.kind === "interview" ? "bg-blue-100 text-blue-600" : e.kind === "follow_up" ? "bg-brand-50 text-brand-700" : "bg-[#fbe8ff] text-pink-500")}>
                          {e.title}
                        </Link>
                      </li>
                    ))}
                    {list.length > 2 && <li className="text-[10px] text-ink-4">+{list.length - 2} more</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Upcoming</h2>
          <UpcomingList items={upcoming} />
        </Card>
      </div>
    </div>
  );
}
