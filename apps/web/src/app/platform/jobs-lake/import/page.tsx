"use client";
import { explainFailure, failureSummary } from "@/domain/gateway/failure";
import Link from "next/link";
import { ArrowRight, ChevronDown, Play } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import type { ImportAction, ImportModule, ImportRow, ImportView } from "@/server/jobslake/importView";
import type { ImportRun } from "@/server/gateway/importRuns";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Field, Input, Select, Switch, Textarea } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { DataTypes } from "@/components/jobslake/DataTypes";
import { adminFetch, LoadError, Loading, Note, PageTitle, Panel, Stat, num, useAdmin } from "@/components/jobslake/ui";
import { MODULES } from "@/modules/registry";
import { relativeTime } from "@/lib/format";
import { SCHEDULE_LINE, TRIGGER_EVERY_HOURS } from "@/domain/gateway/budget";

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
 * collects, and refreshes every module's Find. The same job runs on a schedule that fits the free plans (domain/gateway/budget.ts). Each module shows its three numbers
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
    }, 5_000);
    return () => clearInterval(t);
  }, [running, reload]);

  const importNow = async () => {
    setStarting(true);
    const r = await post({ action: "import" });
    setStarting(false);
    const skipped = r.ok && Number(r.data.skipped) ? ` ${num(Number(r.data.skipped))} that didn't go live in the last day are left out; each has Try again on its module's card.` : "";
    if (r.ok) toast.success("Import started", (Number(r.data.queued) ? `${num(Number(r.data.queued))} sources to set up first; then every module's Find is refreshed.` : "Collecting, then refreshing every module's Find.") + skipped + " You can leave this page.");
    else toast.error("Didn't start", r.error.message);
    reload();
  };

  return (
    <>
      <PageTitle
        title="Import"
        subtitle="How listings get from sources into Find, for every module. Import now sets up waiting sources, collects, and refreshes Find; the same job runs on its own every few hours. Each module can be imported on its own or paused; each source has Details for what it did lately and the ways to fix or pause it."
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
          <ProgressBanner d={data} />
          <Pipeline d={data} />
          <Schedule d={data} reload={reload} />
          <div className="flex flex-col gap-3">
            {data.modules.map((m) => (
              <ModuleCard key={m.id} m={m} busy={running} reload={reload} />
            ))}
          </div>
          <AddSources reload={reload} />
          <RunHistory runs={data.runs} />
          <Emails d={data} reload={reload} />
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
      <Stat label="Collected by the gateway" value={num(p.collected.listings)} hint={p.collected.lastAt ? `Last ${when(p.collected.lastAt)}${p.collected.nextAt ? ` · next ${Date.parse(p.collected.nextAt) <= Date.parse(d.generatedAt) ? "due at the next scheduled run" : when(p.collected.nextAt)}` : ""}` : "Not collected yet"} />
      {arrow}
      <Stat label="In Find" value={p.find.listings == null ? "—" : num(p.find.listings)} hint={p.find.refreshedAt ? `Refreshed ${when(p.find.refreshedAt)}` : "Not refreshed from the gateway yet: press Import now"} />
    </div>
  );
}

/**
 * The import's progress, read from the database (wj.setupjob), so a reload shows exactly where it is (owner,
 * 2026-11-02): a bar, the source being worked on and its step, counts so far, and every source in a fold. After it
 * finishes, its outcome stays for a day.
 */
function ProgressBanner({ d }: { d: ImportView }) {
  const j = d.job;
  if (!j) return null;
  const pct = j.total ? Math.round((j.done / j.total) * 100) : 100;
  const what = j.kind === "module" ? `Importing ${MODULES.find((m) => m.id === j.module)?.label ?? j.module}` : "Importing";
  const tone = j.running ? "border-brand-200 bg-brand-50" : j.failed ? "border-warning-100 bg-warning-100/40" : "border-success-100 bg-success-100/40";
  return (
    <div role="status" aria-live="polite" className={`rounded-[14px] border px-4 py-3 text-[13px] ${tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-semibold text-ink">
          {j.running ? (j.phase === "refreshing" ? "Refreshing Find for every module…" : `${what}: ${num(j.done)} of ${num(j.total)} sources`) : `Last import finished ${when(j.finishedAt)}`}
        </p>
        <p className="text-[12px] text-ink-3">
          Started {when(j.startedAt)} by {j.trigger === "scheduler" ? "the scheduled run" : j.by}
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70" aria-hidden>
        <div className={`h-full rounded-full ${j.running ? "bg-brand-500" : j.failed ? "bg-warning-600" : "bg-success-600"} transition-[width]`} style={{ width: `${j.running && j.phase === "refreshing" ? 100 : pct}%` }} />
      </div>
      <p className="mt-2 text-[12.5px] text-ink-2">
        {j.running && j.current ? (
          <>
            Now: <span className="font-medium text-ink">{j.current.name}</span>
            {j.current.step ? ` · ${j.current.step}` : ""}
            {j.current.since ? ` · ${when(j.current.since)}` : ""} ·{" "}
          </>
        ) : null}
        {num(j.live)} live · {num(j.failed)} didn&apos;t go live{j.failed ? ` (${failureSummary(j.items)})` : ""} · {num(j.total - j.done)} to go
        {j.stored && Object.keys(j.stored).length ? ` · In Find: ${Object.entries(j.stored).map(([m, n]) => `${num(n)} ${MODULES.find((x) => x.id === m)?.label ?? m}`).join(", ")}` : ""}
        {j.running ? ". It runs on the server; you can leave this page." : "."}
      </p>
      {j.stalled && <ContinueImport />}
      <RunItems items={j.items} />
    </div>
  );
}

/** A running import no server has picked up for a while: one press carries it on (the scheduled run would, later). */
function ContinueImport() {
  const [busy, setBusy] = useState(false);
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-warning-600">
      It has paused: no server has worked on it for a few minutes.
      <Button
        size="sm"
        variant="outline"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const r = await post({ action: "continue" });
          setBusy(false);
          if (!r.ok) toast.error("Couldn't continue it", r.error.message);
          else toast.success("Continuing on the server", "This page shows where it gets to.");
        }}
      >
        Continue
      </Button>
    </p>
  );
}

const ITEM_TONE: Record<string, string> = { live: "text-success-600", collected: "text-success-600", failed: "text-danger-600", running: "text-brand-600", pending: "text-ink-4" };
const ITEM_LABEL: Record<string, string> = { live: "Live", collected: "Collected", failed: "Didn't go live", running: "Working", pending: "Waiting" };

/** A run's sources, folded: each one's outcome and, when it failed, the step and why. */
function RunItems({ items }: { items: { name: string; status: string; step?: string; message?: string; valid?: number }[] }) {
  if (!items.length) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[12px] font-medium text-brand-600">Every source ({num(items.length)})</summary>
      <ul className="mt-1.5 flex flex-col divide-y divide-line/60 text-[12px]">
        {items.map((i, n) => (
          <li key={`${i.name}-${n}`} className="py-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="min-w-0 text-ink-2">{i.name}</span>
              <span className={ITEM_TONE[i.status] ?? "text-ink-3"}>
                {i.status === "failed" ? explainFailure(i.step, i.message).label : (ITEM_LABEL[i.status] ?? i.status)}
                {i.valid != null && (i.status === "live" || i.status === "collected") ? ` · ${num(i.valid)} listings` : ""}
                {i.status === "running" && i.step ? ` · ${i.step}` : ""}
              </span>
            </div>
            {i.status === "failed" && <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{explainFailure(i.step, i.message).detail}</p>}
          </li>
        ))}
      </ul>
    </details>
  );
}

const RUN_KIND: Record<ImportRun["kind"], string> = { import: "Import now", module: "Module import", hourly: "Scheduled collection" };

/** Every run, newest first, each folded to its sources (owner, 2026-11-02: "persist every run detail in folded form"). */
function RunHistory({ runs }: { runs: ImportRun[] }) {
  return (
    <Fold title="Runs" hint={runs.length ? `The newest ${num(runs.length)}, each with what happened to every source` : "None yet"}>
      <ul className="flex flex-col divide-y divide-line pb-4">
        {runs.map((r) => (
          <li key={`${r.id}-${r.finishedAt}`} className="py-2 text-[13px]">
            <details>
              <summary className="cursor-pointer">
                <span className="font-medium text-ink">
                  {RUN_KIND[r.kind]}
                  {r.module ? ` · ${MODULES.find((m) => m.id === r.module)?.label ?? r.module}` : ""}
                </span>
                <span className="text-ink-3">
                  {" "}
                  · {when(r.finishedAt)}
                  {r.repeats && r.repeats > 1 ? ` · ${r.repeats} runs with nothing new since ${when(r.startedAt)}` : ""} · {r.trigger === "cron" ? "scheduled" : r.trigger === "scheduler" ? "scheduled set-up" : (r.by ?? "admin")}
                </span>
                <span className="block text-[12px] text-ink-3">{r.summary}</span>
              </summary>
              <div className="mt-1 pl-3">
                {r.stored && Object.keys(r.stored).length > 0 && (
                  <p className="text-[12px] text-ink-3">In Find after it: {Object.entries(r.stored).map(([m, n]) => `${num(n)} ${MODULES.find((x) => x.id === m)?.label ?? m}`).join(", ")}</p>
                )}
                {r.items.length ? <RunItems items={r.items} /> : <p className="text-[12px] text-ink-4">No source was due.</p>}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Fold>
  );
}

/**
 * The "import finished" email (owner, 2026-11-03: "make this email sending configurable in admin"): whether import jobs
 * and the hourly collection send it, and to whom (empty: the platform admins).
 */
function Emails({ d, reload }: { d: ImportView; reload: () => void }) {
  const e = d.emails;
  const [to, setTo] = useState(e.to.join(", "));
  const [saving, setSaving] = useState(false);
  const save = async (patch: Record<string, unknown>, done?: string) => {
    setSaving(true);
    const r = await post({ action: "emails", ...patch });
    setSaving(false);
    if (!r.ok) toast.error("Couldn't save", r.error.message);
    else if (done) toast.success(done);
    reload();
  };
  const who = e.to.length ? e.to.join(", ") : e.admins ? `the ${num(e.admins)} platform ${e.admins === 1 ? "admin" : "admins"}` : "the Company ratings notify address";
  const state = !e.imports && !e.hourly ? "Off" : `${[e.imports && "imports", e.hourly && "hourly collections"].filter(Boolean).join(" and ")} · to ${who}`;
  return (
    <Fold title="Emails" hint={e.mailbox ? `When a run finishes, each module's new entries in Find: ${state}` : "The platform mailbox (SMTP) isn't set up, so no email is sent"}>
      <div className="flex flex-col gap-3 pb-4">
        {(
          [
            ["imports", "When an import finishes", "Import now, a module's import, the scheduled set-up"],
            ["hourly", "When an hourly collection brings anything in", "Not sent for an hour with nothing due"],
          ] as const
        ).map(([k, label, hint]) => (
          <div key={k} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="min-w-0">
              <span className="block text-ink">{label}</span>
              <span className="block text-[12px] text-ink-3">{hint}</span>
            </span>
            <Switch label={label} checked={e[k]} disabled={saving} onChange={(v) => save({ [k]: v })} />
          </div>
        ))}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            void save({ to }, "Recipients saved");
          }}
        >
          <Field label="Send to" htmlFor="import-email-to" className="min-w-0 flex-1">
            <Input id="import-email-to" value={to} onChange={(ev) => setTo(ev.target.value)} placeholder="Platform admins" maxLength={1000} />
          </Field>
          <Button type="submit" size="sm" variant="outline" disabled={saving || to === e.to.join(", ")}>
            Save
          </Button>
          <p className="w-full text-[12px] text-ink-3">Comma-separated, up to 10. Leave empty for the platform admins.</p>
        </form>
      </div>
    </Fold>
  );
}

/** The schedule and its one option. */
function Schedule({ d, reload }: { d: ImportView; reload: () => void }) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[13px]">
      <span className="text-ink-3">{d.schedule.cronSet ? `${SCHEDULE_LINE} It collects what's due and refreshes Find for anything new.` : "CRON_SECRET isn't set, so the scheduled run can't reach this deployment."}</span>
      <Switch
        label={`Also set up waiting sources every ${TRIGGER_EVERY_HOURS} hours`}
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
  );
}

/**
 * One module, closed by default (owner, 2026-11-02: "collapse the info by default, keep only minimum info on card with
 * actionable options"): its name and import switch, one line of numbers (in Find · collected · live), and only the
 * actions there are: Set up N (its waiting sources, then a collection and a Find refresh) or Import, and Review N when
 * sources are down or need the admin, which opens the card on its sources. Everything else is inside.
 */
function ModuleCard({ m, busy: jobRunning, reload }: { m: ImportModule; busy: boolean; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"pause" | "import" | null>(null);
  const pause = async (paused: boolean) => {
    setBusy("pause");
    const r = await post({ action: "module_pause", module: m.id, paused });
    setBusy(null);
    if (!r.ok) toast.error("Couldn't change it", r.error.message);
    else toast.success(paused ? `${m.label} import paused` : `${m.label} import resumed`, paused ? "Nothing new is collected or stored for it until you resume. What Find has stays." : "The next scheduled run includes it again.");
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
  const review = m.problems.length;
  const canImport = !m.paused && m.live + m.waiting > 0;
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown className={`size-4 shrink-0 text-ink-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold text-ink">{m.label}</span>
            <span className="block text-[12px] tabular-nums text-ink-3">
              {m.paused ? "Import paused · " : ""}
              <span className="font-medium text-ink-2">{m.inFind == null ? "—" : num(m.inFind)} in Find</span> · {num(m.collected)} collected · {num(m.live)} live
            </span>
          </span>
        </button>
        <Switch label={`Import ${m.label}`} checked={!m.paused} disabled={!!busy} onChange={(on) => void pause(!on)} />
      </div>
      {(canImport || review > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-6">
          {canImport && (
            <Button size="sm" variant={m.waiting ? "primary" : "outline"} loading={busy === "import"} disabled={!!busy || jobRunning} onClick={() => void importNow()}>
              {m.waiting ? `Set up ${num(m.waiting)}` : "Import"}
            </Button>
          )}
          {review > 0 && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              Review {num(review)}
            </Button>
          )}
        </div>
      )}
      {open && (
        <div className="mt-3 border-t border-line pt-2">
          <p className="text-[12px] text-ink-3">
            {m.dataType} · {num(m.live)} live{m.waiting ? ` · ${num(m.waiting)} waiting to be set up` : ""}
            {m.needsYou ? ` · ${num(m.needsYou)} need you` : ""}
          </p>
          <ul className="mt-1 flex flex-col divide-y divide-line">
            {m.rows.length ? m.rows.map((r) => <Row key={r.id} r={r} reload={reload} />) : <li className="py-3 text-[13px] text-ink-4">No sources yet. Add one below.</li>}
          </ul>
        </div>
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
    : a.kind === "dismiss" ? { action: "dismiss", id: a.id, dismissed: a.dismissed }
    : { action: a.kind, sourceId: a.sourceId };
  const done = (d: Record<string, unknown>) =>
    a.kind === "run" ? `Live · ${num(Number(d.valid ?? 0))} listings`
    : a.kind === "decide" ? "Decided"
    : a.kind === "pause" ? "Paused"
    : a.kind === "activate" ? "Live"
    : a.kind === "collect" ? `Collected · ${num(Number(d.valid ?? 0))} listings`
    : a.kind === "test" ? (d.ok === false ? `Test didn't pass: ${num(Number(d.valid ?? 0))} of ${num(Number(d.discovered ?? 0))} read well` : `Test passed · ${num(Number(d.valid ?? 0))} read well`)
    : a.kind === "dismiss" ? (a.dismissed ? "Dismissed: Import won't try it again" : "Restored")
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

/** What a gateway failure code means, and what can be done, in plain words. */
const REASON: Record<string, string> = {
  ROBOTS_UNAVAILABLE: "Its robots.txt can't be read from our servers, so it isn't collected. Dismiss it, or ask the site to allow WonderWorks.",
  ROBOTS_DISALLOWED: "Its robots.txt doesn't allow collecting this page. Dismiss it.",
  SOURCE_UNAVAILABLE: "The site refused us or didn't answer (403 or down). Try again later, or dismiss it.",
  UNSAFE_REDIRECT: "The site sends us to another address, which isn't followed. Dismiss it, or fix its address.",
  INVALID_SOURCE: "Too few of its records read well (90% needed). Open its Details to see why.",
  SOURCE_TIMEOUT: "It took too long to answer. The next run tries again.",
  "Collection already running": "It was already being collected. The next run tries again.",
};
const reasonFor = (code?: string) => (code ? (REASON[code] ?? code) : "It failed without a reason.");

/** The gateway's last collections and tests, repeats grouped: one line per source and outcome, with what it means. */
function RecentRuns({ d }: { d: ImportView }) {
  const groups = new Map<string, { source: string; ok: boolean; code?: string; kind: string; count: number; at: string; valid?: number }>();
  for (const r of d.recentRuns) {
    const kind = r.trigger === "test" ? "Test" : r.trigger === "ingest" ? "Delivered" : "Collect";
    const key = `${r.source}|${r.ok}|${r.code ?? ""}|${kind}`;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { source: r.source, ok: r.ok, code: r.code, kind, count: 1, at: r.at, valid: r.valid });
  }
  const rows = [...groups.values()];
  const failing = rows.filter((r) => !r.ok).length;
  return (
    <Fold title="Recent collections" hint={rows.length ? `The newest ${num(d.recentRuns.length)}${failing ? ` · ${num(failing)} failing; each says why and what to do` : ""}` : "None yet"}>
      <ul className="flex flex-col divide-y divide-line pb-4">
        {rows.map((r) => (
          <li key={`${r.source}${r.ok}${r.code}${r.kind}`} className="py-2 text-[13px]">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-medium text-ink">
                {r.source}
                {r.count > 1 ? <span className="font-normal text-ink-3"> ×{r.count}</span> : null}
              </span>
              <span className="text-[12px] text-ink-3">
                {r.kind} · {when(r.at)}
              </span>
            </span>
            <span className={`block text-[12px] ${r.ok ? "text-success-600" : "text-danger-600"}`}>{r.ok ? `${num(r.valid)} listings` : reasonFor(r.code)}</span>
          </li>
        ))}
      </ul>
      {failing > 0 && <p className="pb-4 text-[12px] text-ink-3">To stop a failing source being tried: open its module card above, then Details → Dismiss on its row.</p>}
    </Fold>
  );
}
