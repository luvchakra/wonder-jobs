"use client";
import { useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import type { SearchPlan } from "@/domain/jobslake/planner";
import { SEARCH_MODE_META, type SearchMode, type SearchResponse } from "@/domain/jobslake/protocol";
import type { SourceView } from "@/server/jobslake/views";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { Chip, Field, Input, Segmented } from "@/components/common/Input";
import { AccessBadge, adminFetch, Note, OutcomeChip, PageTitle, Panel, ResponsiveTable, ms, num, useAdmin } from "@/components/jobslake/ui";

/** An admin search through the same core as candidate searches, with the raw per-source detail and the plan. */
export default function PlaygroundPage() {
  const sources = useAdmin<{ sources: SourceView[] }>("sources");
  const [text, setText] = useState("");
  const [locations, setLocations] = useState("");
  const [mode, setMode] = useState<SearchMode>("balanced");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<{ response: SearchResponse; plan: SearchPlan } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const live = (sources.data?.sources ?? []).filter((s) => s.status === "active" || s.status === "degraded");

  const run = async () => {
    setBusy(true);
    setError(null);
    const r = await adminFetch<{ response: SearchResponse; plan: SearchPlan }>("playground", { method: "POST", body: JSON.stringify({ query: { text, locations: locations.split(",").map((l) => l.trim()).filter(Boolean) }, searchMode: mode, limit: 100, sourceIds: picked.length ? picked : undefined }) });
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    setOut(r.data);
    setShowAll(false);
  };

  return (
    <>
      <PageTitle title="Search playground" subtitle="Runs a real search through JobsLake core. Runs are recorded with the “playground” trigger and the search is audited." />
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Panel title="Search">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <Field label="Search terms" required htmlFor="pg-q">
              <Input id="pg-q" required value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. identity security director" />
            </Field>
            <Field label="Locations" hint="Comma-separated. Leave empty for anywhere." htmlFor="pg-l">
              <Input id="pg-l" value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Bengaluru, Remote" />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-ink-2">Mode</span>
              <Segmented value={mode} onChange={setMode} label="Search mode" size="sm" options={(Object.keys(SEARCH_MODE_META) as SearchMode[]).map((m) => ({ value: m, label: SEARCH_MODE_META[m].label }))} />
              <p className="text-[12px] text-ink-3">{SEARCH_MODE_META[mode].description}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-ink-2">Sources {picked.length ? `(${picked.length})` : "(all eligible)"}</span>
              <div className="flex flex-wrap gap-1.5">
                {live.map((s) => (
                  <Chip key={s.id} active={picked.includes(s.id)} onClick={() => setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))} className="h-7 px-2.5 text-[12px]">
                    {s.name}
                  </Chip>
                ))}
              </div>
            </div>
            <Button type="submit" loading={busy} disabled={!text.trim()} icon={<Search className="size-4" aria-hidden />}>
              Search
            </Button>
          </form>
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          {error && <Note tone="danger">{error}</Note>}
          {!out && !error && <Panel><p className="py-8 text-center text-[13px] text-ink-4">Results, per-source outcomes and the search plan appear here.</p></Panel>}
          {out && (
            <>
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
                {[
                  ["Retrieved", out.response.metadata.retrieved],
                  ["Duplicates", out.response.metadata.duplicates],
                  ["Unique", out.response.metadata.unique],
                  ["From warm pool", out.response.metadata.warm],
                  ["Sources answered", `${out.response.metadata.sourcesSucceeded}/${out.response.metadata.sourcesPlanned}`],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-[12px] border border-line bg-surface p-2">
                    <p className="text-[18px] font-semibold tabular-nums text-ink">{typeof v === "number" ? num(v) : v}</p>
                    <p className="text-[11px] text-ink-3">{k}</p>
                  </div>
                ))}
              </div>
              <Panel title={`Results (${out.response.results.length})`}>
                {out.response.results.length ? (
                  <ul className="divide-y divide-line">
                    {(showAll ? out.response.results : out.response.results.slice(0, 25)).map((o) => (
                      <li key={o.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium text-ink">{o.title}</p>
                          <p className="text-[12px] text-ink-3">
                            {o.employer.name} · {o.locations.join(", ")} · {relativeTime(o.postedAt)}
                          </p>
                          <p className="mt-1 flex flex-wrap gap-1">
                            {o.sourceRecords.map((r) => (
                              <AccessBadge key={r.sourceId + r.sourceJobId} label={`${r.sourceName}${r.canonical ? " ✓" : ""}`} />
                            ))}
                          </p>
                        </div>
                        <a href={o.canonicalApplyUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-brand-600 hover:underline">
                          Open <ExternalLink className="size-3" aria-hidden />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-[13px] text-ink-4">No results. See the source outcomes below for why.</p>
                )}
                {!showAll && out.response.results.length > 25 && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => setShowAll(true)}>
                    Show all {out.response.results.length}
                  </Button>
                )}
              </Panel>
              <Panel title="Source outcomes">
                <ResponsiveTable
                  rows={out.response.sources}
                  rowKey={(r) => r.sourceId}
                  empty="No sources were asked."
                  columns={[
                    { header: "Source", cell: (r) => r.sourceName },
                    { header: "Outcome", cell: (r) => <OutcomeChip outcome={r.outcome} /> },
                    { header: "Jobs", cell: (r) => num(r.retrieved), className: "tabular-nums text-right" },
                    { header: "Time", cell: (r) => ms(r.durationMs), className: "tabular-nums text-right" },
                    { header: "Detail", cell: (r) => <span className="text-[12px] text-ink-3">{r.message ?? ""}</span> },
                  ]}
                  card={(r) => (
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <span>
                        {r.sourceName}
                        <span className="block text-[12px] text-ink-3">
                          {num(r.retrieved)} jobs · {ms(r.durationMs)} {r.message ? `· ${r.message}` : ""}
                        </span>
                      </span>
                      <OutcomeChip outcome={r.outcome} />
                    </div>
                  )}
                />
              </Panel>
              <Panel title="Plan">
                <ol className="flex flex-col gap-1.5 text-[13px]">
                  {out.plan.waves.map((w, i) => (
                    <li key={i}>
                      <span className="font-medium text-ink">Wave {i + 1}:</span> <span className="text-ink-2">{w.map((p) => p.name).join(", ")}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-[12px] text-ink-3">
                  Depth: {out.plan.depth} · warm pool {out.plan.useWarmPool ? "used" : "not used"}
                </p>
                {out.plan.skipped.length > 0 && (
                  <details className="mt-2 text-[12px] text-ink-3">
                    <summary className="cursor-pointer">Not asked ({out.plan.skipped.length})</summary>
                    <ul className="mt-1 list-disc pl-5">
                      {out.plan.skipped.map((s) => (
                        <li key={s.id}>
                          {s.name}: {s.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Panel>
              <details className="rounded-[14px] border border-line bg-surface p-3">
                <summary className="cursor-pointer text-[13px] font-medium text-ink-2">Raw response (Protocol v1)</summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded-[10px] bg-[#15132b] p-3 text-[11px] text-white/85">{JSON.stringify(out.response, null, 2)}</pre>
              </details>
            </>
          )}
        </div>
      </div>
    </>
  );
}
