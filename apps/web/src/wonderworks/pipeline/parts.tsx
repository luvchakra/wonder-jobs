"use client";
import Link from "next/link";
import { Chip } from "@/components/common/Input";
import { CompanyLogo } from "@/components/common/Avatar";
import { Badge, type Tone } from "@/components/common/Badge";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate, formatTime } from "@/lib/format";
import { useNow } from "@/lib/motion";

/**
 * Pipeline's building blocks, shared by every WonderWorks module (docs/WONDERWORKS_PLATFORM.md §4.1): the row of stage
 * tiles with counts, a stage's filter chips, its list, its compact cards and an item's timeline. Extracted from the jobs portal's Pipeline
 * (app/app/applications/page.tsx, components/applications/ApplicationCard.tsx), which renders through them unchanged;
 * a module brings only its stages and what each card says.
 */

const COLS: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5" };

/** The stages as one row of counts; tapping one shows its items (one stage at a time). */
export function StageTiles<T extends string>({ label, stages, current, onPick }: { label: string; stages: { id: T; label: string; count: number }[]; current: T; onPick: (id: T) => void }) {
  return (
    <div role="tablist" aria-label={label} className={cn("mb-4 grid gap-2", COLS[stages.length] ?? "grid-cols-4")}>
      {stages.map((st) => {
        const on = st.id === current;
        return (
          <button key={st.id} type="button" role="tab" aria-selected={on} onClick={() => onPick(st.id)} className={cn("flex min-h-[64px] flex-col items-center justify-center rounded-[14px] border px-1 py-2 text-center transition-colors", on ? "border-brand-400 bg-brand-50" : "border-line bg-surface hover:border-line-strong")}>
            <span className={cn("text-[20px] font-semibold leading-none", st.count ? "text-brand-700" : "text-ink-4")}>{st.count}</span>
            <span className="mt-1 text-[11.5px] font-medium text-ink-2">{st.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A stage's filter chips (by status, by where each stands…), shown only when there's more than one kind. */
export function StageFilter<T extends string | number>({ label, all, options, value, onPick }: { label: string; all: number; options: { value: T; label: string; count: number }[]; value: T | null; onPick: (v: T | null) => void }) {
  return (
    <div role="group" aria-label={label} className="-mt-1 mb-3 flex flex-wrap gap-1.5">
      <Chip active={value === null} isDefault onClick={() => onPick(null)} className="h-8 px-3 text-[12px]">
        All {all}
      </Chip>
      {options.map((o) => (
        <Chip key={String(o.value)} active={value === o.value} onClick={() => onPick(value === o.value ? null : o.value)} className="h-8 px-3 text-[12px]">
          {o.label} {o.count}
        </Chip>
      ))}
    </div>
  );
}

export function StageEmpty({ label }: { label: string }) {
  return <p className="rounded-[12px] border border-dashed border-line px-3 py-4 text-center text-[13px] text-ink-3">Nothing in {label} yet.</p>;
}

export function StageList({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3" aria-label={label}>
      {children}
    </ul>
  );
}

/** Each status on the card as a small chip (e.g. "Résumé made", "Apply opened"). */
function Tags({ tags }: { tags: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">
          {t}
        </span>
      ))}
    </span>
  );
}

/**
 * One item in a stage: the logo, company, title and one line of facts, the next step, small status chips, and the
 * status badge with when. `actionSpace` leaves the bottom-right corner free for an action the list lays over it.
 * `href` makes the card a link; `onOpen` a button; neither, a plain card.
 */
export function StageCard({ href, onOpen, logo, company, title, line, step, tags = [], badge, when, actionSpace = false, className }: { href?: string; onOpen?: () => void; logo: { name: string; domain?: string }; company: string; title: string; line?: string; step?: string; tags?: string[]; badge: { label: string; tone: Tone }; when: string; actionSpace?: boolean; className?: string }) {
  const body = (
    <>
      <div className="flex items-start gap-2.5">
        <CompanyLogo name={logo.name} domain={logo.domain} logo size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">{company}</span>
          <span className="line-clamp-2 text-[12px] text-ink-2">{title}</span>
          {line && <span className="block truncate text-[11.5px] text-ink-3">{line}</span>}
        </span>
      </div>
      {step && <span className="block truncate text-[11.5px] font-medium text-brand-700">{step}</span>}
      {tags.length > 0 && <Tags tags={tags} />}
      <div className={cn("flex items-center justify-between gap-2", actionSpace && "min-h-9")}>
        <Badge tone={badge.tone} className="shrink-0">
          {badge.label}
        </Badge>
        <span className={cn("truncate text-[11px] text-ink-4", actionSpace && "hidden")}>{when}</span>
      </div>
    </>
  );
  const cls = cn("wj-card wj-elevate flex flex-col gap-2 p-3", className);
  if (href)
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  if (onOpen)
    return (
      <button type="button" onClick={onOpen} className={cn(cls, "w-full text-left")}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}

/** An item's history, oldest first, as Jobs' application page has it: an icon per event, a future one dashed and "upcoming". */
export function StageTimeline({ events, label = "Application timeline", className }: { events: { id: string; at: string; title: string; detail?: string; icon: LucideIcon }[]; label?: string; className?: string }) {
  const now = useNow();
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  if (!sorted.length) return <p className="text-sm text-ink-3">No events yet.</p>;
  return (
    <ol className={cn("relative", className)} aria-label={label}>
      {sorted.map((e, i) => {
        const Icon = e.icon;
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
