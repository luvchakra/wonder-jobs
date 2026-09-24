"use client";
import Link from "next/link";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FlaskConical, Power } from "lucide-react";
import type { Alert, SourceRun } from "@/domain/jobslake/health";
import type { AuditEvent, SourceConfig, SourceRecord, TestReport } from "@/server/jobslake/types";
import type { SourceView } from "@/server/jobslake/views";
import { formatDate, relativeTime } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { Field, Input } from "@/components/common/Input";
import { Tabs } from "@/components/common/Tabs";
import { CredentialForm, MappingEditor, TestReportView } from "@/components/jobslake/SourceParts";
import { AuditList, RunsTable } from "@/components/jobslake/Tables";
import { AccessBadge, adminFetch, ConfirmAction, HealthChip, LoadError, Loading, Note, PageTitle, Panel, SourceStatusChip, Stat, ms, num, pct, useAdmin } from "@/components/jobslake/ui";

type Detail = { source: SourceView; runs: (SourceRun & { relevant?: number; strong?: number })[]; alerts: Alert[]; audit: AuditEvent[] };
type Tab = "overview" | "configuration" | "mapping" | "test" | "limits" | "health" | "runs" | "audit" | "advanced";

const ACTIVATABLE = (s: SourceView) => s.config.kind !== "partnership" && s.config.kind !== "scraper" && s.status !== "do_not_use";

export default function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, reload } = useAdmin<Detail>(`sources/${encodeURIComponent(id)}`);
  const [tab, setTab] = useState<Tab>("overview");
  const [testing, setTesting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [flash, setFlash] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [now] = useState(Date.now);
  const router = useRouter();

  if (error) return error.code === "NOT_FOUND" ? <Note tone="warning">No source with id “{id}”.</Note> : <LoadError error={error} onRetry={reload} />;
  if (!data) return <Loading rows={4} />;
  const { source: s, runs, alerts, audit } = data;
  const mapped = s.config.kind === "json_api" || s.config.kind === "mcp";
  const takesCredential = mapped;
  const testFresh = s.lastTest && now - Date.parse(s.lastTest.at) < 24 * 3_600_000;

  const patch = async (body: Record<string, unknown>) => {
    const r = await adminFetch<{ source: SourceView }>(`sources/${s.id}`, { method: "PATCH", body: JSON.stringify(body) });
    if (!r.ok) return r.error.message;
    await reload();
    return null;
  };
  const runTest = async () => {
    setTesting(true);
    setFlash(null);
    const r = await adminFetch<TestReport>(`sources/${s.id}/test`, { method: "POST" });
    setTesting(false);
    if (!r.ok) setFlash({ tone: "danger", text: r.error.message });
    setTab("test");
    await reload();
  };
  const activate = async () => {
    setActivating(true);
    const r = await adminFetch(`sources/${s.id}/activate`, { method: "POST" });
    setActivating(false);
    setFlash(r.ok ? { tone: "success", text: `${s.name} is active. It's included in searches from now on.` } : { tone: "danger", text: r.error.message });
    await reload();
  };

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "overview", label: "Overview" },
    { value: "configuration", label: "Configuration" },
    ...(mapped ? [{ value: "mapping" as Tab, label: "Mapping" }] : []),
    { value: "test", label: "Test" },
    { value: "limits", label: "Limits" },
    { value: "health", label: "Health" },
    { value: "runs", label: "Runs", count: runs.length },
    { value: "audit", label: "Audit" },
    { value: "advanced", label: "Advanced" },
  ];

  return (
    <>
      <Link href="/platform/jobs-lake/sources" className="mb-3 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden /> Sources
      </Link>
      <PageTitle
        title={s.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <SourceStatusChip status={s.status} label={s.statusLabel} />
            <AccessBadge label={s.accessLabel} />
            <span>{s.categoryLabel}</span>
            <span>· {s.provider}</span>
            {s.builtin && <span>· Built in</span>}
          </span>
        }
        actions={
          s.config.kind === "partnership" ? null : (
            <>
              <Button size="sm" variant="outline" onClick={runTest} loading={testing} icon={<FlaskConical className="size-3.5" aria-hidden />}>
                Run test
              </Button>
              {ACTIVATABLE(s) && s.status !== "active" && (
                <Button size="sm" onClick={activate} loading={activating} disabled={!s.lastTest?.ok || !testFresh} icon={<Power className="size-3.5" aria-hidden />} title={!s.lastTest?.ok || !testFresh ? "Needs a passing test from the last 24 hours" : undefined}>
                  {s.activatedAt ? "Resume" : "Activate"}
                </Button>
              )}
            </>
          )
        }
      />
      {s.statusReason && (
        <div className="mb-3">
          <Note tone={s.status === "do_not_use" ? "danger" : "warning"}>{s.statusReason}</Note>
        </div>
      )}
      {s.status === "active" && !s.available && (
        <div className="mb-3">
          <Note tone="warning">Active, but this deployment can&apos;t query it: its credentials aren&apos;t set. Searches report it as “Needs setup”.</Note>
        </div>
      )}
      {flash && (
        <div className="mb-3">
          <Note tone={flash.tone}>{flash.text}</Note>
        </div>
      )}

      <Tabs value={tab} onChange={setTab} items={tabs} label="Source sections" variant="underline" className="mb-4 overflow-x-auto" />

      {tab === "overview" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Health (7 d)" value={<HealthChip state={s.health?.state} />} hint={s.health ? `${s.health.runs} runs` : "Not searched yet"} />
            <Stat label="Success rate" value={pct(s.health?.successRate)} />
            <Stat label="Median latency" value={ms(s.health?.p50LatencyMs)} />
            <Stat label="Jobs retrieved (7 d)" value={num(s.health?.retrieved ?? null)} hint={s.health?.lastSuccessAt ? `Last success ${relativeTime(s.health.lastSuccessAt)}` : undefined} />
          </div>
          <Panel title="About">
            <p className="text-[13px] text-ink-2">{s.description || "No description."}</p>
            <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
              <Row k="Source id" v={<span className="font-mono">{s.id}</span>} />
              <Row k="Protocol" v={`v${s.protocolVersion}`} />
              <Row k="Geography" v={s.geography.join(", ") || "—"} />
              <Row k="Capabilities" v={s.capabilities.join(", ") || "—"} />
              <Row k="Candidates choose it as" v={s.legacySourceId ? <span className="font-mono">{s.legacySourceId}</span> : "Platform-managed (always included when active)"} />
              <Row k="Activated" v={s.activatedAt ? formatDate(s.activatedAt) : s.builtin ? "Built in" : "Not yet"} />
            </dl>
          </Panel>
          {alerts.length > 0 && (
            <Panel title="Alerts">
              <ul className="flex flex-col gap-2">
                {alerts.map((a) => (
                  <li key={a.id} className="text-[13px]">
                    <span className={a.severity === "critical" ? "font-medium text-danger-600" : "font-medium text-warning-600"}>{a.title}</span> — <span className="text-ink-3">{a.detail}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      {tab === "configuration" && (
        <div className="flex flex-col gap-4">
          <Panel title="Connection">{s.builtin ? <ReadOnlyConfig /> : <ConfigEditor key={s.updatedAt} s={s} onSave={patch} />}</Panel>
          {takesCredential && (
            <Panel title="Credential">
              <CredentialForm sourceId={s.id} credential={s.credential} onChanged={reload} />
            </Panel>
          )}
          {s.credential?.managedBy === "environment" && (
            <Panel title="Credential">
              <CredentialForm sourceId={s.id} credential={s.credential} onChanged={reload} />
            </Panel>
          )}
        </div>
      )}

      {tab === "mapping" && mapped && (
        <Panel title="Response mapping">
          <MappingEditor
            sourceId={s.id}
            initial={(s.config as Extract<SourceConfig, { kind: "json_api" }>).api?.mapping ?? (s.config as Extract<SourceConfig, { kind: "mcp" }>).mcp.mapping}
            onSave={(mapping) => patch({ config: s.config.kind === "json_api" ? { ...s.config, api: { ...s.config.api, mapping } } : { ...(s.config as Extract<SourceConfig, { kind: "mcp" }>), mcp: { ...(s.config as Extract<SourceConfig, { kind: "mcp" }>).mcp, mapping } } })}
          />
        </Panel>
      )}

      {tab === "test" && (
        <Panel
          title="Last test"
          action={
            s.config.kind !== "partnership" && (
              <Button size="sm" variant="outline" onClick={runTest} loading={testing}>
                Test again
              </Button>
            )
          }
        >
          {s.lastTest ? <TestReportView report={s.lastTest} /> : <p className="py-4 text-center text-[13px] text-ink-4">Not tested yet. A test is a real fetch through this source&apos;s connector, validated against Protocol v1.</p>}
        </Panel>
      )}

      {tab === "limits" && (
        <Panel title="Limits">
          <LimitsEditor key={s.updatedAt} s={s} onSave={patch} />
        </Panel>
      )}

      {tab === "health" && <HealthTab s={s} runs={runs} alerts={alerts} />}

      {tab === "runs" && (
        <Panel title="Runs">
          <RunsTable runs={runs} />
        </Panel>
      )}

      {tab === "audit" && (
        <Panel title="Audit trail">
          <AuditList events={audit} />
        </Panel>
      )}

      {tab === "advanced" && (
        <Panel title="Danger zone">
          <div className="flex flex-col gap-4 text-[13px]">
            {s.status === "do_not_use" ? (
              <p className="text-ink-3">This source has no authorized access path, so there&apos;s nothing to pause or resume.</p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">Pause or disable</p>
                  <p className="text-ink-3">Stops JobsLake from asking this source. Resuming needs a passing test.</p>
                </div>
                <div className="flex gap-2">
                  {s.status !== "paused" && (
                    <ConfirmAction label="Pause" variant="outline" title={`Pause ${s.name}?`} body={<p>Searches will stop asking {s.name} immediately. Jobs already stored stay. To resume, run a test and then Resume.</p>} confirmLabel="Pause source" onConfirm={() => patch({ status: "paused" })} />
                  )}
                  {s.status !== "disabled" && (
                    <ConfirmAction label="Disable" title={`Disable ${s.name}?`} body={<p>Like pausing, but marks the source as not meant to come back. It can still be re-activated after a passing test.</p>} confirmLabel="Disable source" onConfirm={() => patch({ status: "disabled" })} />
                  )}
                </div>
              </div>
            )}
            {!s.builtin && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <div>
                  <p className="font-medium text-ink">Delete source</p>
                  <p className="text-ink-3">Removes its configuration and credential. Run history and audit entries are kept.</p>
                </div>
                <ConfirmAction
                  label="Delete"
                  title={`Delete ${s.name}?`}
                  body={<p>This removes the source and permanently deletes its stored credential. It can&apos;t be undone.</p>}
                  confirmLabel="Delete source"
                  confirmText={s.id}
                  onConfirm={async () => {
                    const r = await adminFetch(`sources/${s.id}`, { method: "DELETE" });
                    if (!r.ok) return r.error.message;
                    router.push("/platform/jobs-lake/sources");
                    return null;
                  }}
                />
              </div>
            )}
          </div>
        </Panel>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] uppercase tracking-wide text-ink-4">{k}</dt>
      <dd className="text-ink-2">{v}</dd>
    </div>
  );
}

function ReadOnlyConfig() {
  return <p className="text-[13px] text-ink-2">Built-in connector — its endpoint and parsing are defined in code (the same fetcher WonderJobs has always used). Status and limits can be changed here; the connection itself can&apos;t.</p>;
}

type EditableKind = Exclude<SourceConfig["kind"], "builtin" | "partnership" | "scraper">;
const CONFIG_FIELDS: Record<EditableKind, { path: string[]; label: string; hint?: string; mono?: boolean }[]> = {
  ats_board: [
    { path: ["company"], label: "Company name" },
    { path: ["slug"], label: "Board slug", mono: true },
  ],
  json_api: [
    { path: ["api", "endpoint"], label: "Endpoint (https)", mono: true },
    { path: ["api", "queryParam"], label: "Search parameter", hint: "Query-string name for the search terms, e.g. q. Leave empty to fetch everything and match locally.", mono: true },
    { path: ["api", "locationParam"], label: "Location parameter", mono: true },
    { path: ["api", "credentialHeader"], label: "Credential header", hint: "e.g. Authorization or X-API-Key", mono: true },
    { path: ["api", "credentialPrefix"], label: "Credential prefix", hint: "e.g. “Bearer ” (with the space)", mono: true },
  ],
  feed: [
    { path: ["feed", "url"], label: "Feed URL (https)", mono: true },
    { path: ["feed", "defaultEmployer"], label: "Employer" },
  ],
  structured: [{ path: ["page", "url"], label: "Page URL (https)", mono: true }],
  mcp: [
    { path: ["mcp", "endpoint"], label: "MCP endpoint (https)", mono: true },
    { path: ["mcp", "toolName"], label: "Tool name", mono: true },
    { path: ["mcp", "queryArgument"], label: "Search argument", mono: true },
    { path: ["mcp", "locationArgument"], label: "Location argument", mono: true },
    { path: ["mcp", "credentialHeader"], label: "Credential header", mono: true },
    { path: ["mcp", "credentialPrefix"], label: "Credential prefix", mono: true },
  ],
};

function readPath(o: unknown, path: string[]) {
  return path.reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), o);
}
function writePath<T>(o: T, path: string[], value: string): T {
  const copy = structuredClone(o) as Record<string, unknown>;
  let cur = copy;
  for (const k of path.slice(0, -1)) cur = cur[k] as Record<string, unknown>;
  cur[path.at(-1)!] = value || undefined;
  return copy as T;
}

function ConfigEditor({ s, onSave }: { s: SourceRecord; onSave: (b: Record<string, unknown>) => Promise<string | null> }) {
  const [cfg, setCfg] = useState(s.config);
  const [name, setName] = useState(s.name);
  const [description, setDescription] = useState(s.description);
  const [geo, setGeo] = useState(s.geography.join(", "));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const fields = CONFIG_FIELDS[cfg.kind as EditableKind] ?? [];
  if (cfg.kind === "scraper") return <p className="text-[13px] text-ink-2">Scraper sources are registered for the record only; no scraper engine runs on this deployment.</p>;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const configChanged = JSON.stringify(cfg) !== JSON.stringify(s.config);
        const err = await onSave({ name, description, geography: geo.split(",").map((g) => g.trim()).filter(Boolean), ...(configChanged ? { config: cfg } : {}) });
        setBusy(false);
        setMsg(err ? { tone: "danger", text: err } : { tone: "success", text: configChanged ? "Saved. The connection changed, so the source is back in Draft until it passes a test." : "Saved." });
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name" htmlFor="cfg-name">
          <Input id="cfg-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Geography" hint="Comma-separated: country codes, “remote” or “global”." htmlFor="cfg-geo">
          <Input id="cfg-geo" value={geo} onChange={(e) => setGeo(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="cfg-desc" className="md:col-span-2">
          <Input id="cfg-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {fields.map((f) => (
          <Field key={f.path.join(".")} label={f.label} hint={f.hint} htmlFor={`cfg-${f.path.join("-")}`}>
            <Input id={`cfg-${f.path.join("-")}`} value={String(readPath(cfg, f.path) ?? "")} onChange={(e) => setCfg(writePath(cfg, f.path, e.target.value))} className={f.mono ? "font-mono text-[13px]" : undefined} />
          </Field>
        ))}
      </div>
      <div>
        <Button type="submit" size="sm" loading={busy}>
          Save configuration
        </Button>
      </div>
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
    </form>
  );
}

function LimitsEditor({ s, onSave }: { s: SourceRecord; onSave: (b: Record<string, unknown>) => Promise<string | null> }) {
  const [l, setL] = useState(s.limits);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const err = await onSave({ limits: l });
        setBusy(false);
        setMsg(err ? { tone: "danger", text: err } : { tone: "success", text: "Limits saved." });
      }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Timeout (ms)" hint="2,000–30,000. A slower answer is recorded as a timeout." htmlFor="lim-t">
          <Input id="lim-t" type="number" min={2000} max={30000} value={l.timeoutMs} onChange={(e) => setL({ ...l, timeoutMs: Number(e.target.value) })} />
        </Field>
        <Field label="Max results per search" hint="1–500" htmlFor="lim-r">
          <Input id="lim-r" type="number" min={1} max={500} value={l.maxResults} onChange={(e) => setL({ ...l, maxResults: Number(e.target.value) })} />
        </Field>
        <Field label="Minimum minutes between refreshes" hint="15–10,080" htmlFor="lim-f">
          <Input id="lim-f" type="number" min={15} max={10080} value={l.refreshMinutes} onChange={(e) => setL({ ...l, refreshMinutes: Number(e.target.value) })} />
        </Field>
      </div>
      <div>
        <Button type="submit" size="sm" loading={busy}>
          Save limits
        </Button>
      </div>
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
    </form>
  );
}

function HealthTab({ s, runs, alerts }: { s: SourceView; runs: SourceRun[]; alerts: Alert[] }) {
  const h = s.health;
  const recent = runs.filter((r) => r.outcome !== "skipped").slice(0, 40).reverse();
  const top = Math.max(1, ...recent.map((r) => r.durationMs));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="State" value={<HealthChip state={h?.state} />} />
        <Stat label="Success rate (7 d)" value={pct(h?.successRate)} />
        <Stat label="Timeouts / failures" value={h ? `${h.failures.timeout} / ${h.failures.unavailable}` : "—"} />
        <Stat label="Duplicates of stronger sources" value={num(h?.duplicates ?? null)} />
      </div>
      <Panel title="Recent runs — duration and outcome">
        {recent.length ? (
          <div className="flex h-32 items-end gap-1" role="img" aria-label={`${recent.length} recent runs; ${recent.filter((r) => r.outcome === "ok" || r.outcome === "empty").length} succeeded`}>
            {recent.map((r) => (
              <span key={r.id} title={`${formatDate(r.startedAt, { dateStyle: "medium", timeStyle: "short" })} · ${r.outcome} · ${ms(r.durationMs)}`} className={r.outcome === "ok" || r.outcome === "empty" ? "max-w-3 flex-1 rounded-t bg-success-600/70" : r.outcome === "needs_setup" ? "max-w-3 flex-1 rounded-t bg-warning-600/70" : "max-w-3 flex-1 rounded-t bg-danger-600/70"} style={{ height: `${Math.max(4, (r.durationMs / top) * 100)}%` }} />
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-[13px] text-ink-4">No runs yet.</p>
        )}
      </Panel>
      <Panel title="Active alerts">{alerts.length ? alerts.map((a) => <p key={a.id} className="text-[13px] text-ink-2">{a.title} — {a.detail}</p>) : <p className="text-[13px] text-ink-4">None.</p>}</Panel>
    </div>
  );
}
