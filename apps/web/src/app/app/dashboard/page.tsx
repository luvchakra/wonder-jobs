"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ListTodo, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { buildDigest, type DigestItem } from "@/domain/digest/build";
import { APPLICATION_STATUS_META, type ApplicationStatus } from "@/domain/applications/types";
import { FIT_META, type FitLabel } from "@/domain/jobs/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useWorkflowStore } from "@/store/workflow";
import { useApplicationsStore } from "@/store/applications";
import { useAuthStore } from "@/store/auth";
import { useNow } from "@/lib/motion";
import { formatNumber } from "@/lib/format";

const DAY = 86_400_000;

function ItemList({ items, icon: Icon, tone, empty }: { items: DigestItem[]; icon: typeof AlertTriangle; tone: string; empty: string }) {
  if (!items.length) return <p className="text-[13px] text-ink-3">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
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

function Kpi({ label, value, hint, href }: { label: string; value: number; hint: string; href: string }) {
  return (
    <Link href={href} className="wj-card block p-4 hover:bg-surface-2">
      <p className="text-[12px] text-ink-3">{label}</p>
      <p className="mt-1 text-[28px] font-semibold leading-none tabular-nums text-ink">{formatNumber(value)}</p>
      <p className="mt-1.5 text-[11px] text-ink-4">{hint}</p>
    </Link>
  );
}

/**
 * Dashboard: the candidate's last 7 days at a glance — the same reading as the activity email
 * (domain/digest/build.ts), computed here from their own stores, plus three charts of their own data.
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

  const runs = useMemo(() => Object.values(runsById), [runsById]);
  const apps = useMemo(() => Object.values(appsById), [appsById]);
  const digest = useMemo(
    () => buildDigest({ now: new Date(now), since: new Date(now - 7 * DAY).toISOString(), dna, learnedSignals: learnedSignals ?? [], answerMemory: answerMemory ?? [], jobs, matches, saved, rejected, runs, applications: apps }),
    [now, dna, learnedSignals, answerMemory, jobs, matches, saved, rejected, runs, apps],
  );
  const fact = (key: string) => Number(digest.facts.find((f) => f.key === key)?.value ?? 0);

  // AI suggestions for the same 7 days (signed-in accounts; the server reads the same saved state).
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

  // Jobs reviewed per day, last 14 days, from completed searches.
  const daily = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 14 }, (_, i) => ({ at: start.getTime() - (13 - i) * DAY, jobs: 0, strong: 0 }));
    for (const r of runs) {
      if (!r.completedAt || !(r.status === "COMPLETED" || r.status === "COMPLETED_WITH_WARNINGS")) continue;
      const d = days.find((x) => Date.parse(r.completedAt!) >= x.at && Date.parse(r.completedAt!) < x.at + DAY);
      if (d) {
        d.jobs += r.summary?.jobsRetained ?? 0;
        d.strong += r.summary?.strongMatches ?? 0;
      }
    }
    return days;
  }, [runs, now]);
  const dailyMax = Math.max(1, ...daily.map((d) => d.jobs));

  const fit = useMemo(() => {
    const c: Record<FitLabel, number> = { strong: 0, worth_considering: 0, stretch: 0, low_fit: 0 };
    for (const m of Object.values(matches)) if (!rejected[m.jobId]) c[m.fit]++;
    return c;
  }, [matches, rejected]);
  const fitTotal = Object.values(fit).reduce((a, b) => a + b, 0);
  // Ordinal, so one hue light → dark (strongest fit darkest).
  const FIT_SHADE: Record<FitLabel, string> = { strong: "bg-brand-700", worth_considering: "bg-brand-500", stretch: "bg-brand-300", low_fit: "bg-brand-100" };

  const STAGES: ApplicationStatus[] = ["saved", "preparing", "ready_for_review", "submitted", "under_review", "interview", "offer"];
  const pipeline = STAGES.map((s) => ({ s, n: apps.filter((a) => a.status === s).length }));
  const pipeMax = Math.max(1, ...pipeline.map((p) => p.n));

  const suggestions = [...digest.suggestions, ...ai];
  const dayLabel = (t: number) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  return (
    <div>
      <PageHeader title="Dashboard" description="Your last 7 days, from your own account." actions={<Button href={digest.cta.href} iconRight={<ArrowRight className="size-4" aria-hidden />}>{digest.cta.label}</Button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Strong matches waiting" value={fact("waiting.strongMatches")} hint="Not yet saved, applied to or turned down" href="/app/jobs?fit=strong" />
        <Kpi label="Applications sent" value={fact("activity.applied")} hint="Last 7 days" href="/app/applications" />
        <Kpi label="Interviews ahead" value={fact("waiting.interviewsThisWeek")} hint="Next 7 days" href="/app/calendar" />
        <Kpi label="Jobs reviewed" value={fact("activity.jobsReviewed")} hint={`${formatNumber(fact("activity.strongFound"))} strong · last 7 days`} href="/app/runs" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <AlertTriangle className="size-4 text-warning-600" aria-hidden /> Heads up
          </h2>
          <ItemList items={digest.headsUp} icon={AlertTriangle} tone="text-warning-600" empty="Nothing urgent right now." />
        </Card>
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <ListTodo className="size-4 text-brand-600" aria-hidden /> Actions required
          </h2>
          <ItemList items={digest.dependencies} icon={ListTodo} tone="text-brand-600" empty="Nothing is waiting on you." />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-[15px] font-semibold text-ink">Jobs reviewed per day</h2>
          <p className="mb-3 text-[12px] text-ink-3">Last 14 days, from your completed searches</p>
          <div className="flex h-36 items-end gap-[2px] border-b border-line" role="img" aria-label={`Jobs reviewed per day over the last 14 days; most on one day: ${dailyMax}`}>
            {daily.map((d) => (
              <div key={d.at} className="group relative flex h-full flex-1 items-end" title={`${dayLabel(d.at)}: ${formatNumber(d.jobs)} jobs, ${d.strong} strong`}>
                <div className="w-full rounded-t-[4px] bg-brand-500 group-hover:bg-brand-700" style={{ height: d.jobs ? `${Math.max(4, (d.jobs / dailyMax) * 100)}%` : "0" }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-ink-4">
            <span>{dayLabel(daily[0].at)}</span>
            <span>Today</span>
          </div>
          <table className="sr-only">
            <tbody>
              {daily.map((d) => (
                <tr key={d.at}>
                  <td>{dayLabel(d.at)}</td>
                  <td>{d.jobs} jobs</td>
                  <td>{d.strong} strong</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="text-[15px] font-semibold text-ink">Your matches by fit</h2>
          <p className="mb-3 text-[12px] text-ink-3">{formatNumber(fitTotal)} jobs in your list</p>
          {fitTotal ? (
            <>
              <div className="flex h-4 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label="Matches by fit">
                {(Object.keys(fit) as FitLabel[])
                  .filter((k) => fit[k])
                  .map((k) => (
                    <div key={k} className={FIT_SHADE[k]} style={{ width: `${(fit[k] / fitTotal) * 100}%` }} title={`${FIT_META[k].label}: ${fit[k]}`} />
                  ))}
              </div>
              <ul className="mt-3 flex flex-col gap-1.5 text-[13px]">
                {(Object.keys(fit) as FitLabel[]).map((k) => (
                  <li key={k} className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-sm ${FIT_SHADE[k]}`} aria-hidden />
                    <span className="flex-1 text-ink-2">{FIT_META[k].label}</span>
                    <span className="tabular-nums text-ink">{formatNumber(fit[k])}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[13px] text-ink-3">Run a search to see how jobs fit.</p>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Application pipeline</h2>
          {apps.length ? (
            <ul className="flex flex-col gap-2">
              {pipeline.map((p) => (
                <li key={p.s} className="grid grid-cols-[120px_1fr_32px] items-center gap-3 text-[13px]" title={`${APPLICATION_STATUS_META[p.s].label}: ${p.n}`}>
                  <span className="truncate text-ink-2">{APPLICATION_STATUS_META[p.s].label}</span>
                  <span className="h-2.5 rounded-full bg-bg-soft">
                    <span className="block h-2.5 rounded-full bg-brand-500" style={{ width: p.n ? `${Math.max(3, (p.n / pipeMax) * 100)}%` : "0" }} />
                  </span>
                  <span className="text-right tabular-nums text-ink">{p.n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-3">No applications yet — start one from a job you like.</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <TrendingUp className="size-4 text-success-600" aria-hidden /> Going well
          </h2>
          <ItemList items={digest.goingWell} icon={CheckCircle2} tone="text-success-600" empty="Nothing to report this week yet." />
        </Card>
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <TrendingDown className="size-4 text-warning-600" aria-hidden /> Needs improvement
          </h2>
          <ItemList items={digest.needsImprovement} icon={TrendingDown} tone="text-warning-600" empty="Nothing stands out." />
        </Card>
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Sparkles className="size-4 text-brand-600" aria-hidden /> Suggestions
          </h2>
          <ItemList items={suggestions} icon={Sparkles} tone="text-brand-600" empty="No suggestions this week." />
        </Card>
      </div>
    </div>
  );
}
