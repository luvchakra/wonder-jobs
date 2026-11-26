"use client";
import { useState } from "react";
import { COVERAGE_STATE_LABEL, COVERED, THIN, type CoverageState, type CoverageView } from "@/domain/jobslake/coverage";
import { Segmented } from "@/components/common/Input";
import { LoadError, Loading, Note, PageTitle, Panel, ResponsiveTable, Stat, num, useAdmin } from "@/components/jobslake/ui";
import { cn } from "@/lib/cn";

const TONE: Record<CoverageState, string> = {
  covered: "bg-success-100 text-success-600",
  thin: "bg-warning-100 text-warning-600",
  gap: "bg-danger-100 text-danger-600",
  failed: "bg-bg-soft text-ink-4",
};

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Search coverage (owner, 2026-11-26): what Jobs' sources return for each kind of work in each place, from the weekly
 * probes, and the real searches that found least. Read-only: the next source to add is chosen from here.
 */
export default function CoveragePage() {
  const [days, setDays] = useState("14");
  const { data, error, reload } = useAdmin<{ coverage: CoverageView }>(`search-coverage?days=${days}`);
  const v = data?.coverage;
  const cells = v?.matrix.flatMap((r) => r.cells) ?? [];
  const count = (s: CoverageState) => cells.filter((c) => c.state === s).length;
  return (
    <>
      <PageTitle title="Search coverage" subtitle={`Jobs only. Each week, ${v?.report?.planned ?? "about 150"} searches (a kind of work × a place) count the results that really are that job: every word in the title. ${COVERED}+ is covered, ${THIN}–${COVERED - 1} thin, fewer a gap.`} />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {v && (
        <div className="flex flex-col gap-4">
          {!v.report ? (
            <Note tone="warning">No coverage run yet. It runs every Monday on GitHub (Actions → Search coverage → Run workflow runs it now), with the same repository secrets as the gateway collection.</Note>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Covered" value={num(count("covered"))} hint={`of ${num(cells.length)} searches`} />
                <Stat label="Thin" value={num(count("thin"))} hint={`${THIN}–${COVERED - 1} real matches`} />
                <Stat label="Gaps" value={num(count("gap"))} hint={`fewer than ${THIN}`} />
                <Stat label="Last run" value={when(v.report.ranAt)} hint={v.report.finishedAt ? `${num(v.report.probes)} of ${num(v.report.planned)} searches · ${Math.round(v.report.durationMs / 60_000)} min` : "still running or cut short"} />
              </div>
              <Panel title="By kind of work and place">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-[13px]">
                    <thead>
                      <tr className="text-[11.5px] text-ink-3">
                        <th className="py-1.5 pr-3 font-medium">Kind of work</th>
                        {v.places.map((p) => (
                          <th key={p} className="px-1 py-1.5 text-center font-medium">
                            {p}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {v.matrix.map((row) => (
                        <tr key={row.family.id} className="border-t border-line/70">
                          <td className="py-1.5 pr-3">
                            <span className="font-medium text-ink">{row.family.label}</span>
                            <span className="block text-[11.5px] text-ink-4">
                              {row.family.group} · “{row.family.query}”
                            </span>
                          </td>
                          {row.cells.map((c) => (
                            <td key={c.place} className="px-1 py-1.5 text-center">
                              <span title={`${COVERAGE_STATE_LABEL[c.state]}: ${c.matches ?? "—"} real matches of ${c.results} results`} className={cn("inline-block min-w-12 rounded-full px-2 py-0.5 text-[12px] font-semibold", TONE[c.state])}>
                                {c.matches ?? "—"}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Where real matches came from">
                  <ResponsiveTable
                    rows={v.contribution}
                    rowKey={(r) => r.sourceId}
                    empty="No source returned a real match."
                    columns={[
                      { header: "Source", cell: (r) => r.sourceId },
                      { header: "Real matches", cell: (r) => num(r.matches) },
                      { header: "Searches it helped", cell: (r) => num(r.probes) },
                    ]}
                    card={(r) => (
                      <p className="text-[13px]">
                        <span className="font-medium text-ink">{r.sourceId}</span> · {num(r.matches)} real matches in {num(r.probes)} searches
                      </p>
                    )}
                  />
                </Panel>
                <Panel title="Sources that couldn't be asked">
                  <ResponsiveTable
                    rows={v.missing}
                    rowKey={(r) => r.sourceId}
                    empty="Every source answered."
                    columns={[
                      { header: "Source", cell: (r) => r.sourceId },
                      { header: "Why", cell: (r) => (r.outcome === "needs_setup" ? "Needs setup (a key on Sources → Import)" : r.outcome === "timeout" ? "Timed out" : "Unavailable") },
                      { header: "Searches missed", cell: (r) => num(r.probes) },
                    ]}
                    card={(r) => (
                      <p className="text-[13px]">
                        <span className="font-medium text-ink">{r.sourceId}</span> · {r.outcome.replace("_", " ")} · missed {num(r.probes)}
                      </p>
                    )}
                  />
                </Panel>
              </div>
            </>
          )}
          <Panel
            title="People's searches that found least"
            action={<Segmented value={days} onChange={setDays} label="Period" size="sm" options={[{ value: "7", label: "7 days" }, { value: "14", label: "14 days" }, { value: "30", label: "30 days" }]} />}
          >
            <p className="mb-2 text-[12px] text-ink-3">Their words only, never who searched. Relevant is what each person&apos;s own matching judged relevant, averaged per search; blank where it didn&apos;t report back.</p>
            <ResponsiveTable
              rows={v.real.rows}
              rowKey={(r) => r.query}
              empty="No searches in this period."
              columns={[
                { header: "Searched for", cell: (r) => r.query },
                { header: "Searches", cell: (r) => num(r.searches) },
                { header: "Relevant", cell: (r) => (r.avgRelevant === null ? "—" : num(r.avgRelevant)) },
                { header: "Found", cell: (r) => num(r.avgFound) },
                { header: "Last", cell: (r) => when(r.lastAt) },
              ]}
              card={(r) => (
                <p className="text-[13px]">
                  <span className="font-medium text-ink">{r.query}</span> · {num(r.searches)}× · relevant {r.avgRelevant === null ? "—" : num(r.avgRelevant)} · found {num(r.avgFound)}
                </p>
              )}
            />
          </Panel>
        </div>
      )}
    </>
  );
}
