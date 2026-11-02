"use client";
import Link from "next/link";
import { ArrowRight, ChevronDown, Play } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import type { ImportAction, ImportModule, ImportRow, ImportView } from "@/server/jobslake/importView";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Field, Input, Select, Switch, Textarea } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { DataTypes } from "@/components/jobslake/DataTypes";
import { adminFetch, LoadError, Loading, ms, Note, PageTitle, Panel, ResponsiveTable, Stat, num, useAdmin } from "@/components/jobslake/ui";
import { MODULES } from "@/modules/registry";
import { relativeTime } from "@/lib/format";

const when = (iso: string | null | undefined) => (iso ? relativeTime(iso) : "—");
const post = (body: Record<string, unknown>) => adminFetch<Record<string, unknown>>("import", { method: "POST", body: JSON.stringify(body) });

const STATE: Record<ImportRow["state"], { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  live: { label: "Live", tone: "success" },
  waiting: { label: "Waiting", tone: "info" },
  needs_you: { label: "Needs you", tone: "warning" },
  down: { label: "Down", tone: "danger" },
  off: { label: "Off", tone: "neutral" },
};

/**
 * Admin → Data → Import (owner, 2026-11-02): the whole way from a source to a listing in Find, managed here and
 * nowhere else. One press, Import now, runs the pipeline on the server: it sets up the sources that are waiting,
 * collects, and refreshes every module's Find. The same job runs every hour. Each module shows its three numbers
 * (sources, collected, in Find) and, opened, its sources with one state and one action each.
 */
export default function ImportPage() {
  const { data, error, reload } = useAdmin<ImportView>("import");
  const [starting, setStarting] = useState(false);
  const running = !!data?.job?.running;
  // While an import runs, the page re-reads it every 10 s (only while shown); nothing runs once it's done.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 10_000);
    return () => clearInterval(t);
  }, [running, reload]);

  const importNow = async () => {
    setStarting(true);
    const r = await post({ action: "import" });
    setStarting(false);
    if (r.ok) toast.success("Import started", Number(r.data.queued) ? `${num(Number(r.data.queued))} sources to set up first; then every module's Find is refreshed. You can leave this page.` : "Collecting, then refreshing every module's Find. You can leave this page.");
    else toast.error("Didn't start", r.error.message);
    reload();
  };

  return (
    <>
      <PageTitle
        title="Import"
        subtitle="How listings get from sources into Find, for every module. Import now sets up waiting sources, collects, and refreshes Find; the same job runs every hour. Each module can be imported on its own or paused; each source has Details for what it did lately and the ways to fix or pause it."
        actions={
          <Button icon={<Play className="size-4" aria-hidden />} loading={starting} disabled={running || !data?.gatewayConfigured} onClick={() => void importNow()}>
            {running ? "Importing…" : "Import now"}
          </Button>
        }
      />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading rows={4} />}
      {data && !data.gatewayConfigured && <Note tone="warning">The gateway isn&apos;t configured on this deployment (GATEWAY_ADMIN_TOKEN and GATEWAY_CURSOR_SECRET), so only WorksLake&apos;s own sources bring listings in.</Note>}
      {data && (
        <div className="flex flex-col gap-4">
          <Pipeline d={data} />
          <JobLine d={data} reload={reload} />
          <div className="flex flex-col gap-3">
            {data.modules.map((m) => (
              <ModuleCard key={m.id} m={m} busy={running} reload={reload} />
            ))}
          </div>
          <AddSources reload={reload} />
          <RecentRuns d={data} />
          <DataTypes />
        </div>
      )}
    </>
  );
}

/** The three stages and their totals, left to right. */
function Pipeline({ d }: { d: ImportView }) {
  const p = d.pipeline;
  const arrow = <ArrowRight className="hidden size-5 shrink-0 self-center text-ink-4 lg:block" aria-hidden />;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
      <Stat label="Sources live" value={num(p.sources.live)} hint={[p.sources.waiting ? `${num(p.sources.waiting)} waiting` : "", p.sources.needsYou ? `${num(p.sources.needsYou)} need you` : ""].filter(Boolean).join(" · ") || "Nothing waiting"} />
      {arrow}
      <Stat label="Collected by the gateway" value={num(p.collected.listings)} hint={p.collected.lastAt ? `Last ${when(p.collected.lastAt)}${p.collected.nextAt ? ` · next ${when(p.collected.nextAt)}` : ""}` : "Not collected yet"} />
      {arrow}
      <Stat label="In Find" value={p.find.listings == null ? "—" : num(p.find.listings)} hint={p.find.refreshedAt ? `Refreshed ${when(p.find.refreshedAt)}` : "Not refreshed from the gateway yet: press Import now"} />
    </div>
  );
}

/** What the server is doing, what it last did, and the hourly schedule's one option. */
function JobLine({ d, reload }: { d: ImportView; reload: () => void }) {
  const j = d.job;
  const [saving, setSaving] = useState(false);
  return (
    <Panel>
      <div className="flex flex-col gap-2 text-[13px] text-ink-2">
        {j?.running && (
          <p>
            <span className="font-medium text-ink">Importing on the server:</span> {j.done} of {j.total} sources set up. Then every module&apos;s Find is refreshed. You can leave this page.
          </p>
        )}
        {j && !j.running && (
          <p>
            <span className="font-medium text-ink">Last import {when(j.finishedAt)}:</span> {num(j.live)} of {num(j.total)} sources went live
            {j.failed.length ? ` · not live: ${j.failed.map((f) => `${f.name} (${f.step ?? "failed"}: ${f.message ?? ""})`).join("; ")}` : ""}.
            {Object.keys(d.pipeline.find.stored).length ? ` In Find: ${Object.entries(d.pipeline.find.stored).map(([m, n]) => `${num(n)} ${MODULES.find((x) => x.id === m)?.label ?? m}`).join(", ")}.` : ""}
          </p>
        )}
        {!j && d.lastRun && (
          <p>
            <span className="font-medium text-ink">Last hourly run {when(d.lastRun.finishedAt)}:</span> {d.lastRun.summary}.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-ink-3">{d.schedule.cronSet ? "Runs every hour: collects what's due and refreshes Find for anything new." : "CRON_SECRET isn't set, so the hourly run can't reach this deployment."}</span>
          <Switch
            label="Also set up waiting sources every hour"
            checked={d.schedule.activateWaiting}
            disabled={saving}
            onChange={async (v) => {
              setSaving(true);
              const r = await post({ action: "schedule", activateWaiting: v });
              setSaving(false);
              if (!r.ok) toast.error("Couldn't save", r.error.message);
              reload();
            }}
          />
        </div>
      </div>
    </Panel>
  );
}

/**
 * One module: its three numbers, its import switch and "Import this module", and its sources when opened. Open by
 * default when something needs doing. A paused module is not collected, set up or refreshed; what Find has stays.
 */
function ModuleCard({ m, busy: jobRunning, reload }: { m: ImportModule; busy: boolean; reload: () => void }) {
  const [open, setOpen] = useState(m.waiting + m.needsYou + (m.paused ? 1 : 0) > 0 || m.problems.length > 0);
  const [busy, setBusy] = useState<"pause" | "import" | null>(null);
  const pause = async (paused: boolean) => {
    setBusy("pause");
    const r = await post({ action: "module_pause", module: m.id, paused });
    setBusy(null);
    if (!r.ok) toast.error("Couldn't change it", r.error.message);
    else toast.success(paused ? `${m.label} import paused` : `${m.label} import resumed`, paused ? "Nothing new is collected or stored for it until you resume. What Find has stays." : "The next hourly run includes it again.");
    reload();
  };
  const importNow = async () => {
    setBusy("import");
    const r = await post({ action: "module_import", module: m.id });
    setBusy(null);
    if (r.ok) toast.success(`${m.label}: import started`, `${num(Number(r.data.queued))} steps on the server; then Find is refreshed.`);
    else toast.error("Didn't start", r.error.message);
    reload();
  };
  return (
    <Panel className={m.paused ? "opacity-80" : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-left">
          <span className="flex min-w-0 items-center gap-2">
            <ChevronDown className={`size-4 shrink-0 text-ink-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                {m.label}
                {m.paused && <Badge tone="neutral">Import paused</Badge>}
              </span>
              <span className="block text-[12px] text-ink-3">{m.dataType}</span>
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] tabular-nums text-ink-2">
            <span>
              {num(m.live)} live
              {m.waiting ? <Badge tone="info" className="ml-1.5">{num(m.waiting)} waiting</Badge> : null}
              {m.needsYou ? <Badge tone="warning" className="ml-1.5">{num(m.needsYou)} need you</Badge> : null}
              {m.problems.length && !m.needsYou ? <Badge tone="danger" className="ml-1.5">{num(m.problems.length)} down</Badge> : null}
            </span>
            <span className="text-ink-4">→</span>
            <span>{num(m.collected)} collected</span>
            <span className="text-ink-4">→</span>
            <span className="font-medium text-ink">{m.inFind == null ? "—" : num(m.inFind)} in Find</span>
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-3">
          <Switch label={`Import ${m.label}`} checked={!m.paused} disabled={!!busy} onChange={(on) => void pause(!on)} />
          <Button size="sm" variant="outline" loading={busy === "import"} disabled={!!busy || jobRunning || m.paused || (m.live + m.waiting === 0)} onClick={() => void importNow()}>
            Import this module
          </Button>
        </span>
      </div>
      {!open && m.problems.length > 0 && <p className="mt-2 text-[12px] text-danger-600">{m.problems.slice(0, 2).join(" · ")}{m.problems.length > 2 ? ` · +${m.problems.length - 2} more` : ""}</p>}
      {open && (
        <ul className="mt-3 flex flex-col divide-y divide-line border-t border-line">
          {m.rows.length ? m.rows.map((r) => <Row key={r.id} r={r} reload={reload} />) : <li className="py-3 text-[13px] text-ink-4">No sources yet. Add one below.</li>}
        </ul>
      )}
    </Panel>
  );
}

/** One action button, for a row's main action and its Details. */
function ActionButton({ a, rowId, busy, act, setBusy, setMsg, reload, size = "sm" }: { a: ImportAction; rowId: string; busy: boolean; act: (body: Record<string, unknown>, done: (d: Record<string, unknown>) => string) => Promise<void>; setBusy: (b: boolean) => void; setMsg: (m: string | null) => void; reload: () => void; size?: "sm" }) {
  if (a.kind === "link")
    return (
      <Link href={a.href} className="text-[12px] font-medium text-brand-600 hover:underline">
        {a.label}
      </Link>
    );
  if (a.kind === "upload") return <Upload sourceId={a.sourceId} busy={busy} setBusy={setBusy} setMsg={setMsg} reload={reload} />;
  const body: Record<string, unknown> =
    a.kind === "run" ? { action: "item", id: rowId }
    : a.kind === "decide" ? { action: "decide", decision: a.decision, done: true }
    : a.kind === "source_status" ? { action: "source_status", id: a.id, status: a.status }
    : { action: a.kind, sourceId: a.sourceId };
  const done = (d: Record<string, unknown>) =>
    a.kind === "run" ? `Live · ${num(Number(d.valid ?? 0))} listings`
    : a.kind === "decide" ? "Decided"
    : a.kind === "pause" ? "Paused"
    : a.kind === "activate" ? "Live"
    : a.kind === "collect" ? `Collected · ${num(Number(d.valid ?? 0))} listings`
    : a.kind === "test" ? (d.ok === false ? `Test didn't pass: ${num(Number(d.valid ?? 0))} of ${num(Number(d.discovered ?? 0))} read well` : `Test passed · ${num(Number(d.valid ?? 0))} read well`)
    : a.kind === "source_status" && a.status === "paused" ? "Paused" : "Resumed";
  return (
    <Button size={size} variant="outline" loading={busy} onClick={() => void act(body, done)}>
      {a.label}
    </Button>
  );
}

/** A source: its state, a line on it, its one action, and Details (what it did lately, and the ways to fix or pause it). */
function Row({ r, reload }: { r: ImportRow; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const s = STATE[r.state];
  const act = async (body: Record<string, unknown>, done: (d: Record<string, unknown>) => string) => {
    setBusy(true);
    setMsg(null);
    const res = await post(body);
    setBusy(false);
    if (res.ok) setMsg(done(res.data));
    else setMsg(res.error.message);
    reload();
  };
  const shared = { rowId: r.id, busy, act, setBusy, setMsg, reload };
  return (
    <li className="py-2.5 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={s.tone}>{s.label}</Badge>
            <span className="font-medium text-ink">{r.name}</span>
            <span className="text-[12px] text-ink-4">{r.kind}</span>
            {(r.history.length > 0 || r.more.length > 0) && (
              <button type="button" onClick={() => setDetails((d) => !d)} aria-expanded={details} className="text-[12px] text-ink-3 hover:text-ink">
                {details ? "Hide details" : "Details"}
              </button>
            )}
          </span>
          <span className="mt-0.5 block text-[12px] text-ink-3">{msg ?? r.detail}</span>
        </span>
        {r.action && <ActionButton a={r.action} {...shared} />}
      </div>
      {details && (
        <div className="mt-2 flex flex-col gap-2 rounded-[10px] bg-bg-soft px-3 py-2">
          {r.history.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
              {r.history.map((h) => (
                <Fragment key={h.label}>
                  <dt className="text-ink-4">{h.label}</dt>
                  <dd className="text-ink-2">{h.value}</dd>
                </Fragment>
              ))}
            </dl>
          )}
          {r.more.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {r.more.map((a) => (
                <ActionButton key={a.label} a={a} {...shared} />
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

interface UploadReport { ok?: boolean; rows?: number; valid?: number; discovered?: number; kept?: number | null; problems?: string[] }

/** A partner's list (CSV or JSON, under 2 MB). */
function Upload({ sourceId, busy, setBusy, setMsg, reload }: { sourceId: string; busy: boolean; setBusy: (b: boolean) => void; setMsg: (m: string | null) => void; reload: () => void }) {
  const id = `up-${sourceId}`;
  return (
    <>
      <label htmlFor={id} className={`cursor-pointer rounded-full border border-line px-3 py-1 text-[12px] font-medium text-ink hover:bg-bg-soft ${busy ? "opacity-60" : ""}`}>
        Upload list
      </label>
      <input
        id={id}
        type="file"
        accept=".csv,.json,text/csv,application/json"
        className="sr-only"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const format = /\.json$/i.test(file.name) ? "json" : /\.csv$/i.test(file.name) ? "csv" : null;
          if (!format) return setMsg("Choose a .csv or .json file.");
          if (file.size > 2_000_000) return setMsg("The file must be under 2 MB.");
          setBusy(true);
          const r = await adminFetch<UploadReport>("import", { method: "POST", body: JSON.stringify({ action: "upload", sourceId, format, content: await file.text() }) });
          setBusy(false);
          if (!r.ok) setMsg(r.error.message);
          else setMsg(r.data.ok ? `${num(r.data.kept ?? r.data.valid)} listings kept from ${num(r.data.rows)} rows${r.data.problems?.length ? ` · ${r.data.problems.join("; ")}` : ""}` : `Not kept: only ${num(r.data.valid)} of ${num(r.data.discovered)} rows read well (90% needed)`);
          reload();
        }}
      />
    </>
  );
}

const PARTNER_MODULES = MODULES.map((m) => [m.id, m.label] as const);
/** Modules whose listings are about people or their work: the partner must confirm each person opted in. */
const SENSITIVE = new Set(["therapists", "cofounders", "services", "marketplace"]);
const TEMPLATE = [
  "id,title,organization,url,town,region,country,description,posted_at,organization_url,attr_starts_at",
  'p-001,"Example listing title",Example Organisation,https://example.org/listing/1,Pune,Maharashtra,India,"What it is, in a sentence or two.",2026-11-01,https://example.org,',
].join("\n");

/** Ways to bring a new source in: WorksLake's own (a wizard) or a partner who gave written permission (a form here). */
function AddSources({ reload }: { reload: () => void }) {
  const [f, setF] = useState({ name: "", website: "", module: "", permissionEvidence: "", consentVerified: false });
  const [busy, setBusy] = useState(false);
  const sensitive = SENSITIVE.has(f.module);
  const ready = f.name.trim() && /^https:\/\//i.test(f.website.trim()) && f.module && f.permissionEvidence.trim().length >= 8 && (!sensitive || f.consentVerified);
  return (
    <Fold title="Add a source" hint="A careers site, API or feed WorksLake asks itself; or a partner's list, uploaded with their written permission. Reviewed catalogue sources are already listed under their module.">
      <div className="flex flex-col gap-4 pb-4">
        <p className="text-[13px] text-ink-2">
          <Link href="/platform/jobs-lake/add" className="font-medium text-brand-600 hover:underline">
            Add a careers site, API or feed
          </Link>
          <span className="text-ink-3"> · WorksLake asks it on each search, and it goes live once its test passes.</span>
        </p>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = await post({ action: "register", ...f });
            setBusy(false);
            if (!r.ok) return toast.error("Couldn't add the partner", r.error.message);
            toast.success("Partner added", "Upload its list on its row under its module; it goes live when the list reads well.");
            setF({ name: "", website: "", module: "", permissionEvidence: "", consentVerified: false });
            reload();
          }}
        >
          <p className="text-[13px] font-medium text-ink">Add a partner</p>
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
                {PARTNER_MODULES.map(([v, l]) => (
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
            <button
              type="button"
              className="text-[13px] font-medium text-brand-600 hover:underline"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([TEMPLATE + "\n"], { type: "text/csv" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = "workslake-partner-template.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download the template
            </button>
          </div>
        </form>
      </div>
    </Fold>
  );
}

/** The gateway's last collections and tests. */
function RecentRuns({ d }: { d: ImportView }) {
  return (
    <Fold title="Recent collections" hint={d.recentRuns.length ? `Newest ${d.recentRuns.length}` : "None yet"}>
      <div className="pb-4">
        <ResponsiveTable
          rows={d.recentRuns}
          rowKey={(r) => `${r.at}${r.sourceId}${r.trigger}`}
          empty="No collections yet."
          columns={[
            { header: "When", cell: (r) => when(r.at) },
            { header: "Source", cell: (r) => r.source },
            { header: "Kind", cell: (r) => (r.trigger === "test" ? "Test" : r.trigger === "ingest" ? "Delivered" : "Collect") },
            { header: "Result", cell: (r) => (r.ok ? `${num(r.valid)} listings` : <span className="text-danger-600">{r.code ?? "failed"}</span>) },
            { header: "Time", cell: (r) => ms(r.ms) },
          ]}
          card={(r) => (
            <div className="flex flex-col gap-0.5 text-[13px]">
              <span className="font-medium text-ink">{r.source}</span>
              <span className="text-ink-3">
                {when(r.at)} · {r.trigger === "test" ? "Test" : r.trigger === "ingest" ? "Delivered" : "Collect"} · {ms(r.ms)}
              </span>
              <span>{r.ok ? `${num(r.valid)} listings` : <span className="text-danger-600">{r.code ?? "failed"}</span>}</span>
            </div>
          )}
        />
      </div>
    </Fold>
  );
}
