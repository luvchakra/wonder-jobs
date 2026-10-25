"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { buildDigest, type DigestItem } from "@/domain/digest/build";
import { FIT_META, type FitLabel } from "@/domain/jobs/types";
import { DAY, pct, perDay, periodLabel, periodStats, previous, versus, weekPeriod } from "@/domain/analytics/periods";
import { Card } from "@/components/common/Card";
import { BarChart, RangeNav } from "@/components/charts/BarChart";
import { RefreshButton } from "@/components/common/RefreshButton";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useWorkflowStore } from "@/store/workflow";
import { useApplicationsStore } from "@/store/applications";
import { useAuthStore } from "@/store/auth";
import { useNow } from "@/lib/motion";
import { formatNumber } from "@/lib/format";

function ItemList({ items, icon: Icon, tone }: { items: DigestItem[]; icon: typeof AlertTriangle; tone: string }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((i) => (
        <li key={i.text} className="flex items-start gap-2 text-[13px] leading-snug">
          <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden />
          <span className="min-w-0 flex-1 text-ink-2">
            {i.href ? (
              <Link href={i.href} className="text-ink hover:underline">
                {i.text}
              </Link>
            ) : (
              i.text
            )}
            {i.origin === "ai" && <span className="ml-1 text-[11px] text-brand-600">· Suggested by AI</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Kpi({ label, value, before, href }: { label: string; value: number; before: number; href: string }) {
  const tone = value > before ? "text-success-600" : value < before ? "text-warning-600" : "text-ink-4";
  return (
    <Link href={href} className="wj-card block px-3 py-2.5 hover:bg-surface-2">
      <p className="truncate text-[11.5px] text-ink-3">{label}</p>
      <p className="mt-0.5 text-[22px] font-semibold leading-tight tabular-nums text-ink">{formatNumber(value)}</p>
      <p className={`truncate text-[10.5px] ${tone}`}>{versus(value, before)}</p>
    </Link>
  );
}

const H2 = "text-[14px] font-semibold text-ink";
// Ordinal, so one hue light → dark (strongest fit darkest).
const FIT_SHADE: Record<FitLabel, string> = { strong: "bg-brand-700", worth_considering: "bg-brand-500", stretch: "bg-brand-300", low_fit: "bg-brand-100" };

/**
 * This week: one 7-day period at a time — the last 7 days, or any week before (‹ ›) — counted from the candidate's
 * own runs and applications, each number beside the 7 days before it; jobs reviewed per day (tap a day for its
 * numbers); matches by fit; and, for the latest week, the same reading as the activity email (domain/digest/build.ts).
 */
export default function DashboardPage() {
  const now = useNow();
  const mode = useAuthStore((s) => s.mode);
  const dna = useCareerStore((s) => s.dna);
  const learnedSignals = useCareerStore((s) => s.learnedSignals);
  const answerMemory = useCareerStore((s) => s.answerMemory);
  const jobs = useJobsStore((s) => s.jobs);
  const matches = useJobsStore((s) => s.matches);
  const saved = useJobsStore((s) => s.saved);
  const rejected = useJobsStore((s) => s.rejected);
  const runsById = useWorkflowStore((s) => s.runs);
  const appsById = useApplicationsStore((s) => s.applications);
  const [offset, setOffset] = useState(0);

  const runs = useMemo(() => Object.values(runsById), [runsById]);
  const apps = useMemo(() => Object.values(appsById), [appsById]);
  const digest = useMemo(
    () => buildDigest({ now: new Date(now), since: new Date(now - 7 * DAY).toISOString(), dna, learnedSignals: learnedSignals ?? [], answerMemory: answerMemory ?? [], jobs, matches, saved, rejected, runs, applications: apps }),
    [now, dna, learnedSignals, answerMemory, jobs, matches, saved, rejected, runs, apps],
  );

  // AI suggestions for the latest 7 days (signed-in accounts; the server reads the same saved state).
  const [ai, setAi] = useState<DigestItem[]>([]);
  useEffect(() => {
    if (mode !== "user") return;
    let alive = true;
    fetch("/api/digest/preview", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { suggestions?: DigestItem[] } | null) => {
        if (alive && d?.suggestions?.length) setAi(d.suggestions);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mode]);

  // The period shown, the one before it, and how far back there's anything to show.
  const period = useMemo(() => weekPeriod(now, offset), [now, offset]);
  const stats = useMemo(() => periodStats(period, runs, apps), [period, runs, apps]);
  const before = useMemo(() => periodStats(previous(period), runs, apps), [period, runs, apps]);
  const days = useMemo(() => perDay(period, runs, apps), [period, runs, apps]);
  const earliest = useMemo(() => Math.min(now, ...runs.map((r) => Date.parse(r.createdAt)), ...apps.map((a) => Date.parse(a.createdAt))), [now, runs, apps]);
  const range = {
    label: offset === 0 ? "Last 7 days" : offset === 1 ? "A week before" : `${offset} weeks before`,
    onPrev: period.start > earliest ? () => setOffset((o) => o + 1) : undefined,
    onNext: offset > 0 ? () => setOffset((o) => o - 1) : undefined,
  };

  const fit = useMemo(() => {
    const c: Record<FitLabel, number> = { strong: 0, worth_considering: 0, stretch: 0, low_fit: 0 };
    for (const m of Object.values(matches)) if (!rejected[m.jobId]) c[m.fit]++;
    return c;
  }, [matches, rejected]);
  const fitTotal = Object.values(fit).reduce((a, b) => a + b, 0);

  const read = [
    { title: "Going well", items: digest.goingWell, icon: CheckCircle2, head: TrendingUp, tone: "text-success-600" },
    { title: "Needs improvement", items: digest.needsImprovement, icon: TrendingDown, head: TrendingDown, tone: "text-warning-600" },
    { title: "Suggestions", items: [...digest.suggestions, ...ai], icon: Sparkles, head: Sparkles, tone: "text-brand-600" },
  ].filter((r) => r.items.length);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1">
          <RefreshButton className="-ml-1.5" />
          <span className="text-[12.5px] font-medium tabular-nums text-ink-2">{periodLabel(period)}</span>
        </span>
        <RangeNav range={range} />
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi label="Applications sent" value={stats.applied} before={before.applied} href="/app/applications" />
        <Kpi label="Interviews" value={stats.interviews} before={before.interviews} href="/app/calendar" />
        <Kpi label="Jobs reviewed" value={stats.reviewed} before={before.reviewed} href="/app/runs" />
        <Kpi label="Strong matches found" value={stats.strong} before={before.strong} href="/app/jobs?fit=strong" />
      </div>

      {offset === 0 && digest.headsUp.length > 0 && (
        <Card padding="sm">
          <h2 className={`mb-2 flex items-center gap-2 ${H2}`}>
            <AlertTriangle className="size-4 text-warning-600" aria-hidden /> Heads up
          </h2>
          <ItemList items={digest.headsUp} icon={AlertTriangle} tone="text-warning-600" />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card padding="sm" className="lg:col-span-2">
          <h2 className={H2}>Jobs reviewed per day</h2>
          <p className="mb-2 text-[11.5px] text-ink-3">
            {formatNumber(stats.reviewed)} jobs in {stats.searches} {stats.searches === 1 ? "search" : "searches"} · {pct(stats.strong, stats.reviewed)} strong
          </p>
          <BarChart
            yLabel="Jobs reviewed"
            xLabel="Day"
            unit="jobs reviewed"
            points={days.map((d) => {
              const date = new Date(d.at);
              return {
                key: String(d.at),
                tick: date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" }),
                label: date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
                value: d.reviewed,
                details: [
                  { label: "Strong", value: formatNumber(d.strong) },
                  { label: "Searches", value: formatNumber(d.searches) },
                  { label: "Applied", value: formatNumber(d.applied) },
                ],
                href: d.searches ? "/app/runs" : undefined,
              };
            })}
          />
        </Card>

        <Card padding="sm">
          <h2 className={H2}>Your matches by fit</h2>
          <p className="mb-2 text-[11.5px] text-ink-3">{formatNumber(fitTotal)} jobs in your list now</p>
          {fitTotal ? (
            <>
              <div className="flex h-3 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label="Matches by fit">
                {(Object.keys(fit) as FitLabel[])
                  .filter((k) => fit[k])
                  .map((k) => (
                    <div key={k} className={FIT_SHADE[k]} style={{ width: `${(fit[k] / fitTotal) * 100}%` }} title={`${FIT_META[k].label}: ${fit[k]}`} />
                  ))}
              </div>
              <ul className="mt-2 flex flex-col text-[13px]">
                {(Object.keys(fit) as FitLabel[]).map((k) => (
                  <li key={k}>
                    <Link href={`/app/jobs?fit=${k}&exact=1`} className="-mx-1 flex items-center gap-2 rounded-[8px] px-1 py-1 hover:bg-surface-2">
                      <span className={`size-2.5 rounded-sm ${FIT_SHADE[k]}`} aria-hidden />
                      <span className="flex-1 text-ink-2">{FIT_META[k].label}</span>
                      <span className="w-10 text-right text-[12px] tabular-nums text-ink-3">{pct(fit[k], fitTotal)}</span>
                      <span className="w-10 text-right tabular-nums text-ink">{formatNumber(fit[k])}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[13px] text-ink-3">Run a search to see how jobs fit.</p>
          )}
        </Card>
      </div>

      {/* The latest week's read (the activity email's); only the parts with something in them. */}
      {offset === 0 && read.length > 0 && (
        <Card padding="sm" className="flex flex-col gap-3">
          {read.map((r) => (
            <section key={r.title}>
              <h2 className={`mb-1.5 flex items-center gap-2 ${H2}`}>
                <r.head className={`size-4 ${r.tone}`} aria-hidden /> {r.title}
              </h2>
              <ItemList items={r.items} icon={r.icon} tone={r.tone} />
            </section>
          ))}
        </Card>
      )}
    </div>
  );
}
