"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { FUNNEL_STAGES } from "@/domain/applications/types";
import { pct } from "@/domain/analytics/periods";
import { BarChart } from "@/components/charts/BarChart";
import { RefreshButton } from "@/components/common/RefreshButton";
import { practiceTrend, QUIZ_PASS } from "@/domain/applications/practice";

/** Every count opens the list it counts. */
const ROW = "-mx-2 items-center rounded-[10px] px-2 py-1 hover:bg-surface-2";
const H2 = "text-[14px] font-semibold text-ink";
/** Runs per page of the chart. */
const RUNS_SHOWN = 8;
import { useCareerStore } from "@/store/career";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { useWorkflowStore } from "@/store/workflow";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Card } from "@/components/common/Card";
import { CareerInsightCard, Sparkbars } from "@/components/career/CareerInsightCard";
import { formatDate, formatNumber } from "@/lib/format";

export default function InsightsPage() {
  const insights = useCareerStore((s) => s.insights);
  const applications = useApplicationsStore((s) => s.applications);
  const matches = useJobsStore((s) => s.matches);
  const jobs = useJobsStore((s) => s.jobs);
  const order = useJobsStore((s) => s.order);
  const runs = useWorkflowStore((s) => s.runs);

  const funnel = useMemo(() => {
    const apps = Object.values(applications);
    return FUNNEL_STAGES.filter((f) => f.insights).map((f) => ({ ...f, n: apps.filter(f.reached).length }));
  }, [applications]);

  const fitBreakdown = useMemo(() => {
    const c = { strong: 0, worth_considering: 0, stretch: 0, low_fit: 0 };
    // The jobs in the catalog — the same set Find lists.
    for (const id of order) if (matches[id]) c[matches[id].fit]++;
    return c;
  }, [matches, order]);

  const bySkill = useMemo(() => {
    const count = new Map<string, number>();
    for (const id of order) {
      const m = matches[id];
      if (m?.fit !== "strong") continue;
      for (const s of jobs[m.jobId]?.skills ?? []) count.set(s, (count.get(s) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [matches, jobs, order]);

  const completed = useMemo(
    () =>
      Object.values(runs)
        .filter((r) => r.status === "COMPLETED" || r.status === "COMPLETED_WITH_WARNINGS")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [runs],
  );
  // The chart's window over completed searches: the latest 8, or 8 earlier at a time.
  const [runPage, setRunPage] = useState(0);
  const runEnd = completed.length - runPage * RUNS_SHOWN;
  const shownRuns = completed.slice(Math.max(0, runEnd - RUNS_SHOWN), runEnd);
  const runDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  // Wonder's read of the latest completed search only: one left from an older search no longer describes your list.
  const latest = completed.at(-1);
  const current = latest ? insights.filter((i) => i.id === `ins_${latest.id}`) : [];
  const max = Math.max(1, ...funnel.map((f) => f.n));
  const fitTotal = Object.values(fitBreakdown).reduce((n, v) => n + v, 0);
  const strongTotal = fitBreakdown.strong;
  // Interview practice: the test scores and mock interview reviews the candidate kept.
  const practice = useMemo(() => practiceTrend(Object.values(applications)), [applications]);

  return (
    <div>
      <PageHeader title="Insights" description="What's working, from your own activity." actions={<RefreshButton />} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card padding="sm" className="lg:col-span-2">
          <h2 className={H2}>Application funnel</h2>
          <p className="mb-2 text-[11.5px] text-ink-3">Every application that reached each step · % of the step before</p>
          <ul className="space-y-1">
            {funnel.map((f, i) => (
              <li key={f.key}>
                <Link href={`/app/applications?stage=${f.key}`} className={ROW + " grid grid-cols-[84px_1fr_64px] gap-3"}>
                  <span className="text-ink-2">{f.label}</span>
                  <div className="h-3 rounded-full bg-bg-soft" aria-hidden>
                    <div className="h-3 rounded-full bg-brand-500" style={{ width: `${(f.n / max) * 100}%` }} />
                  </div>
                  <span className="text-right font-semibold tabular-nums text-ink">
                    {f.n}
                    {i > 0 && <span className="ml-1 text-[11px] font-normal text-ink-3">{pct(f.n, funnel[i - 1].n)}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card padding="sm">
          <h2 className={H2}>Strong matches per search</h2>
          <p className="mb-2 text-[11.5px] text-ink-3">{completed.length} completed searches</p>
          {shownRuns.length ? (
            <BarChart
              yLabel="Strong matches"
              xLabel="Search"
              unit="strong matches"
              range={{
                label: `${runDate(shownRuns[0].createdAt)} – ${runDate(shownRuns.at(-1)!.createdAt)}`,
                onPrev: runEnd > RUNS_SHOWN ? () => setRunPage((p) => p + 1) : undefined,
                onNext: runPage > 0 ? () => setRunPage((p) => p - 1) : undefined,
              }}
              points={shownRuns.map((r) => ({
                key: r.id,
                tick: runDate(r.createdAt),
                label: new Date(r.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
                value: r.summary.strongMatches,
                details: [
                  { label: "Jobs reviewed", value: formatNumber(r.summary.jobsRetained) },
                  { label: "Strong", value: pct(r.summary.strongMatches, r.summary.jobsRetained) },
                  { label: r.trigger === "schedule" ? "Scheduled" : "Manual", value: "" },
                ],
                href: `/app/runs/${r.id}`,
              }))}
            />
          ) : (
            <p className="text-sm text-ink-3">Your first search starts the trend.</p>
          )}
        </Card>
        <Card padding="sm" className="lg:col-span-3">
          <h2 className={`mb-2 ${H2}`}>Interview practice</h2>
          {practice.tests.length || practice.mocks.length ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <div>
                <p className="text-[13px] font-medium text-ink-2">Practice tests</p>
                {practice.tests.length ? (
                  <>
                    <Sparkbars series={practice.tests} className="mt-2 h-16" />
                    <p className="mt-1.5 text-[12px] text-ink-3">
                      Latest {practice.tests[practice.tests.length - 1]}% · {practice.testsPassed} passed (≥{Math.round(QUIZ_PASS * 100)}%)
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-[12.5px] text-ink-3">No saved test scores yet.</p>
                )}
              </div>
              <div>
                <p className="text-[13px] font-medium text-ink-2">Mock interviews</p>
                {practice.mocks.length ? (
                  <>
                    <Sparkbars series={practice.mocks} className="mt-2 h-16" />
                    <p className="mt-1.5 text-[12px] text-ink-3">
                      Latest {practice.mocks[practice.mocks.length - 1]}/100
                      {practice.mockChange !== undefined && ` · ${practice.mockChange >= 0 ? "+" : ""}${practice.mockChange} since your first`}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-[12.5px] text-ink-3">No mock interviews yet.</p>
                )}
              </div>
              {practice.latest && (
                <Link href={`/app/applications/${practice.latest.applicationId}/interview/mock`} className="-m-2 rounded-[12px] p-2 hover:bg-surface-2">
                  <p className="text-[13px] font-medium text-ink-2">Work on next{practice.latest.company && ` · from ${practice.latest.company}`}</p>
                  <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-[12.5px] text-ink-2">
                    {practice.latest.improvements.slice(0, 3).map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </Link>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-3">Practise for an interview — Pipeline → Interview → Prepare — and your scores trend here.</p>
          )}
        </Card>
        <Card padding="sm">
          <h2 className={H2}>Fit across your catalog</h2>
          <p className="mb-2 text-[11.5px] text-ink-3">{formatNumber(fitTotal)} jobs in your list now</p>
          <ul className="space-y-0.5 text-[13px]">
            {(
              [
                ["strong", "Strong Opportunity", "bg-success-600"],
                ["worth_considering", "Worth Considering", "bg-brand-500"],
                ["stretch", "Stretch Opportunity", "bg-warning-600"],
                ["low_fit", "Low-Fit", "bg-ink-4"],
              ] as const
            ).map(([k, l, c]) => (
              <li key={k}>
                <Link href={`/app/jobs?fit=${k}&exact=1`} className={ROW + " flex gap-2"}>
                  <span className={`size-2.5 rounded-full ${c}`} aria-hidden />
                  <span className="flex-1 text-ink-2">{l}</span>
                  <span className="w-10 text-right text-[12px] tabular-nums text-ink-3">{pct(fitBreakdown[k], fitTotal)}</span>
                  <span className="w-10 text-right font-semibold tabular-nums text-ink">{formatNumber(fitBreakdown[k])}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card padding="sm">
          <h2 className={H2}>Skills that drive strong matches</h2>
          <p className="mb-2 text-[11.5px] text-ink-3">Skills the {formatNumber(strongTotal)} strong {strongTotal === 1 ? "match asks" : "matches ask"} for</p>
          {bySkill.length ? (
            <ul className="space-y-0.5 text-[13px]">
              {bySkill.map(([s, n]) => (
                <li key={s}>
                  <Link href={`/app/jobs?fit=strong&exact=1&q=${encodeURIComponent(s)}`} className={ROW + " flex justify-between"}>
                    <span className="text-ink-2">{s}</span>
                    <span>
                      <span className="mr-2 text-[12px] tabular-nums text-ink-3">{pct(n, strongTotal)} of strong</span>
                      <span className="font-semibold tabular-nums text-ink">{n}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No strong matches yet.</p>
          )}
        </Card>
        {latest && current.length > 0 && (
          <Card padding="sm">
            <h2 className={H2}>From Wonder</h2>
            <p className="mb-3 text-[12px] text-ink-3">AI-generated · your search of {formatDate(latest.createdAt)}</p>
            <div className="space-y-4">
              {current.map((i) => (
                <CareerInsightCard key={i.id} insight={i} />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
