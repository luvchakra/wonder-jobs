"use client";
import { useMemo } from "react";
import Link from "next/link";
import { FUNNEL_STAGES } from "@/domain/applications/types";

/** Every count opens the list it counts. */
const ROW = "-mx-2 items-center rounded-[10px] px-2 py-1.5 hover:bg-surface-2";
import { useCareerStore } from "@/store/career";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { useWorkflowStore } from "@/store/workflow";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { CareerInsightCard, Sparkbars } from "@/components/career/CareerInsightCard";
import { formatNumber } from "@/lib/format";
import { EmptyState } from "@/components/common/States";

export default function InsightsPage() {
  const insights = useCareerStore((s) => s.insights);
  const applications = useApplicationsStore((s) => s.applications);
  const matches = useJobsStore((s) => s.matches);
  const jobs = useJobsStore((s) => s.jobs);
  const order = useJobsStore((s) => s.order);
  const runs = useWorkflowStore((s) => s.runs);

  const funnel = useMemo(() => {
    const apps = Object.values(applications);
    return FUNNEL_STAGES.map((f) => ({ ...f, n: f.statuses ? apps.filter((a) => f.statuses!.includes(a.status)).length : apps.length }));
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

  const runSeries = useMemo(
    () =>
      Object.values(runs)
        .filter((r) => r.status === "COMPLETED" || r.status === "COMPLETED_WITH_WARNINGS")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(-8)
        .map((r) => r.summary.strongMatches),
    [runs],
  );
  const max = Math.max(1, ...funnel.map((f) => f.n));

  return (
    <div>
      <PageHeader title="Insights" description="What's working, from your own activity." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-[15px] font-semibold text-ink">Application funnel</h2>
          <ul className="space-y-1">
            {funnel.map((f) => (
              <li key={f.key}>
                <Link href={`/app/applications?stage=${f.key}`} className={ROW + " grid grid-cols-[90px_1fr_40px] gap-3"}>
                  <span className="text-ink-2">{f.label}</span>
                  <div className="h-3 rounded-full bg-bg-soft" aria-hidden>
                    <div className="h-3 rounded-full bg-brand-500" style={{ width: `${(f.n / max) * 100}%` }} />
                  </div>
                  <span className="text-right font-semibold text-ink">{f.n}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 text-[15px] font-semibold text-ink">Strong matches per run</h2>
          {runSeries.length ? <Sparkbars series={runSeries} className="h-20" /> : <p className="text-sm text-ink-3">Your first search starts the trend.</p>}
          <p className="mt-2 text-[12px] text-ink-3">Last {runSeries.length} completed runs</p>
        </Card>
        <Card>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Fit across your catalog</h2>
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
                  <span className="font-semibold text-ink">{formatNumber(fitBreakdown[k])}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Skills that drive strong matches</h2>
          {bySkill.length ? (
            <ul className="space-y-0.5 text-[13px]">
              {bySkill.map(([s, n]) => (
                <li key={s}>
                  <Link href={`/app/jobs?fit=strong&exact=1&q=${encodeURIComponent(s)}`} className={ROW + " flex justify-between"}>
                    <span className="text-ink-2">{s}</span>
                    <span className="font-semibold text-ink">{n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No strong matches yet.</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">From Wonder</h2>
          {insights.length ? (
            <div className="space-y-4">
              {insights.map((i) => (
                <CareerInsightCard key={i.id} insight={i} />
              ))}
            </div>
          ) : (
            <EmptyState title="No insights yet" body="Wonder writes an insight at the end of every run." />
          )}
        </Card>
      </div>
    </div>
  );
}
