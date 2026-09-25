"use client";
import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { JobLakeProvenance } from "@/domain/jobs/types";
import { formatDate, relativeTime } from "@/lib/format";
import { refreshJob } from "@/services/jobs/jobsLakeClient";
import { Card } from "@/components/common/Card";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";

const FIELD_LABEL = { title: "title", canonicalApplyUrl: "apply link", postedAt: "posting date", compensation: "salary" } as const;

type Check = { state: "idle" } | { state: "checking" } | { state: "done"; tone: "success" | "warning" | "danger"; message: string; at: string };

/**
 * Where JobsLake saw this job: the record WonderJobs shows (the most authoritative source), every
 * other listing of the same role, and which source each key field came from.
 */
export function JobSourcesCard({ lake }: { lake: JobLakeProvenance }) {
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const canonical = lake.sightings.find((s) => s.canonical) ?? lake.sightings[0];
  const others = lake.sightings.filter((s) => s !== canonical);
  const byField = new Map<string, string[]>();
  for (const f of lake.fieldSources) byField.set(f.sourceName, [...(byField.get(f.sourceName) ?? []), FIELD_LABEL[f.field]]);

  const runCheck = async () => {
    setCheck({ state: "checking" });
    try {
      const r = await refreshJob(lake.opportunityId);
      const at = new Date().toISOString();
      if (r.status === "updated") setCheck({ state: "done", tone: "success", message: `Still listed on ${canonical.sourceName}.`, at });
      else if (r.status === "gone") setCheck({ state: "done", tone: "warning", message: `${canonical.sourceName} no longer lists it — the role may be closed.`, at });
      else setCheck({ state: "done", tone: "danger", message: `Couldn't reach ${canonical.sourceName} just now (${r.message ?? "unavailable"}).`, at });
    } catch (e) {
      setCheck({ state: "done", tone: "danger", message: e instanceof Error ? e.message : "The check failed.", at: new Date().toISOString() });
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Where this job was found</h2>
        {lake.employerVerified && <Badge tone="success">On the employer&apos;s own site</Badge>}
      </div>
      <p className="mt-1 text-[13px] text-ink-3">
        Found on {lake.sightings.length} source{lake.sightings.length === 1 ? "" : "s"}. WonderJobs shows the most authoritative listing — the employer&apos;s own careers site when there is one.
      </p>

      <ul className="mt-4 divide-y divide-line rounded-[14px] border border-line">
        {[canonical, ...others].map((s) => (
          <li key={`${s.sourceId}:${s.url}`} className="flex flex-col gap-1 p-3 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-ink">{s.sourceName}</span>
                <Badge>{s.accessLabel}</Badge>
                {s.canonical && <Badge tone="brand">Shown</Badge>}
                {s.employerSource && <Badge tone="success">Employer</Badge>}
              </div>
              <p className="mt-0.5 text-[12px] text-ink-4">
                {s.provider !== s.sourceName ? `${s.provider} · ` : ""}seen {relativeTime(s.observedAt)}
                {byField.get(s.sourceName) ? ` · ${byField.get(s.sourceName)!.join(", ")} from here` : ""}
              </p>
            </div>
            <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-brand-600 hover:underline">
              Open listing <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" onClick={runCheck} loading={check.state === "checking"} icon={<RefreshCw className="size-3.5" aria-hidden />}>
          {check.state === "checking" ? "Checking…" : `Check ${canonical.sourceName} now`}
        </Button>
        {check.state === "done" && (
          <p role="status" className={check.tone === "success" ? "text-[12px] text-success-600" : check.tone === "warning" ? "text-[12px] text-warning-600" : "text-[12px] text-danger-600"}>
            {check.message} <span className="text-ink-4">Checked {formatDate(check.at)}.</span>
          </p>
        )}
      </div>
    </Card>
  );
}
