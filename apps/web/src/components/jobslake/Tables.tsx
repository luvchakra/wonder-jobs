"use client";
import Link from "next/link";
import type { SourceRun } from "@/domain/jobslake/health";
import type { AuditEvent } from "@/server/jobslake/types";
import { relativeTime } from "@/lib/format";
import { OutcomeChip, ResponsiveTable, ms, num } from "./ui";

export function RunsTable({ runs, showSource }: { runs: (SourceRun & { relevant?: number; strong?: number })[]; showSource?: boolean }) {
  return (
    <ResponsiveTable
      rows={runs}
      rowKey={(r) => r.id}
      empty="No runs yet."
      columns={[
        { header: "When", cell: (r) => <span title={r.startedAt}>{relativeTime(r.startedAt)}</span> },
        ...(showSource ? [{ header: "Source", cell: (r: SourceRun) => <Link href={`/platform/jobs-lake/sources/${r.sourceId}`} className="hover:underline">{r.sourceId}</Link> }] : []),
        { header: "Trigger", cell: (r) => r.trigger },
        { header: "Outcome", cell: (r) => <OutcomeChip outcome={r.outcome} /> },
        { header: "Jobs", cell: (r) => num(r.retrieved), className: "tabular-nums text-right" },
        { header: "Valid", cell: (r) => num(r.valid), className: "tabular-nums text-right" },
        { header: "Dupes", cell: (r) => num(r.duplicates), className: "tabular-nums text-right" },
        { header: "Relevant / strong", cell: (r) => (r.relevant == null ? "—" : `${r.relevant} / ${r.strong ?? 0}`), className: "tabular-nums text-right" },
        { header: "Duration", cell: (r) => ms(r.durationMs), className: "tabular-nums text-right" },
        { header: "Detail", cell: (r) => <span className="line-clamp-1 max-w-[220px] text-[12px] text-ink-3" title={r.message}>{r.message ?? ""}</span> },
      ]}
      card={(r) => (
        <div className="flex flex-col gap-1 text-[13px]">
          <span className="flex items-center justify-between gap-2">
            <span className="font-medium text-ink">{showSource ? r.sourceId : relativeTime(r.startedAt)}</span>
            <OutcomeChip outcome={r.outcome} />
          </span>
          <span className="text-[12px] text-ink-3">
            {showSource ? `${relativeTime(r.startedAt)} · ` : ""}
            {r.trigger} · {num(r.retrieved)} jobs · {num(r.valid)} valid · {ms(r.durationMs)}
          </span>
          {r.message && <span className="text-[12px] text-ink-4">{r.message}</span>}
        </div>
      )}
    />
  );
}

export function AuditList({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <p className="py-4 text-center text-[13px] text-ink-4">No administrative actions recorded.</p>;
  return (
    <ul className="divide-y divide-line">
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} className="flex flex-col gap-0.5 py-2 text-[13px] sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <span>
            <span className="font-mono text-[12px] text-ink">{e.action}</span>
            {e.sourceId && (
              <Link href={`/platform/jobs-lake/sources/${e.sourceId}`} className="ml-2 text-[12px] text-brand-600 hover:underline">
                {e.sourceId}
              </Link>
            )}
            {e.detail && Object.keys(e.detail).length > 0 && <span className="ml-2 text-[12px] text-ink-4">{Object.entries(e.detail).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}</span>}
          </span>
          <span className="shrink-0 text-[12px] text-ink-3">
            {e.actor} · {relativeTime(e.at)}
          </span>
        </li>
      ))}
    </ul>
  );
}
