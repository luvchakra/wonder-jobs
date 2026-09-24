"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { SourceView } from "@/server/jobslake/views";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { Chip, Input } from "@/components/common/Input";
import { AccessBadge, HealthChip, LoadError, Loading, PageTitle, Panel, ResponsiveTable, SourceStatusChip, ms, num, pct, useAdmin } from "@/components/jobslake/ui";

type Filter = "all" | "active" | "setup" | "draft" | "paused" | "partnership";

const FILTERS: { value: Filter; label: string; test: (s: SourceView) => boolean }[] = [
  { value: "all", label: "All", test: () => true },
  { value: "active", label: "Active", test: (s) => (s.status === "active" || s.status === "degraded") && s.available },
  { value: "setup", label: "Needs setup", test: (s) => (s.status === "active" || s.status === "degraded") && !s.available },
  { value: "draft", label: "Draft / testing", test: (s) => s.status === "draft" || s.status === "testing" },
  { value: "paused", label: "Paused / disabled", test: (s) => s.status === "paused" || s.status === "disabled" },
  { value: "partnership", label: "Do not use", test: (s) => s.status === "do_not_use" },
];

export default function SourcesPage() {
  const { data, error, reload } = useAdmin<{ sources: SourceView[] }>("sources");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.value === filter)!;
    const t = q.trim().toLowerCase();
    return (data?.sources ?? []).filter((s) => f.test(s) && (!t || `${s.name} ${s.provider} ${s.accessLabel}`.toLowerCase().includes(t)));
  }, [data, filter, q]);

  return (
    <>
      <PageTitle
        title="Sources"
        subtitle="Every source JobsLake knows, how it's accessed, and how it has actually performed over the last 7 days."
        actions={
          <Button size="sm" href="/platform/jobs-lake/add">
            Add source
          </Button>
        }
      />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <Panel>
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter sources">
              {FILTERS.map((f) => (
                <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)} className="h-8 px-3 text-[12px]">
                  {f.label} <span className="text-ink-4">{data.sources.filter(f.test).length}</span>
                </Chip>
              ))}
            </div>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sources…" aria-label="Search sources" className="h-9 md:w-60" />
          </div>
          <ResponsiveTable
            rows={rows}
            rowKey={(r) => r.id}
            empty="No sources match."
            columns={[
              {
                header: "Source",
                cell: (r) => (
                  <Link href={`/platform/jobs-lake/sources/${r.id}`} className="font-medium text-ink hover:underline">
                    {r.name}
                    <span className="block text-[11px] font-normal text-ink-4">{r.provider}</span>
                  </Link>
                ),
              },
              { header: "Type", cell: (r) => r.categoryLabel },
              { header: "Access", cell: (r) => <AccessBadge label={r.accessLabel} /> },
              { header: "Status", cell: (r) => <SourceStatusChip status={r.status} label={r.status === "active" && !r.available ? "Needs setup" : r.statusLabel} /> },
              { header: "Health", cell: (r) => <HealthChip state={r.health?.state} /> },
              { header: "Last run", cell: (r) => (r.health?.lastRunAt ? relativeTime(r.health.lastRunAt) : "Never") },
              { header: "Retrieved (7 d)", cell: (r) => num(r.health?.retrieved ?? null), className: "tabular-nums text-right" },
              { header: "Success", cell: (r) => pct(r.health?.successRate), className: "tabular-nums text-right" },
              { header: "Latency", cell: (r) => ms(r.health?.p50LatencyMs), className: "tabular-nums text-right" },
            ]}
            card={(r) => (
              <Link href={`/platform/jobs-lake/sources/${r.id}`} className="flex flex-col gap-1.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">
                    {r.name} <AccessBadge label={r.accessLabel} />
                  </span>
                  <SourceStatusChip status={r.status} label={r.status === "active" && !r.available ? "Needs setup" : r.statusLabel} />
                </span>
                <span className="text-[12px] text-ink-3">
                  {r.categoryLabel} · {num(r.health?.retrieved ?? null)} retrieved (7 d) · {pct(r.health?.successRate)} success · {ms(r.health?.p50LatencyMs)}
                </span>
              </Link>
            )}
          />
        </Panel>
      )}
    </>
  );
}
