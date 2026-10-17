"use client";
import { useMemo } from "react";
import Link from "next/link";
import { analyticsReport, type WeekBucket } from "@/domain/analytics/report";
import { JOB_SOURCES } from "@/domain/jobs/sources";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { useWorkflowStore } from "@/store/workflow";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/States";

const SOURCE_NAME = new Map(JOB_SOURCES.map((s) => [s.id, s.name]));
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const weekLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const FIT_LABEL = { strong: "Strong", worth_considering: "Worth considering", stretch: "Stretch", low_fit: "Low fit", unknown: "Not scored" } as const;

/** A headline number with what it counts. */
function Stat({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className={`rounded-[14px] border border-line bg-surface px-4 py-3 ${className ?? ""}`}>
      <p className="text-[12px] text-ink-3">{label}</p>
      <p className="mt-0.5 text-[24px] font-semibold tabular-nums leading-tight text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[11.5px] text-ink-4">{hint}</p>}
    </div>
  );
}

/** One measure over the last weeks: thin bars on a shared baseline, each with its week and count on hover. */
function WeeklyBars({ title, weeks, pick }: { title: string; weeks: WeekBucket[]; pick: (w: WeekBucket) => number }) {
  const values = weeks.map(pick);
  const max = Math.max(1, ...values);
  const total = values.reduce((s, v) => s + v, 0);
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        <span className="text-[12px] tabular-nums text-ink-3">{total} in {weeks.length} weeks</span>
      </div>
      <div className="mt-3 flex h-24 items-end gap-1.5" role="img" aria-label={`${title}: ${weeks.map((w, i) => `week of ${weekLabel(w.week)} ${values[i]}`).join(", ")}`}>
        {weeks.map((w, i) => (
          <div key={w.week} className="group relative flex h-full flex-1 items-end" title={`Week of ${weekLabel(w.week)}: ${values[i]}`}>
            <div className="w-full rounded-t-[4px] bg-brand-500 transition-colors group-hover:bg-brand-700" style={{ height: values[i] ? `${Math.max(6, (values[i] / max) * 100)}%` : "2px", opacity: values[i] ? 1 : 0.25 }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-4">
        <span>{weekLabel(weeks[0].week)}</span>
        <span>This week</span>
      </div>
    </Card>
  );
}

/** Horizontal bars for a short list of counts, each labelled and numbered. */
function BarRows({ rows, empty }: { rows: { label: string; n: number; note?: string; href?: string }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.some((r) => r.n)) return <p className="text-[13px] text-ink-3">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="text-ink-2">{r.label}</span>
              <span className="tabular-nums text-ink">
                {r.n}
                {r.note && <span className="ml-1.5 text-[11.5px] text-ink-3">{r.note}</span>}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-surface-2">
              <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(r.n / max) * 100}%` }} />
            </div>
          </>
        );
        return <li key={r.label}>{r.href ? <Link href={r.href} className="-mx-2 block rounded-[10px] px-2 py-1 hover:bg-surface-2">{body}</Link> : body}</li>;
      })}
    </ul>
  );
}

export default function AnalyticsPage() {
  const applications = useApplicationsStore((s) => s.applications);
  const jobs = useJobsStore((s) => s.jobs);
  const matches = useJobsStore((s) => s.matches);
  const saved = useJobsStore((s) => s.saved);
  const runs = useWorkflowStore((s) => s.runs);
  const r = useMemo(
    () => analyticsReport({ applications: Object.values(applications), jobs, matches, saved, runs: Object.values(runs), sourceName: (id) => SOURCE_NAME.get(id) ?? id }),
    [applications, jobs, matches, saved, runs],
  );

  if (!r.totals.applications && !r.totals.searches) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Analytics" description="Your search, in numbers." />
        <EmptyState title="Nothing to count yet" body="Search for jobs and start an application — your numbers appear here as you go." action={{ label: "Find jobs", href: "/app/jobs" }} />
      </div>
    );
  }

  const stageHref = ["all", "prepared", "submitted", "interview", "offer"];
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Analytics" description="Your search, in numbers — from your own applications and searches." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Applications" value={String(r.totals.applications)} hint={`${r.totals.saved} jobs saved`} />
        <Stat label="Submitted" value={String(r.totals.submitted)} />
        <Stat label="Heard back" value={pct(r.responseRate)} hint={r.responseRate === null ? "Once you've submitted" : "of submitted"} />
        <Stat label="Interviews" value={String(r.totals.interviews)} hint={r.totals.offers ? `${r.totals.offers} offer${r.totals.offers === 1 ? "" : "s"}` : undefined} />
        <Stat className="col-span-2 md:col-span-1" label="Days to a reply" value={r.medianDaysToResponse === null ? "—" : String(r.medianDaysToResponse)} hint={r.medianDaysToResponse === null ? "No replies yet" : "median"} />
      </div>

      <h2 className="mb-2 mt-6 text-[14px] font-semibold text-ink">Last 8 weeks</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <WeeklyBars title="Applications started" weeks={r.weeks} pick={(w) => w.started} />
        <WeeklyBars title="Applications submitted" weeks={r.weeks} pick={(w) => w.submitted} />
        <WeeklyBars title="Searches run" weeks={r.weeks} pick={(w) => w.searches} />
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-[14px] font-semibold text-ink">From start to offer</h2>
          <BarRows
            rows={r.funnel.map((f, i) => ({ label: f.label, n: f.n, note: f.ofPrevious === null ? undefined : `${pct(f.ofPrevious)} of ${r.funnel[i - 1].label.toLowerCase()}`, href: `/app/applications?stage=${stageHref[i]}` }))}
            empty="No applications yet."
          />
        </Card>
        <Card>
          <h2 className="mb-1 text-[14px] font-semibold text-ink">How well what you applied to fits</h2>
          <p className="mb-3 text-[12px] text-ink-3">Submitted applications, by their match to your Career Profile.</p>
          <BarRows rows={(Object.keys(FIT_LABEL) as (keyof typeof FIT_LABEL)[]).filter((k) => k !== "unknown" || r.appliedFit.unknown).map((k) => ({ label: FIT_LABEL[k], n: r.appliedFit[k] }))} empty="Nothing submitted yet." />
        </Card>
        <Card>
          <h2 className="mb-1 text-[14px] font-semibold text-ink">Where your applications came from</h2>
          <p className="mb-3 text-[12px] text-ink-3">The sources that listed the jobs you submitted to.</p>
          <BarRows rows={r.sources.slice(0, 6).map((s) => ({ label: s.name, n: s.n }))} empty="Nothing submitted yet." />
        </Card>
        <Card>
          <h2 className="mb-1 text-[14px] font-semibold text-ink">Searching</h2>
          <p className="mb-3 text-[12px] text-ink-3">Every completed search, by you or on a schedule.</p>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Searches run" value={String(r.totals.searches)} />
            <Stat label="Jobs found" value={r.totals.jobsFound.toLocaleString("en-IN")} hint="across all searches" />
          </div>
          <Link href="/app/runs" className="mt-3 inline-block text-[13px] font-medium text-brand-600 hover:underline">
            Search history
          </Link>
        </Card>
      </div>
    </div>
  );
}
