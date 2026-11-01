"use client";
import Link from "next/link";
import type { DbReport } from "@/server/databases";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { LoadError, Loading, Meter, PageTitle, Panel, Stat, num, useAdmin } from "@/components/jobslake/ui";

const mb = (b: number | null) => (b == null ? "—" : b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : `${Math.round(b / 1048576)} MB`);
const since = (iso: string | null) => {
  if (!iso) return "—";
  const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

/**
 * Admin → Databases (owner, 2026-11-01): usage and performance of the application database (ADB) and the optional data
 * database (DDB), side by side. Read-only; opening the page reads each database's figures once.
 */
export default function DatabasesPage() {
  const { data, error, reload } = useAdmin<{ adb: DbReport; ddb: DbReport }>("databases");
  return (
    <>
      <PageTitle
        title="Databases"
        subtitle="How full each database is, how much room is left, and how fast it answers. Plan limits are set in Storage."
        actions={
          <Button size="sm" variant="outline" onClick={() => reload()}>
            Refresh
          </Button>
        }
      />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading rows={4} />}
      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <DbCard r={data.adb} />
          <DbCard r={data.ddb} />
        </div>
      )}
    </>
  );
}

function DbCard({ r }: { r: DbReport }) {
  if (!r.configured)
    return (
      <Panel title={r.name}>
        <p className="text-[13px] text-ink-3">
          {r.id === "ddb" ? (
            <>
              Not set up: WorksLake&apos;s data is in the ADB. <Link href="/platform/jobs-lake/data-db" className="text-brand-600 hover:underline">Set up a data database</Link>
            </>
          ) : (
            (r.error ?? "Not configured.")
          )}
        </p>
      </Panel>
    );
  const h = r.health;
  const share = r.percent == null ? null : r.percent / 100;
  const g = r.guard;
  return (
    <Panel title={r.name}>
      <p className="mb-3 text-[12.5px] text-ink-3">{r.holds}</p>
      {share != null && <Meter label={`${mb(r.sizeBytes)} of ${num(r.limitMb)} MB used`} value={share} judged={false} />}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Current size" value={mb(r.sizeBytes)} />
        <Stat label="Plan limit" value={`${num(r.limitMb)} MB`} />
        <Stat label="Headroom" value={mb(r.headroomBytes)} hint={r.percent == null ? undefined : `${Math.round((100 - r.percent) * 10) / 10}% free`} />
        <Stat label="Round trip" value={r.roundTripMs == null ? "—" : `${num(r.roundTripMs)} ms`} hint="One small read from the app" />
        <Stat label="Connections" value={h ? `${h.connections.total} of ${h.connections.max}` : "—"} hint={h ? `${h.connections.active} active` : undefined} />
        <Stat label="Cache hit" value={h?.cacheHitPct == null ? "—" : `${h.cacheHitPct}%`} hint="Reads served from memory; under 99% is slow" />
        <Stat label="Longest query now" value={h ? `${h.longestQuerySec} s` : "—"} />
        <Stat label="Rollbacks · deadlocks" value={h ? `${num(h.rollbacks)} · ${num(h.deadlocks)}` : "—"} hint={h ? `of ${num(h.commits)} commits` : undefined} />
        <Stat label="Up since" value={since(h?.startedAt ?? null)} />
      </div>
      <p className="mt-3 text-[12px] text-ink-3">
        Safeguards on this server: {g.active} requests running, {g.waiting} waiting{g.open ? " · backing off (the database was failing)" : ""}
        {g.refusedBusy + g.refusedBreaker + g.timedOut > 0 ? ` · ${num(g.refusedBusy + g.refusedBreaker)} refused, ${num(g.timedOut)} timed out since it started` : ""}.
      </p>
      {r.error && <p className="mt-2 text-[12px] text-danger-600">{r.error}</p>}
      {r.tables.length > 0 && (
        <Fold title="Largest tables" className="mt-3">
          <ul className="flex flex-col gap-1 pb-4 text-[12.5px] text-ink-2">
            {r.tables.map((t) => (
              <li key={t.name} className="flex justify-between gap-2">
                <span className="truncate">{t.name}</span>
                <span className="shrink-0 tabular-nums text-ink-3">
                  {num(t.rows)} rows · {mb(t.bytes)}
                </span>
              </li>
            ))}
          </ul>
        </Fold>
      )}
      {h && h.slowQueries.length > 0 && (
        <Fold title="Slowest queries" hint="By average time, since the statistics were last reset" className="mt-3">
          <ul className="flex flex-col gap-2 pb-4 text-[12px]">
            {h.slowQueries.map((q, i) => (
              <li key={i}>
                <span className="block break-all font-mono text-[11px] text-ink-2">{q.query}</span>
                <span className="text-ink-4">
                  {num(q.meanMs)} ms average · {num(q.calls)} calls · {num(Math.round(q.totalMs / 1000))} s in all
                </span>
              </li>
            ))}
          </ul>
        </Fold>
      )}
    </Panel>
  );
}
