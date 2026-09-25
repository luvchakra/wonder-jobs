"use client";
import { useState } from "react";
import type { CoverageView, QualityView } from "@/server/jobslake/views";
import { Segmented } from "@/components/common/Input";
import { LoadError, Loading, Meter, PageTitle, Panel, ResponsiveTable, num, pct, useAdmin } from "@/components/jobslake/ui";

export default function QualityPage() {
  const [days, setDays] = useState("7");
  const { data, error, reload } = useAdmin<{ quality: QualityView; coverage: CoverageView }>(`quality?days=${days}`);
  return (
    <>
      <PageTitle title="Data quality" subtitle="Measured on the canonical jobs JobsLake stored, and on each source's recorded runs." actions={<Segmented value={days} onChange={setDays} label="Period" size="sm" options={[{ value: "1", label: "24 h" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }]} />} />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <div className="flex flex-col gap-4">
          <Panel title={`Canonical jobs (${num(data.quality.opportunities)})`}>
            {data.quality.opportunities ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Meter label="Required fields present" value={data.quality.requiredFields} />
                <Meter label="Valid apply URLs" value={data.quality.validApplyUrls} />
                <Meter judged={false} label="Posted in the last 7 days" value={data.quality.freshUnder7Days} />
                <Meter judged={false} label="From the employer's own site" value={data.quality.employerVerified} />
                <Meter judged={false} label="Compensation disclosed" value={data.quality.compensationDisclosed} hint="Depends on employers, not on JobsLake." />
                <Meter judged={false} label="Seen on more than one source" value={data.quality.multiSource} />
              </div>
            ) : (
              <p className="py-4 text-center text-[13px] text-ink-4">No jobs stored in this period.</p>
            )}
          </Panel>
          <Panel title={`By source · duplicate rate ${pct(data.quality.duplicateRate)}`}>
            <ResponsiveTable
              rows={data.quality.bySource}
              rowKey={(r) => r.sourceId}
              empty="No source retrieved anything in this period."
              columns={[
                { header: "Source", cell: (r) => r.name },
                { header: "Retrieved", cell: (r) => num(r.retrieved), className: "tabular-nums text-right" },
                { header: "Valid", cell: (r) => `${num(r.valid)} (${pct(r.validRate, 0)})`, className: "tabular-nums text-right" },
                { header: "Duplicates of stronger sources", cell: (r) => `${num(r.duplicates)} (${pct(r.duplicateRate, 0)})`, className: "tabular-nums text-right" },
              ]}
              card={(r) => (
                <p className="text-[13px]">
                  <span className="font-medium text-ink">{r.name}</span>
                  <span className="block text-[12px] text-ink-3">
                    {num(r.retrieved)} retrieved · {pct(r.validRate, 0)} valid · {pct(r.duplicateRate, 0)} duplicates
                  </span>
                </p>
              )}
            />
          </Panel>
        </div>
      )}
    </>
  );
}
