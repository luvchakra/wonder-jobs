"use client";
import { useState } from "react";
import type { GatewayOverview, GatewayRunRow, GatewaySourceRow } from "@/server/gateway/admin";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
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
      <AddPartner onDone={reload} />
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
        {s.host} · {s.kind === "crawl" ? "crawler" : s.kind === "json_api" ? "API" : s.kind === "rss" ? "RSS" : s.kind === "upload" ? "partner upload" : "page"} · {s.modules.join(", ")}
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
  if (s.kind === "upload") return <PartnerActions s={s} onDone={onDone} />;
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

const MODULES = [
  ["jobs", "Jobs"],
  ["internships", "Internships"],
  ["teaching", "Teaching"],
  ["services", "Services"],
  ["therapists", "Therapists"],
  ["cofounders", "Co-founders"],
  ["events", "Events"],
  ["marketplace", "Marketplace"],
] as const;
/** Modules whose listings are about people or their work: the partner must confirm each person opted in. */
const SENSITIVE = new Set(["therapists", "cofounders", "services", "marketplace"]);

/** The upload template: one header line and one example row (an event's start date as an `attr_` column). */
const TEMPLATE = [
  "id,title,organization,url,town,region,country,description,posted_at,organization_url,attr_starts_at",
  'p-001,"Example listing title",Example Organisation,https://example.org/listing/1,Pune,Maharashtra,India,"What it is, in a sentence or two.",2026-11-01,https://example.org,',
].join("\n");

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE + "\n"], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "workslake-partner-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * A partner who gave written permission (an association, a cooperative, a placement cell…): registered once against
 * one module, then its list is uploaded on its row in Sources. Registered paused; activate it once an upload reads well.
 */
function AddPartner({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", website: "", module: "", permissionEvidence: "", consentVerified: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const sensitive = SENSITIVE.has(f.module);
  const ready = f.name.trim() && /^https:\/\//i.test(f.website.trim()) && f.module && f.permissionEvidence.trim().length >= 8 && (!sensitive || f.consentVerified);
  return (
    <Fold title="Add a partner" hint="For a partner who gave written permission to list its entries. Upload its list on its row in Sources.">
      <form
        className="flex flex-col gap-3 pb-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg(null);
          const r = await adminFetch<{ id?: string }>("gateway", { method: "POST", body: JSON.stringify({ action: "register", ...f }) });
          setBusy(false);
          if (!r.ok) return setMsg(r.error.message);
          setMsg("Added (paused). Upload its list on its row in Sources.");
          setF({ name: "", website: "", module: "", permissionEvidence: "", consentVerified: false });
          onDone();
        }}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Partner" htmlFor="gp-name" required>
            <Input id="gp-name" value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Website" htmlFor="gp-site" required>
            <Input id="gp-site" type="url" placeholder="https://" value={f.website} maxLength={300} onChange={(e) => setF({ ...f, website: e.target.value })} />
          </Field>
          <Field label="Module" htmlFor="gp-module" required>
            <Select id="gp-module" value={f.module} onChange={(e) => setF({ ...f, module: e.target.value, consentVerified: false })}>
              <option value="">Choose…</option>
              {MODULES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Permission given" htmlFor="gp-perm" hint="Who agreed, when, and where it's kept (e.g. “Email from the secretary, 1 Nov 2026, in Drive › Partners”)." required>
          <Textarea id="gp-perm" rows={2} maxLength={500} value={f.permissionEvidence} onChange={(e) => setF({ ...f, permissionEvidence: e.target.value })} />
        </Field>
        {sensitive && (
          <label className="flex items-start gap-2 text-[13px] text-ink-2">
            <input type="checkbox" className="mt-1" checked={f.consentVerified} onChange={(e) => setF({ ...f, consentVerified: e.target.checked })} />
            The partner confirms every person in its list agreed to be listed.
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" loading={busy} disabled={!ready}>
            Add partner
          </Button>
          <button type="button" className="text-[13px] font-medium text-primary-600 hover:underline" onClick={downloadTemplate}>
            Download the template
          </button>
          {msg && <span className="text-[12px] text-ink-3">{msg}</span>}
        </div>
      </form>
    </Fold>
  );
}

interface UploadReport { ok?: boolean; rows?: number; valid?: number; discovered?: number; repeats?: number; kept?: number | null; problems?: string[] }

/** A partner's row: upload its list (CSV or JSON, under 2 MB), then activate or pause it. */
function PartnerActions({ s, onDone }: { s: GatewaySourceRow; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const fileId = `gp-file-${s.id}`;
  async function upload(file: File) {
    setMsg(null);
    setProblems([]);
    const format = /\.json$/i.test(file.name) ? "json" : /\.csv$/i.test(file.name) ? "csv" : null;
    if (!format) return setMsg("Choose a .csv or .json file.");
    if (file.size > 2_000_000) return setMsg("The file must be under 2 MB.");
    setBusy(true);
    const r = await adminFetch<UploadReport>("gateway", { method: "POST", body: JSON.stringify({ action: "upload", sourceId: s.id, format, content: await file.text() }) });
    setBusy(false);
    if (!r.ok) return setMsg(r.error.message);
    const d = r.data;
    setProblems(d.problems ?? []);
    setMsg(d.ok ? `${num(d.kept ?? d.valid)} listings kept from ${num(d.rows)} rows` : `Not kept: only ${num(d.valid)} of ${num(d.discovered)} rows read well (90% needed)`);
    onDone();
  }
  async function toggle() {
    setBusy(true);
    setMsg(null);
    const r = await adminFetch("gateway", { method: "POST", body: JSON.stringify({ action: s.enabled ? "pause" : "activate", sourceId: s.id }) });
    setBusy(false);
    if (!r.ok) setMsg(r.error.message);
    onDone();
  }
  return (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2">
        <label htmlFor={fileId} className="cursor-pointer rounded-full border border-line px-3 py-1 text-[13px] font-medium text-ink hover:bg-bg-soft">
          Upload list
        </label>
        <input
          id={fileId}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
        {(s.enabled || s.listings > 0) && (
          <Button size="sm" variant="outline" loading={busy} onClick={toggle}>
            {s.enabled ? "Pause" : "Activate"}
          </Button>
        )}
      </span>
      {msg && <span className="text-[12px] text-ink-3">{msg}</span>}
      {problems.map((p) => (
        <span key={p} className="text-[12px] text-danger-600">
          {p}
        </span>
      ))}
    </span>
  );
}
