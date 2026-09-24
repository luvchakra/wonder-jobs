"use client";
import Link from "next/link";
import { Activity, Database, Layers, ShieldCheck } from "lucide-react";
import type { CoverageView, OverviewView, QualityView, SourceView } from "@/server/jobslake/views";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { AccessBadge, BarList, HealthChip, LoadError, Loading, Meter, Note, OutcomeChip, PageTitle, Panel, ResponsiveTable, Stat, ms, num, pct, useAdmin } from "@/components/jobslake/ui";

export default function JobsLakeOverview() {
  const o = useAdmin<OverviewView>("overview");
  const q = useAdmin<{ quality: QualityView; coverage: CoverageView }>("quality?days=7");
  const s = useAdmin<{ sources: SourceView[] }>("sources");

  if (o.error) return <LoadError error={o.error} onRetry={o.reload} />;
  if (!o.data) return <Loading rows={4} />;
  const d = o.data;
  const live = (s.data?.sources ?? []).filter((x) => x.status === "active" || x.status === "degraded");
  const successRate = d.runs24h.total ? 1 - d.runs24h.failed / d.runs24h.total : null;

  return (
    <>
      <PageTitle
        title="JobsLake"
        subtitle="Platform job data — every figure below is counted from recorded runs and stored opportunities."
        actions={
          <Button size="sm" href="/platform/jobs-lake/add">
            Add source
          </Button>
        }
      />
      {!d.store.durable && (
        <div className="mb-4">
          <Note tone="warning">{d.store.message}</Note>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Database className="size-5" aria-hidden />} label="Active sources" value={num(d.sources.active)} hint={d.sources.needsSetup ? `${d.sources.needsSetup} need setup on this deployment` : `${d.sources.doNotUse} partnership-only`} />
        <Stat icon={<Layers className="size-5" aria-hidden />} label="Jobs fetched · 24 h" value={num(d.runs24h.retrieved)} hint={`${num(d.runs24h.valid)} passed validation`} />
        <Stat icon={<ShieldCheck className="size-5" aria-hidden />} label="Unique jobs · 7 days" value={num(d.pool.opportunities)} hint={d.pool.employerVerified == null ? "No jobs stored yet" : `${pct(d.pool.employerVerified, 0)} from employer sites`} />
        <Stat icon={<Activity className="size-5" aria-hidden />} label="Source success · 24 h" value={pct(successRate)} hint={d.runs24h.total ? `${num(d.runs24h.total)} source runs, ${num(d.runs24h.failed)} failed` : "No runs yet"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel
          title="Source health"
          action={
            <Link href="/platform/jobs-lake/health" className="text-[12px] font-medium text-brand-600 hover:underline">
              All health
            </Link>
          }
        >
          <ResponsiveTable
            rows={live}
            rowKey={(r) => r.id}
            empty="No active sources."
            columns={[
              {
                header: "Source",
                cell: (r) => (
                  <Link href={`/platform/jobs-lake/sources/${r.id}`} className="inline-flex items-center gap-2 font-medium text-ink hover:underline">
                    {r.name} <AccessBadge label={r.accessLabel} />
                  </Link>
                ),
              },
              { header: "Status", cell: (r) => (r.available ? <HealthChip state={r.health?.state} /> : <span className="text-warning-600">Needs setup</span>) },
              { header: "Success", cell: (r) => pct(r.health?.successRate), className: "tabular-nums" },
              { header: "Latency p50", cell: (r) => ms(r.health?.p50LatencyMs), className: "tabular-nums" },
              { header: "Last run", cell: (r) => (r.health?.lastRunAt ? relativeTime(r.health.lastRunAt) : "Never") },
              { header: "Retrieved (7 d)", cell: (r) => num(r.health?.retrieved ?? null), className: "tabular-nums text-right" },
            ]}
            card={(r) => (
              <div className="flex items-center justify-between gap-2">
                <Link href={`/platform/jobs-lake/sources/${r.id}`} className="min-w-0 font-medium text-ink">
                  {r.name} <AccessBadge label={r.accessLabel} />
                  <span className="mt-0.5 block text-[12px] font-normal text-ink-3">
                    {pct(r.health?.successRate)} success · {ms(r.health?.p50LatencyMs)} · {r.health?.lastRunAt ? relativeTime(r.health.lastRunAt) : "never run"}
                  </span>
                </Link>
                {r.available ? <HealthChip state={r.health?.state} /> : <span className="text-[12px] text-warning-600">Needs setup</span>}
              </div>
            )}
          />
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Unique jobs by source · last 7 days">{q.data ? <BarList rows={q.data.coverage.bySource} /> : <Loading rows={1} />}</Panel>
          <Panel title="Data quality · last 7 days">
            {q.data ? (
              q.data.quality.opportunities ? (
                <div className="flex flex-col gap-3">
                  <Meter label="Required fields" value={q.data.quality.requiredFields} />
                  <Meter label="Valid apply URLs" value={q.data.quality.validApplyUrls} />
                  <Meter judged={false} label="Posted in the last 7 days" value={q.data.quality.freshUnder7Days} />
                </div>
              ) : (
                <p className="py-4 text-center text-[13px] text-ink-4">No data yet — quality is measured on stored jobs.</p>
              )
            ) : (
              <Loading rows={1} />
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Coverage by country">{q.data ? <BarList rows={q.data.coverage.byCountry} max={8} /> : <Loading rows={1} />}</Panel>
        <Panel
          title={`Alerts${d.alerts.length ? ` (${d.alerts.length})` : ""}`}
          action={
            <Link href="/platform/jobs-lake/alerts" className="text-[12px] font-medium text-brand-600 hover:underline">
              All alerts
            </Link>
          }
        >
          {d.alerts.length ? (
            <ul className="flex flex-col gap-2">
              {d.alerts.slice(0, 5).map((a) => (
                <li key={a.id} className="rounded-[12px] border border-line p-2.5 text-[13px]">
                  <p className={a.severity === "critical" ? "font-medium text-danger-600" : "font-medium text-warning-600"}>{a.title}</p>
                  <p className="text-[12px] text-ink-3">{a.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-[13px] text-ink-4">No active alerts.</p>
          )}
        </Panel>
      </div>

      <Panel title="Recent runs · 24 h" className="mt-4">
        <ResponsiveTable
          rows={d.recentRuns}
          rowKey={(r) => r.id}
          empty="No runs in the last 24 hours."
          columns={[
            { header: "When", cell: (r) => relativeTime(r.startedAt) },
            { header: "Source", cell: (r) => r.sourceId },
            { header: "Trigger", cell: (r) => r.trigger },
            { header: "Outcome", cell: (r) => <OutcomeChip outcome={r.outcome} /> },
            { header: "Jobs", cell: (r) => num(r.retrieved), className: "tabular-nums text-right" },
            { header: "Duration", cell: (r) => ms(r.durationMs), className: "tabular-nums text-right" },
          ]}
          card={(r) => (
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <span>
                <span className="font-medium text-ink">{r.sourceId}</span>
                <span className="block text-[12px] text-ink-3">
                  {relativeTime(r.startedAt)} · {r.trigger} · {num(r.retrieved)} jobs · {ms(r.durationMs)}
                </span>
              </span>
              <OutcomeChip outcome={r.outcome} />
            </div>
          )}
        />
      </Panel>
    </>
  );
}
