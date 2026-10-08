"use client";
import { useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { InsightsView, Suggestion } from "@/domain/jobslake/insights";
import { Segmented } from "@/components/common/Input";
import { Badge } from "@/components/common/Badge";
import { LoadError, Loading, Note, PageTitle, Panel, ResponsiveTable, Stat, num, pct, useAdmin } from "@/components/jobslake/ui";

const SEVERITY = { high: "Fix first", medium: "Improve", low: "Consider" } as const;

function SuggestionItem({ s }: { s: Suggestion }) {
  return (
    <li className="rounded-[14px] border border-line bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-medium text-ink">{s.title}</p>
        <Badge tone={s.severity === "high" ? "danger" : s.severity === "medium" ? "warning" : "neutral"}>{SEVERITY[s.severity]}</Badge>
        {s.origin === "ai" && (
          <Badge tone="brand">
            <Sparkles className="mr-1 inline size-3" aria-hidden />
            AI suggestion
          </Badge>
        )}
      </div>
      {s.detail && <p className="mt-0.5 text-[12px] text-ink-2">{s.detail}</p>}
      <p className="mt-1 text-[11px] text-ink-3">
        {s.facts.map((f) => `${f.label}: ${f.value}`).join(" · ")}
        {s.sourceId && (
          <>
            {" · "}
            <Link href={`/platform/jobs-lake/sources/${s.sourceId}`} className="underline">
              Open source
            </Link>
          </>
        )}
      </p>
    </li>
  );
}

export default function InsightsPage() {
  const [days, setDays] = useState("7");
  const { data, error, reload } = useAdmin<{ insights: InsightsView }>(`insights?days=${days}`);
  const ai = useAdmin<{ suggestions: Suggestion[] | null }>(data ? `insights/ai?days=${days}` : null);
  const v = data?.insights;
  return (
    <>
      <PageTitle
        title="Insights"
        subtitle="What each source is worth to candidates, from stored runs, the job pool and candidates' own matching. Suggestions show the numbers they rest on; none changes a source."
        actions={<Segmented value={days} onChange={setDays} label="Period" size="sm" options={[{ value: "1", label: "24 h" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }]} />}
      />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {v && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Jobs in the pool" value={num(v.pool.jobs)} hint={`from ${num(v.pool.sourcesContributing)} sources`} />
            <Stat label="Found by one source only" value={pct(v.pool.exclusiveShare, 0)} hint="lost without that source" />
            <Stat label="Relevant to candidates" value={pct(v.pool.relevantRate, 0)} hint={`${num(v.pool.strong)} strong matches`} />
            <Stat label="Posted in the last 7 days" value={pct(v.pool.freshShare, 0)} />
          </div>

          <Panel title="Suggestions">
            {!v.suggestions.length && !ai.data?.suggestions?.length && !ai.loading && <p className="py-3 text-center text-[13px] text-ink-4">Nothing to improve in this period.</p>}
            <ul className="flex flex-col gap-2">
              {v.suggestions.map((s) => (
                <SuggestionItem key={s.id} s={s} />
              ))}
              {ai.data?.suggestions?.map((s) => (
                <SuggestionItem key={s.id} s={s} />
              ))}
            </ul>
            {ai.loading && <p className="mt-2 text-[12px] text-ink-3">AI is reading these numbers…</p>}
            {ai.data && ai.data.suggestions === null && (
              <div className="mt-2">
                <Note>AI suggestions are unavailable right now (no platform model, or it didn&apos;t answer). The suggestions above are from fixed rules.</Note>
              </div>
            )}
            {ai.error && <p className="mt-2 text-[12px] text-ink-3">{ai.error.message}</p>}
          </Panel>

          <Panel title="Source scorecard">
            <ResponsiveTable
              rows={v.sources}
              rowKey={(r) => r.sourceId}
              empty="No sources yet."
              columns={[
                { header: "Source", cell: (r) => <Link href={`/platform/jobs-lake/sources/${r.sourceId}`} className="font-medium text-ink hover:underline">{r.name}{r.available ? "" : " · needs setup"}</Link> },
                { header: "Pool jobs", cell: (r) => num(r.poolJobs), className: "tabular-nums text-right" },
                { header: "Only here", cell: (r) => pct(r.exclusiveShare, 0), className: "tabular-nums text-right" },
                { header: "Relevant", cell: (r) => (r.measuredRelevance ? pct(r.relevantRate, 0) : "—"), className: "tabular-nums text-right" },
                { header: "Strong", cell: (r) => (r.measuredRelevance ? num(r.strong) : "—"), className: "tabular-nums text-right" },
                { header: "Fresh", cell: (r) => pct(r.freshShare, 0), className: "tabular-nums text-right" },
                { header: "Valid / run", cell: (r) => num(r.yieldPerRun), className: "tabular-nums text-right" },
                { header: "Duplicates", cell: (r) => pct(r.duplicateRate, 0), className: "tabular-nums text-right" },
                { header: "Success", cell: (r) => pct(r.successRate, 0), className: "tabular-nums text-right" },
              ]}
              card={(r) => (
                <p className="text-[13px]">
                  <Link href={`/platform/jobs-lake/sources/${r.sourceId}`} className="font-medium text-ink">
                    {r.name}
                  </Link>
                  <span className="block text-[12px] text-ink-3">
                    {num(r.poolJobs)} jobs · {pct(r.exclusiveShare, 0)} only here · {r.measuredRelevance ? `${pct(r.relevantRate, 0)} relevant · ${num(r.strong)} strong` : "relevance not measured"} · {pct(r.successRate, 0)} success
                  </span>
                </p>
              )}
            />
            <p className="mt-2 text-[11px] text-ink-4">Relevant and strong come from candidates&apos; matching, reported back per search (counts only). &ldquo;—&rdquo; means no search in this period reported it.</p>
          </Panel>

          {v.gaps.length > 0 && (
            <Panel title="Thinnest coverage">
              <ul className="grid gap-1 text-[13px] sm:grid-cols-2">
                {v.gaps.map((g) => (
                  <li key={`${g.dimension}:${g.key}`} className="flex justify-between gap-2">
                    <span className="text-ink-2">
                      {g.dimension === "country" ? "Country" : "Role family (from titles)"} · {g.key}
                    </span>
                    <span className="tabular-nums text-ink">{num(g.jobs)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </>
  );
}
