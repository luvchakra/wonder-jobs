"use client";
import { Suspense, useState } from "react";
import {
  ModulePicker,
  useAdminModule,
} from "@/components/jobslake/modulePicker";
import { ExternalLink } from "lucide-react";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { Input, Select } from "@/components/common/Input";
import {
  JOB_TYPES,
  JOB_TYPE_LABEL,
  jobTypeOf,
  type JobType,
} from "@/domain/jobs/jobType";
import {
  AccessBadge,
  LoadError,
  Loading,
  PageTitle,
  Panel,
  num,
  useAdmin,
} from "@/components/jobslake/ui";

const PAGE = 50;

/** The warm pool: canonical opportunities WorksLake actually retrieved, newest first. */
export default function JobsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <JobsPageInner />
    </Suspense>
  );
}

function JobsPageInner() {
  const mod = useAdminModule();
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [offset, setOffset] = useState(0);
  const [type, setType] = useState("");
  const { data, error, reload, loading } = useAdmin<{
    total: number;
    offset: number;
    byType?: Record<JobType | "unstated", number>;
    opportunities: CanonicalOpportunity[];
  }>(
    `opportunities?limit=${PAGE}&offset=${offset}&q=${encodeURIComponent(applied)}&type=${type}&module=${mod.module}`,
  );
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <PageTitle
        title="Browse listings"
        subtitle="The listings WorksLake stored for this module — every one retrieved from a source, with the records it was merged from."
        actions={
          <ModulePicker
            value={mod.module}
            onChange={(m) => (setOffset(0), setType(""), mod.setModule(m))}
          />
        }
      />
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setApplied(q);
        }}
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Title, employer or location"
          aria-label="Search jobs"
          className="h-10"
        />
        <Select
          aria-label="Job type"
          value={type}
          onChange={(e) => {
            setOffset(0);
            setType(e.target.value);
          }}
          className="h-10 w-auto shrink-0"
        >
          <option value="">All types</option>
          {JOB_TYPES.map((t) => (
            <option key={t} value={t}>
              {JOB_TYPE_LABEL[t]}
              {data?.byType ? ` (${num(data.byType[t])})` : ""}
            </option>
          ))}
          <option value="unstated">
            Not stated{data?.byType ? ` (${num(data.byType.unstated)})` : ""}
          </option>
        </Select>
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
                  <button
                    type="button"
                    onClick={() => setOpen(open === o.id ? null : o.id)}
                    aria-expanded={open === o.id}
                    className="flex w-full flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-ink">
                        {o.title}
                      </span>
                      <span className="block text-[12px] text-ink-3">
                        {o.employer.name} · {o.locations.join(", ")} · posted{" "}
                        {relativeTime(o.postedAt)} · seen{" "}
                        {relativeTime(o.freshness.lastObservedAt)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap gap-1">
                      {jobTypeOf(o) && (
                        <AccessBadge
                          label={`${JOB_TYPE_LABEL[jobTypeOf(o)!]}${o.jobTypeFrom === "source" ? "" : " · from title"}`}
                        />
                      )}
                      {o.quality.employerVerified && (
                        <AccessBadge label="Employer" />
                      )}
                      <AccessBadge
                        label={`${o.quality.sourceCount} source${o.quality.sourceCount === 1 ? "" : "s"}`}
                      />
                    </span>
                  </button>
                  {open === o.id && (
                    <div className="mt-2 grid gap-3 rounded-[12px] bg-bg-soft p-3 text-[12px] md:grid-cols-2">
                      <div>
                        <p className="mb-1 font-medium text-ink">
                          Source records
                        </p>
                        <ul className="flex flex-col gap-1">
                          {o.sourceRecords.map((r) => (
                            <li key={r.sourceId + r.sourceJobId}>
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                              >
                                {r.sourceName}{" "}
                                <ExternalLink className="size-3" aria-hidden />
                              </a>{" "}
                              {r.canonical ? "(canonical)" : ""} ·{" "}
                              {r.sourceJobId} · seen{" "}
                              {relativeTime(r.observedAt)}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="mb-1 font-medium text-ink">
                          Field provenance
                        </p>
                        <ul className="flex flex-col gap-0.5">
                          {o.provenance.map((p) => (
                            <li key={p.field}>
                              {p.field} ← {p.sourceId} ({p.confidence})
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 font-mono text-[11px] text-ink-4">
                          {o.id}
                        </p>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-[13px] text-ink-4">
              {applied
                ? "No jobs match."
                : "The warm pool is empty. It fills as candidates search and as you use the playground."}
            </p>
          )}
          {data.total > PAGE && (
            <div className="mt-3 flex items-center justify-between text-[12px] text-ink-3">
              <span>
                {num(offset + 1)}–{num(Math.min(offset + PAGE, data.total))} of{" "}
                {num(data.total)}
              </span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={offset === 0 || loading}
                  onClick={() => setOffset(Math.max(0, offset - PAGE))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={offset + PAGE >= data.total || loading}
                  onClick={() => setOffset(offset + PAGE)}
                >
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
