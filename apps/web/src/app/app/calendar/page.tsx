"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Mail, Timer } from "lucide-react";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { useWorkflowStore } from "@/store/workflow";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { CalendarSubscribe } from "@/components/calendar/CalendarSubscribe";
import { useNow } from "@/lib/motion";
import { formatTime } from "@/lib/format";
import type { UpcomingItem } from "@/domain/career/types";
import { cn } from "@/lib/cn";

type Kind = UpcomingItem["kind"];
type CalendarItem = UpcomingItem & { note?: string; action: { label: string; href: string } };

const KIND: Record<Kind, { icon: typeof Mail; dot: string; tile: string; plural: [string, string] }> = {
  interview: { icon: CalendarDays, dot: "bg-blue-500", tile: "bg-blue-100 text-blue-600", plural: ["interview", "interviews"] },
  follow_up: { icon: Mail, dot: "bg-brand-500", tile: "bg-brand-50 text-brand-600", plural: ["follow-up", "follow-ups"] },
  scheduled_run: { icon: Timer, dot: "bg-amber-500", tile: "bg-[#fbe8ff] text-pink-500", plural: ["scheduled search", "scheduled searches"] },
};

const count = (n: number, kind: Kind) => `${n} ${KIND[kind].plural[n === 1 ? 0 : 1]}`;

export default function CalendarPage() {
  const applications = useApplicationsStore((s) => s.applications);
  const jobs = useJobsStore((s) => s.jobs);
  const schedules = useWorkflowStore((s) => s.schedules);
  const now = useNow();
  const [monthOverride, setMonthOverride] = useState<Date | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const dayRef = useRef<HTMLDivElement>(null);
  // On a phone the day's list is below the month: bring it into view.
  const show = (dayKey: string) => {
    setPicked(dayKey);
    requestAnimationFrame(() => dayRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  const month = monthOverride ?? new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1);

  // Real events: follow-ups and interviews from applications, next scheduled runs — each with its next step.
  const events = useMemo<CalendarItem[]>(() => {
    const out: CalendarItem[] = [];
    for (const a of Object.values(applications)) {
      const job = a.job ?? jobs[a.jobId];
      for (const f of a.followUps) {
        if (f.done) continue;
        const interview = f.kind === "interview";
        out.push({
          id: f.id,
          at: f.dueAt,
          kind: interview ? "interview" : "follow_up",
          title: interview ? "Interview" : f.kind === "thank_you" ? "Thank-you note" : "Follow up",
          subtitle: [job?.company, job?.title].filter(Boolean).join(" – "),
          note: f.note || undefined,
          href: `/app/applications/${a.id}`,
          action: interview ? { label: "Prepare", href: `/app/applications/${a.id}/interview` } : { label: "Write", href: `/app/applications/${a.id}` },
        });
      }
    }
    for (const s of Object.values(schedules)) if (s.enabled && s.nextRunAt) out.push({ id: s.id, at: s.nextRunAt, kind: "scheduled_run", title: "Scheduled search", subtitle: s.name, href: `/app/automation/scheduled/${s.id}`, action: { label: "Open", href: `/app/automation/scheduled/${s.id}` } });
    return out.sort((a, b) => a.at.localeCompare(b.at));
  }, [applications, jobs, schedules]);

  const first = month;
  const startOffset = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: startOffset + daysInMonth }, (_, i) => (i < startOffset ? null : new Date(first.getFullYear(), first.getMonth(), i - startOffset + 1)));
  const todayKey = new Date(now).toDateString();
  const selected = picked ?? todayKey;
  const byDay = new Map<string, CalendarItem[]>();
  for (const e of events) {
    const k = new Date(e.at).toDateString();
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const dayItems = byDay.get(selected) ?? [];
  const overdue = (e: CalendarItem) => e.kind !== "scheduled_run" && new Date(e.at).getTime() < now;
  const overdueCount = events.filter(overdue).length;
  // An empty day points to the next thing after it.
  const next = events.find((e) => new Date(e.at).getTime() >= new Date(selected).getTime() + 86_400_000);
  const pick = (iso: string) => {
    const d = new Date(iso);
    show(d.toDateString());
    setMonthOverride(new Date(d.getFullYear(), d.getMonth(), 1));
  };
  const kindsOf = (list: CalendarItem[]) => (["interview", "follow_up", "scheduled_run"] as const).filter((k) => list.some((e) => e.kind === k));

  return (
    <div>
      <PageHeader title="Calendar" description="Interviews, follow-ups and scheduled searches." actions={<CalendarSubscribe />} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-ink">{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" aria-label="Previous month" onClick={() => setMonthOverride(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMonthOverride(null);
                  setPicked(null);
                }}
              >
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
          {/* A day shows a dot per kind of item (names don't fit); tapping it lists them below. */}
          <div className="grid grid-cols-7 gap-1" aria-label="Month">
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} aria-hidden />;
              const dayKey = d.toDateString();
              const list = byDay.get(dayKey) ?? [];
              const isToday = dayKey === todayKey;
              const on = dayKey === selected;
              const late = list.some(overdue);
              return (
                <button
                  key={dayKey}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}${list.length ? `, ${list.length} item${list.length === 1 ? "" : "s"}` : ""}`}
                  onClick={() => show(dayKey)}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center gap-1 rounded-[12px] border text-[13px] transition-colors md:aspect-auto md:min-h-[72px]",
                    on ? "border-brand-500 bg-brand-600 text-white" : isToday ? "border-brand-400 bg-brand-50 text-brand-700" : "border-line text-ink-2 hover:border-line-strong",
                  )}
                >
                  <span className={cn("font-medium leading-none", (on || isToday) && "font-semibold")}>{d.getDate()}</span>
                  <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                    {kindsOf(list).map((k) => (
                      <span key={k} className={cn("size-1.5 rounded-full", on ? "bg-white" : late && k !== "scheduled_run" ? "bg-danger-600" : KIND[k].dot)} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-3" aria-hidden>
            {(["interview", "follow_up", "scheduled_run"] as const).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={cn("size-1.5 rounded-full", KIND[k].dot)} />
                {KIND[k].plural[1][0].toUpperCase() + KIND[k].plural[1].slice(1)}
              </span>
            ))}
          </div>
        </Card>

        <Card ref={dayRef} aria-labelledby="cal-day" className="scroll-mb-24">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 id="cal-day" className="text-[15px] font-semibold text-ink">
              {new Date(selected).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            </h2>
            {selected === todayKey && <span className="text-[12px] font-medium text-brand-700">Today</span>}
          </div>
          {overdueCount > 0 && (
            <Link href="/app/tasks" className="mb-3 flex items-center gap-2 rounded-[12px] bg-danger-100 px-3 py-2 text-[12.5px] font-medium text-danger-600 hover:opacity-90">
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{overdueCount} past due — catch up in Tasks</span>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          )}
          {dayItems.length ? (
            <>
              <p className="mb-2 text-[12.5px] text-ink-3">{kindsOf(dayItems).map((k) => count(dayItems.filter((e) => e.kind === k).length, k)).join(" · ")}</p>
              <ul className="flex flex-col gap-2" aria-label="This day">
                {dayItems.map((e) => {
                  const I = KIND[e.kind].icon;
                  const late = overdue(e);
                  return (
                    <li key={e.id} className="flex items-center gap-3 rounded-[14px] border border-line bg-surface-2 p-3">
                      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-[12px]", KIND[e.kind].tile)}>
                        <I className="size-4" aria-hidden />
                      </span>
                      <Link href={e.href} className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-ink">{e.title}</span>
                        <span className="block truncate text-[12px] text-ink-3">
                          <span className={cn("font-medium", late ? "text-danger-600" : "text-ink-2")}>{late ? "Past due" : formatTime(e.at)}</span>
                          {e.subtitle && ` · ${e.subtitle}`}
                        </span>
                        {e.note && <span className="block truncate text-[12px] text-ink-4">{e.note}</span>}
                      </Link>
                      <Button size="sm" variant={late ? "primary" : "outline"} href={e.action.href}>
                        {e.action.label}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="rounded-[12px] border border-dashed border-line px-3 py-4 text-center">
              <p className="text-[13px] text-ink-3">Nothing on this day.</p>
              {next && (
                <button type="button" onClick={() => pick(next.at)} className="mt-1 text-[13px] font-medium text-brand-700 hover:underline">
                  Next: {next.title} · {new Date(next.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </button>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
