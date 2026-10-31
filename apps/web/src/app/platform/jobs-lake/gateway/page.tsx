"use client";
import { useState } from "react";
import type { GatewayOverview, GatewayRunRow, GatewaySourceRow } from "@/server/gateway/admin";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { adminFetch, LoadError, Loading, ms, Note, num, PageTitle, Panel, ResponsiveTable, Stat, useAdmin } from "@/components/jobslake/ui";

const when = (iso: string | null | undefined) => (iso ? relativeTime(iso) : "—");
const every = (m: number) => (m >= 1440 ? `every ${Math.round(m / 1440)} d` : m >= 60 ? `every ${Math.round(m / 60)} h` : `every ${m} min`);

/**
 * The WorksLake gateway at work: what each source holds, when it last ran and how, how far a crawl has got, and every
 * run (scheduled, hourly, tests and "Collect now"), with today's use by WorksLake. Read from the gateway's own state.
 */
export default function GatewayPage() {
  const { data, error, reload } = useAdmin<GatewayOverview>("gateway");
  return (
    <>
      <PageTitle title="Gateway" subtitle="The external-data gateway's sources and crawler: what each holds, how its runs went, and how far a crawl has got. Collected every hour; each source runs on its own interval." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && !data.configured && <Note tone="warning">The gateway is not configured on this deployment (GATEWAY_ADMIN_TOKEN and GATEWAY_CURSOR_SECRET).</Note>}
      {data?.configured && <Overview data={data} reload={reload} />}
    </>
  );
}

function Overview({ data, reload }: { data: GatewayOverview; reload: () => void }) {
  const total = data.byModule.reduce((n, m) => n + m.listings, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Listings held" value={num(total)} hint={data.byModule.map((m) => `${m.module} ${num(m.listings)}`).join(" · ") || "none yet"} />
        <Stat label="Active sources" value={`${data.sources.filter((s) => s.enabled).length} of ${data.sources.length}`} />
        <Stat label="Runs, last 24 h" value={num(data.last24h.runs)} hint={`${num(data.last24h.ok)} ok · ${num(data.last24h.failed)} failed`} />
        <Stat label="Collected, last 24 h" value={num(data.last24h.collected)} hint="valid records read" />
      </div>
      <Panel title="Sources">
        <ResponsiveTable<GatewaySourceRow>
          rows={data.sources}
          rowKey={(s) => s.id}
          empty="No sources registered yet."
          columns={[
            { header: "Source", cell: (s) => <SourceName s={s} /> },
            { header: "Status", cell: (s) => <SourceStatus s={s} /> },
            { header: "Listings", cell: (s) => num(s.listings), className: "text-right" },
            { header: "Last run", cell: (s) => (s.lastError ? <span className="text-danger-600">{s.lastError}</span> : when(s.lastSuccessAt)) },
            { header: "Next", cell: (s) => (s.enabled ? `${when(s.nextRunAt)} (${every(s.intervalMinutes)})` : "—") },
            { header: "Crawl", cell: (s) => <CrawlCell s={s} /> },
            { header: "", cell: (s) => <CollectNow s={s} onDone={reload} /> },
          ]}
          card={(s) => (
            <div className="flex flex-col gap-1 text-[13px]">
              <SourceName s={s} />
              <SourceStatus s={s} />
              <span>
                {num(s.listings)} listings · last run {s.lastError ? <span className="text-danger-600">{s.lastError}</span> : when(s.lastSuccessAt)}
              </span>
              {s.enabled && <span className="text-ink-3">Next {when(s.nextRunAt)} ({every(s.intervalMinutes)})</span>}
              <CrawlCell s={s} />
              <CollectNow s={s} onDone={reload} />
            </div>
          )}
        />
      </Panel>
      <Panel title="Runs" action={<span className="text-[12px] text-ink-3">Newest 100</span>}>
        <ResponsiveTable<GatewayRunRow>
          rows={data.runs}
          rowKey={(r) => `${r.at}${r.sourceId}${r.trigger}`}
          empty="No runs yet."
          columns={[
            { header: "When", cell: (r) => when(r.at) },
            { header: "Source", cell: (r) => r.source },
            { header: "Kind", cell: (r) => (r.trigger === "test" ? "Test" : "Collect") },
            { header: "Result", cell: (r) => <RunResult r={r} /> },
            { header: "Pages", cell: (r) => (r.read != null ? `${r.read}${r.failed ? ` (${r.failed} failed)` : ""}` : "—") },
            { header: "Time", cell: (r) => ms(r.ms) },
          ]}
          card={(r) => (
            <div className="flex flex-col gap-0.5 text-[13px]">
              <span className="font-medium text-ink">{r.source}</span>
              <span className="text-ink-3">
                {when(r.at)} · {r.trigger === "test" ? "Test" : "Collect"} · {ms(r.ms)}
                {r.read != null ? ` · ${r.read} pages` : ""}
              </span>
              <RunResult r={r} />
            </div>
          )}
        />
      </Panel>
      <Panel title="WorksLake's use today">
        {data.usageToday.length ? (
          <ul className="flex flex-col gap-1 text-[13px]">
            {data.usageToday.map((u) => (
              <li key={u.route + u.module}>
                <span className="font-medium text-ink">{u.module}</span> <span className="text-ink-3">{u.route}</span> — {num(u.calls)} calls, {num(u.results)} results
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-3">No calls today.</p>
        )}
      </Panel>
    </div>
  );
}

function SourceName({ s }: { s: GatewaySourceRow }) {
  return (
    <span className="flex flex-col">
      <span className="font-medium text-ink">{s.name}</span>
      <span className="text-[12px] text-ink-3">
        {s.host} · {s.kind === "crawl" ? "crawler" : s.kind === "json_api" ? "API" : s.kind === "rss" ? "RSS" : "page"} · {s.modules.join(", ")}
      </span>
    </span>
  );
}

function SourceStatus({ s }: { s: GatewaySourceRow }) {
  if (s.enabled) return <span className={s.lastError ? "text-danger-600" : "text-success-700"}>{s.lastError ? "Active, last run failed" : "Active"}</span>;
  return <span className="text-ink-3">{s.lastTest ? (s.lastTest.ok ? `Paused · test passed ${when(s.lastTest.at)}` : `Paused · test failed ${when(s.lastTest.at)}`) : "Paused · not tested"}</span>;
}

function CrawlCell({ s }: { s: GatewaySourceRow }) {
  if (!s.crawl) return <span className="text-ink-3">whole feed each run</span>;
  return (
    <span className="text-[12px]">
      {s.crawl.pagesPerRun} pages/run
      {s.crawl.progress ? ` · ${s.crawl.progress}` : ""}
      {s.crawl.lastRead != null ? ` · last read ${s.crawl.lastRead}${s.crawl.lastFailed ? `, ${s.crawl.lastFailed} failed` : ""}` : ""}
    </span>
  );
}

function RunResult({ r }: { r: GatewayRunRow }) {
  if (!r.ok) return <span className="text-danger-600">Failed{r.code ? ` · ${r.code}` : ""}</span>;
  return (
    <span className="text-success-700">
      {num(r.valid)} of {num(r.discovered)} valid{r.kept != null ? ` · ${num(r.kept)} held` : ""}
    </span>
  );
}

function CollectNow({ s, onDone }: { s: GatewaySourceRow; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!s.enabled) return null;
  return (
    <span className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await adminFetch<{ ok: boolean; valid?: number; code?: string }>("gateway", { method: "POST", body: JSON.stringify({ sourceId: s.id }) });
          setBusy(false);
          setMsg(r.ok ? `${num(r.data.valid)} collected` : r.error.message);
          onDone();
        }}
      >
        Collect now
      </Button>
      {msg && <span className="text-[12px] text-ink-3">{msg}</span>}
    </span>
  );
}
