"use client";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { AccessBadge, LoadError, Loading, PageTitle, Panel, num, useAdmin } from "@/components/jobslake/ui";

const PAGE = 50;

/** The warm pool: canonical opportunities JobsLake actually retrieved, newest first. */
export default function JobsPage() {
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [offset, setOffset] = useState(0);
  const { data, error, reload, loading } = useAdmin<{ total: number; offset: number; opportunities: CanonicalOpportunity[] }>(`opportunities?limit=${PAGE}&offset=${offset}&q=${encodeURIComponent(applied)}`);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <PageTitle title="Jobs" subtitle="Canonical opportunities in the warm pool — every one retrieved from a source, with the records it was merged from." />
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setApplied(q);
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, employer or location" aria-label="Search jobs" className="h-10" />
        <Button type="submit" size="sm" className="h-10">
          Search
        </Button>
      </form>
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <Panel title={`${num(data.total)} job${data.total === 1 ? "" : "s"}`}>
          {data.opportunities.length ? (
            <ul className="divide-y divide-line">
              {data.opportunities.map((o) => (
                <li key={o.id} className="py-2.5">
                  <button type="button" onClick={() => setOpen(open === o.id ? null : o.id)} aria-expanded={open === o.id} className="flex w-full flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-ink">{o.title}</span>
                      <span className="block text-[12px] text-ink-3">
                        {o.employer.name} · {o.locations.join(", ")} · posted {relativeTime(o.postedAt)} · seen {relativeTime(o.freshness.lastObservedAt)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap gap-1">
                      {o.quality.employerVerified && <AccessBadge label="Employer" />}
                      <AccessBadge label={`${o.quality.sourceCount} source${o.quality.sourceCount === 1 ? "" : "s"}`} />
                    </span>
                  </button>
                  {open === o.id && (
                    <div className="mt-2 grid gap-3 rounded-[12px] bg-bg-soft p-3 text-[12px] md:grid-cols-2">
                      <div>
                        <p className="mb-1 font-medium text-ink">Source records</p>
                        <ul className="flex flex-col gap-1">
                          {o.sourceRecords.map((r) => (
                            <li key={r.sourceId + r.sourceJobId}>
                              <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                                {r.sourceName} <ExternalLink className="size-3" aria-hidden />
                              </a>{" "}
                              {r.canonical ? "(canonical)" : ""} · {r.sourceJobId} · seen {relativeTime(r.observedAt)}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="mb-1 font-medium text-ink">Field provenance</p>
                        <ul className="flex flex-col gap-0.5">
                          {o.provenance.map((p) => (
                            <li key={p.field}>
                              {p.field} ← {p.sourceId} ({p.confidence})
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 font-mono text-[11px] text-ink-4">{o.id}</p>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-[13px] text-ink-4">{applied ? "No jobs match." : "The warm pool is empty. It fills as candidates search and as you use the playground."}</p>
          )}
          {data.total > PAGE && (
            <div className="mt-3 flex items-center justify-between text-[12px] text-ink-3">
              <span>
                {num(offset + 1)}–{num(Math.min(offset + PAGE, data.total))} of {num(data.total)}
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={offset + PAGE >= data.total || loading} onClick={() => setOffset(offset + PAGE)}>
                  Next
                </Button>
              </span>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
