"use client";
import { useState } from "react";
import type { DirectoryCompany } from "@/server/jobslake/companies";
import { companyLines } from "@/domain/jobslake/companies";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { LoadError, Loading, PageTitle, Panel, ResponsiveTable, num, useAdmin } from "@/components/jobslake/ui";

const PAGE = 50;

/** What a company's facts say, one line per fact, each with the source it came from. */
function Facts({ c }: { c: DirectoryCompany }) {
  const lines = companyLines({ name: c.name, facts: c.facts, wikidata: c.wikidata ?? undefined, ratings: c.ratings ?? undefined, ratingsAt: c.ratingsAt, h1b: c.h1b, openJobs: c.openJobs, newJobs7d: c.newJobs7d });
  if (!lines.length) return <span className="text-ink-4">None yet</span>;
  return (
    <ul className="space-y-0.5">
      {lines.map((l) => (
        <li key={l.label} className="text-[12.5px] text-ink-2">
          <span className="text-ink-3">{l.label}:</span> {l.value} <span className="text-[11.5px] text-ink-4">· {l.source}</span>
        </li>
      ))}
    </ul>
  );
}

const checked = (c: DirectoryCompany) => [c.factsAt && `TheirStack ${relativeTime(c.factsAt)}`, c.wikidataAt && `Wikidata ${relativeTime(c.wikidataAt)}${c.wikidata ? "" : " (none)"}`].filter(Boolean).join(" · ") || "Never";

/** The company directory: every employer JobsLake has recorded from a real posting, with what its sources say about it. */
export default function CompaniesPage() {
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [offset, setOffset] = useState(0);
  const { data, error, reload, loading } = useAdmin<{ total: number; companies: DirectoryCompany[] }>(`companies?limit=${PAGE}&offset=${offset}&q=${encodeURIComponent(applied)}`);
  return (
    <>
      <PageTitle title="Company directory" subtitle="Every employer JobsLake recorded from a real posting, by its website domain — with what each source says about it. Most open roles first." />
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setApplied(q);
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company name or domain" aria-label="Search companies" className="h-10" />
        <Button type="submit" size="sm" className="h-10">
          Search
        </Button>
      </form>
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <Panel title={`${num(data.total)} ${data.total === 1 ? "company" : "companies"}`}>
          <ResponsiveTable
            rows={data.companies}
            rowKey={(c) => c.domain}
            empty={applied ? "No company matches." : "No companies recorded yet. They're added as searches and the daily refresh read postings."}
            columns={[
              { header: "Company", cell: (c) => (
                <span className="block">
                  <span className="font-medium text-ink">{c.name}</span>
                  <span className="block text-[12px] text-ink-3">{c.domain}</span>
                </span>
              ) },
              { header: "Open roles", cell: (c) => (c.openJobs === undefined ? "—" : `${num(c.openJobs)}${c.newJobs7d ? ` (${num(c.newJobs7d)} new)` : ""}`), className: "tabular-nums text-right whitespace-nowrap" },
              { header: "Facts", cell: (c) => <Facts c={c} /> },
              { header: "Seen via · checked", cell: (c) => (
                <span className="block text-[12px] text-ink-3">
                  {c.sources.join(", ") || "—"}
                  <span className="block">{checked(c)}</span>
                </span>
              ) },
            ]}
            card={(c) => (
              <div className="text-[13px]">
                <p className="font-medium text-ink">
                  {c.name} <span className="font-normal text-ink-3">· {c.domain}</span>
                </p>
                <p className="text-[12px] text-ink-3">
                  {c.openJobs === undefined ? "Not counted yet" : `${num(c.openJobs)} open roles${c.newJobs7d ? ` · ${num(c.newJobs7d)} new this week` : ""}`} · seen via {c.sources.join(", ") || "—"}
                </p>
                <div className="mt-1">
                  <Facts c={c} />
                </div>
                <p className="mt-1 text-[11.5px] text-ink-4">Checked: {checked(c)}</p>
              </div>
            )}
          />
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
