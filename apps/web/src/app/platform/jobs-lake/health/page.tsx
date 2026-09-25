"use client";
import Link from "next/link";
import type { SourceView } from "@/server/jobslake/views";
import { relativeTime } from "@/lib/format";
import { AccessBadge, HealthChip, LoadError, Loading, Note, PageTitle, Panel, ResponsiveTable, Stat, ms, num, pct, useAdmin } from "@/components/jobslake/ui";

export default function HealthPage() {
  const { data, error, reload } = useAdmin<{ sources: SourceView[] }>("sources");
  const live = (data?.sources ?? []).filter((s) => s.status === "active" || s.status === "degraded");
  const count = (st: string) => live.filter((s) => (s.health?.state ?? "no_data") === st).length;
  return (
    <>
      <PageTitle title="Health" subtitle="Computed from the last 7 days of runs. Down = the last two runs failed; degraded = success under 90% or median latency over 4 s." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Healthy" value={num(count("healthy"))} />
            <Stat label="Degraded" value={num(count("degraded"))} />
            <Stat label="Down" value={num(count("down"))} />
            <Stat label="No data yet" value={num(count("no_data"))} />
          </div>
          {live.some((s) => !s.available) && (
            <div className="mb-4">
              <Note tone="warning">{live.filter((s) => !s.available).map((s) => s.name).join(", ")} can&apos;t be queried on this deployment until credentials are set.</Note>
            </div>
          )}
          <Panel>
            <ResponsiveTable
              rows={live}
              rowKey={(r) => r.id}
              empty="No active sources."
              columns={[
                { header: "Source", cell: (r) => <Link href={`/platform/jobs-lake/sources/${r.id}`} className="font-medium text-ink hover:underline">{r.name} <AccessBadge label={r.accessLabel} /></Link> },
                { header: "State", cell: (r) => <HealthChip state={r.health?.state} /> },
                { header: "Runs", cell: (r) => num(r.health?.runs ?? null), className: "tabular-nums text-right" },
                { header: "Success", cell: (r) => pct(r.health?.successRate), className: "tabular-nums text-right" },
                { header: "p50 latency", cell: (r) => ms(r.health?.p50LatencyMs), className: "tabular-nums text-right" },
                { header: "Timeouts", cell: (r) => num(r.health?.failures.timeout ?? null), className: "tabular-nums text-right" },
                { header: "Failures", cell: (r) => num(r.health?.failures.unavailable ?? null), className: "tabular-nums text-right" },
                { header: "Last success", cell: (r) => (r.health?.lastSuccessAt ? relativeTime(r.health.lastSuccessAt) : "—") },
              ]}
              card={(r) => (
                <Link href={`/platform/jobs-lake/sources/${r.id}`} className="flex items-center justify-between gap-2 text-[13px]">
                  <span>
                    <span className="font-medium text-ink">{r.name}</span>
                    <span className="block text-[12px] text-ink-3">
                      {num(r.health?.runs ?? null)} runs · {pct(r.health?.successRate)} · {ms(r.health?.p50LatencyMs)}
                    </span>
                  </span>
                  <HealthChip state={r.health?.state} />
                </Link>
              )}
            />
          </Panel>
        </>
      )}
    </>
  );
}
