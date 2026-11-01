"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { analyticsReport, weeksSinceFirst, type WeekBucket } from "@/domain/analytics/report";
import { JOB_SOURCES } from "@/domain/jobs/sources";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { useWorkflowStore } from "@/store/workflow";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/States";
import { Segmented } from "@/components/common/Input";
import { MODULES } from "@/modules/registry";
import { shellRoutes } from "@/wonderworks/manifest";
import { ModuleActivity, type ActivityModule } from "@/wonderworks/you/ModuleActivity";

const SOURCE_NAME = new Map(JOB_SOURCES.map((s) => [s.id, s.name]));
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const weekLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const RANGES = [
  { value: "4", label: "4 weeks" },
  { value: "8", label: "8 weeks" },
  { value: "12", label: "3 months" },
  { value: "26", label: "6 months" },
  { value: "all", label: "All time" },
];
/** Every live module but Jobs, for the "Across WonderWorks" card (Jobs has the rest of the page). */
const OTHER_MODULES: ActivityModule[] = MODULES.filter((m) => m.id !== "jobs" && m.status === "live").map((m) => ({ id: m.id as ActivityModule["id"], label: m.label, pipelineLabel: m.pipeline.label, stages: m.pipeline.stages, href: shellRoutes(m.id).pipeline }));
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

/** Whole-number axis ticks from 0 up to at least `max`: 2–5 of them, evenly spaced. */
function ticksFor(max: number): number[] {
  if (max <= 4) return Array.from({ length: Math.max(1, max) + 1 }, (_, i) => i);
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((st) => max / st <= 4) ?? Math.ceil(max / 4);
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

/** One measure over the range: bars on a shared baseline, a y-axis with whole-number ticks and gridlines,
 *  the week under each bar (every few weeks when there are many), and each bar's count on top (or on hover). */
function WeeklyBars({ title, weeks, pick }: { title: string; weeks: WeekBucket[]; pick: (w: WeekBucket) => number }) {
  const values = weeks.map(pick);
  const total = values.reduce((s, v) => s + v, 0);
  const ticks = ticksFor(Math.max(...values, 0));
  const top = ticks.at(-1) || 1;
  const many = weeks.length > 12;
  const every = Math.ceil(weeks.length / 4);
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        <span className="text-[12px] tabular-nums text-ink-3">
          {total} in {weeks.length} week{weeks.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-4 flex gap-1.5">
        {/* y-axis */}
        <div className="relative h-28 w-6 shrink-0 text-right text-[10.5px] tabular-nums text-ink-4" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${(t / top) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-28" role="img" aria-label={`${title}: ${weeks.map((w, i) => `week of ${weekLabel(w.week)} ${values[i]}`).join(", ")}`}>
            {ticks.map((t) => (
              <div key={t} className={`absolute inset-x-0 border-t ${t ? "border-dashed border-line" : "border-line-strong"}`} style={{ bottom: `${(t / top) * 100}%` }} aria-hidden />
            ))}
            <div className="absolute inset-0 flex items-end gap-[3px]">
              {weeks.map((w, i) => (
                <div key={w.week} className="group relative flex h-full flex-1 items-end" title={`Week of ${weekLabel(w.week)}: ${values[i]}`}>
                  {values[i] > 0 && (
                    <div className="w-full rounded-t-[4px] bg-brand-500 transition-colors group-hover:bg-brand-700" style={{ height: `${(values[i] / top) * 100}%` }}>
                      <span className={`absolute inset-x-0 pb-0.5 text-center font-medium tabular-nums text-ink-2 ${many ? "text-[9px]" : "text-[10.5px]"}`} style={{ bottom: `${(values[i] / top) * 100}%` }}>
                        {values[i]}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          {/* x-axis: the Monday each week starts, at most four of them, counted back from this week */}
          <div className="relative mt-1 h-3.5 text-[10px] tabular-nums leading-none text-ink-4" aria-hidden>
            {weeks.map((w, i) =>
              (weeks.length - 1 - i) % every === 0 ? (
                <span
                  key={w.week}
                  className={`absolute top-0 whitespace-nowrap ${i === weeks.length - 1 ? "right-0" : i === 0 ? "left-0" : "-translate-x-1/2"}`}
                  style={i === weeks.length - 1 || i === 0 ? undefined : { left: `${((i + 0.5) / weeks.length) * 100}%` }}
                >
                  {weekLabel(w.week)}
                </span>
              ) : null,
            )}
          </div>
        </div>
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
  const [range, setRange] = useState("8");
  const weeks = useMemo(() => (range === "all" ? Math.min(104, weeksSinceFirst({ applications: Object.values(applications), runs: Object.values(runs) })) : Number(range)), [range, applications, runs]);
  const r = useMemo(
    () => analyticsReport({ applications: Object.values(applications), jobs, matches, saved, runs: Object.values(runs), weeks, sourceName: (id) => SOURCE_NAME.get(id) ?? id }),
    [applications, jobs, matches, saved, runs, weeks],
  );

  const anything = Object.keys(applications).length || Object.keys(runs).length;
  // The range for every module's own numbers: the same weeks, counted back from now.
  const [now] = useState(() => Date.now());
  const since = range === "all" ? null : now - weeks * 7 * 86_400_000;
  const across = OTHER_MODULES.length > 0 && (
    <Card className="mt-6">
      <h2 className="mb-1 text-[14px] font-semibold text-ink">Across WonderWorks</h2>
      <p className="mb-2 text-[12px] text-ink-3">Each module&apos;s saves and its Pipeline, in this range. Tap one to open it.</p>
      <ModuleActivity modules={OTHER_MODULES} since={since} />
    </Card>
  );
  if (!anything) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Analytics" description="Your activity across WonderWorks, in numbers." />
        <EmptyState title="No job applications to count yet" body="Search for jobs and start an application — your Jobs numbers appear here as you go." action={{ label: "Find jobs", href: "/app/jobs" }} />
        {across}
      </div>
    );
  }

  const stageHref = ["all", "prepared", "submitted", "interview", "offer"];
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Analytics" description="Your activity across WonderWorks, in numbers — from your own applications, saves and searches." />
      <div className="mb-4 overflow-x-auto">
        <Segmented label="Date range" size="sm" value={range} onChange={setRange} options={RANGES} className="[&>button]:shrink-0 [&>button]:whitespace-nowrap max-sm:[&>button]:px-2.5" />
      </div>
      <h2 className="mb-2 text-[14px] font-semibold text-ink">Jobs</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Applications" value={String(r.totals.applications)} hint={`${r.totals.saved} jobs saved`} />
        <Stat label="Submitted" value={String(r.totals.submitted)} />
        <Stat label="Heard back" value={pct(r.responseRate)} hint={r.responseRate === null ? "Once you've submitted" : "of submitted"} />
        <Stat label="Interviews" value={String(r.totals.interviews)} hint={r.totals.offers ? `${r.totals.offers} offer${r.totals.offers === 1 ? "" : "s"}` : undefined} />
        <Stat className="col-span-2 md:col-span-1" label="Days to a reply" value={r.medianDaysToResponse === null ? "—" : String(r.medianDaysToResponse)} hint={r.medianDaysToResponse === null ? "No replies yet" : "median"} />
      </div>

      {across}

      <h2 className="mb-2 mt-6 text-[14px] font-semibold text-ink">Jobs, week by week</h2>
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
