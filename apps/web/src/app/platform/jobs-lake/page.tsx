"use client";
import Link from "next/link";
import { Activity, AlertTriangle, Database, Layers } from "lucide-react";
import type { ModuleOverview, OverviewView, QualityView, CoverageView } from "@/server/jobslake/views";
import { Button } from "@/components/common/Button";
import { LoadError, Loading, Meter, Note, PageTitle, Panel, ResponsiveTable, Stat, num, pct, useAdmin } from "@/components/jobslake/ui";

/**
 * The WonderWorks admin's home (owner, 2026-11-01: the admin works at WonderWorks level and caters to every module
 * equally): every module's sources and what they fetched today, then what needs attention. Detail lives on its own
 * page (Health, Runs, Data quality), so this page stays short.
 */
export default function AdminOverview() {
  const o = useAdmin<OverviewView>("overview");
  const q = useAdmin<{ quality: QualityView; coverage: CoverageView }>("quality?days=7");

  if (o.error) return <LoadError error={o.error} onRetry={o.reload} />;
  if (!o.data) return <Loading rows={4} />;
  const d = o.data;
  const successRate = d.runs24h.total ? 1 - d.runs24h.failed / d.runs24h.total : null;
  const critical = d.alerts.filter((a) => a.severity === "critical").length;
  const modules = d.modules ?? [];

  return (
    <>
      <PageTitle
        title="WonderWorks admin"
        subtitle="Every module's sources, data and operations. Each figure is counted from recorded runs and stored listings."
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
        <Stat icon={<Database className="size-5" aria-hidden />} href="/platform/jobs-lake/sources" label="Live sources" value={num(d.sources.active)} hint={d.sources.needsSetup ? `${d.sources.needsSetup} need setup` : `across ${modules.filter((m) => m.live).length} of ${modules.length} modules`} />
        <Stat icon={<Layers className="size-5" aria-hidden />} href="/platform/jobs-lake/runs" label="Listings fetched · 24 h" value={num(d.runs24h.retrieved)} hint={`${num(d.runs24h.valid)} passed checks`} />
        <Stat icon={<Activity className="size-5" aria-hidden />} href="/platform/jobs-lake/health" label="Source success · 24 h" value={pct(successRate)} hint={d.runs24h.total ? `${num(d.runs24h.failed)} of ${num(d.runs24h.total)} runs failed` : "No runs yet"} />
        <Stat icon={<AlertTriangle className="size-5" aria-hidden />} href="/platform/jobs-lake/alerts" label="Alerts" value={num(d.alerts.length)} hint={critical ? `${critical} critical` : "None critical"} />
      </div>

      <Panel
        title="Modules"
        className="mt-4"
        action={
          <Link href="/platform/jobs-lake/sources" className="text-[12px] font-medium text-brand-600 hover:underline">
            All sources
          </Link>
        }
      >
        <ResponsiveTable<ModuleOverview>
          rows={modules}
          rowKey={(m) => m.id}
          empty="No modules."
          columns={[
            { header: "Module", cell: (m) => <span className="font-medium text-ink">{m.label}</span> },
            { header: "Live sources", cell: (m) => <ModuleSources m={m} />, className: "tabular-nums" },
            { header: "Fetched · 24 h", cell: (m) => num(m.retrieved24h), className: "tabular-nums text-right" },
            { header: "Runs · 24 h", cell: (m) => (m.runs24h ? `${num(m.runs24h)}${m.failed24h ? ` (${num(m.failed24h)} failed)` : ""}` : "—"), className: "tabular-nums text-right" },
          ]}
          card={(m) => (
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <span className="min-w-0">
                <span className="font-medium text-ink">{m.label}</span>
                <span className="block text-[12px] text-ink-3">
                  <ModuleSources m={m} />
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                {num(m.retrieved24h)}
                <span className="block text-[11px] text-ink-4">fetched · 24 h</span>
              </span>
            </div>
          )}
        />
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Needs attention"
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
            <p className="py-4 text-center text-[13px] text-ink-4">Nothing needs attention.</p>
          )}
        </Panel>
        <Panel
          title="Jobs search pool · 7 days"
          action={
            <Link href="/platform/jobs-lake/quality" className="text-[12px] font-medium text-brand-600 hover:underline">
              Data quality
            </Link>
          }
        >
          {q.data ? (
            q.data.quality.opportunities ? (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-ink-2">
                  <span className="font-semibold text-ink">{num(d.pool.opportunities)}</span> unique job listings
                  {d.pool.employerVerified != null ? `, ${pct(d.pool.employerVerified, 0)} from employers' own sites` : ""}
                </p>
                <Meter label="Required fields" value={q.data.quality.requiredFields} />
                <Meter label="Valid apply links" value={q.data.quality.validApplyUrls} />
              </div>
            ) : (
              <p className="py-4 text-center text-[13px] text-ink-4">No listings stored yet.</p>
            )
          ) : (
            <Loading rows={1} />
          )}
        </Panel>
      </div>
    </>
  );
}

function ModuleSources({ m }: { m: ModuleOverview }) {
  if (!m.live) return <span className="text-ink-4">None yet</span>;
  return (
    <span>
      {num(m.live)}
      {m.down ? <span className="text-danger-600"> · {num(m.down)} down</span> : null}
      {m.needsSetup ? <span className="text-warning-600"> · {num(m.needsSetup)} need setup</span> : null}
    </span>
  );
}
