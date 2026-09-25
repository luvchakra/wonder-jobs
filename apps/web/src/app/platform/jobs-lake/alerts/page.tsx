"use client";
import Link from "next/link";
import type { Alert } from "@/domain/jobslake/health";
import { relativeTime } from "@/lib/format";
import { StatusPill } from "@/components/common/Badge";
import { LoadError, Loading, PageTitle, Panel, useAdmin } from "@/components/jobslake/ui";

export default function AlertsPage() {
  const { data, error, reload } = useAdmin<{ alerts: Alert[] }>("alerts");
  return (
    <>
      <PageTitle title="Alerts" subtitle="Derived from recent runs of active sources. An alert clears by itself when the condition stops holding." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <Panel>
          {data.alerts.length ? (
            <ul className="divide-y divide-line">
              {data.alerts.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div>
                    <p className="text-[14px] font-medium text-ink">{a.title}</p>
                    <p className="text-[13px] text-ink-3">{a.detail}</p>
                    <Link href={`/platform/jobs-lake/sources/${a.sourceId}`} className="text-[12px] text-brand-600 hover:underline">
                      Open source
                    </Link>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[12px] text-ink-3">
                    <StatusPill tone={a.severity === "critical" ? "danger" : "warning"} label={a.severity === "critical" ? "Critical" : "Warning"} />
                    since {relativeTime(a.since)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-[13px] text-ink-4">No active alerts.</p>
          )}
        </Panel>
      )}
    </>
  );
}
