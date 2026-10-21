"use client";
import { useState } from "react";
import { Play } from "lucide-react";
import type { CronRun, SchedulerSettings } from "@/domain/scheduler/settings";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Input, Switch } from "@/components/common/Input";
import { LoadError, Loading, Note, PageTitle, Panel, ResponsiveTable, adminFetch, useAdmin } from "@/components/jobslake/ui";
import { relativeTime } from "@/lib/format";

type Limits = Record<"maxTenants" | "tenantBudgetSec" | "logoLimit" | "budgetSec", readonly [number, number]>;
type Job = { id: CronRun["job"]; path: string; schedule: string; label: string; description: string; when: string; nextRunAt?: string; lastRun?: CronRun };
type ScheduleRow = { account: string; frequency: string; time: string; timezone: string; enabled: boolean; nextRunAt?: string; lastRunAt?: string; due: boolean };
type Data = {
  settings: SchedulerSettings;
  defaults: SchedulerSettings;
  limits: Limits;
  cron: { secretSet: boolean; intervalMinutes: number };
  jobs: Job[];
  runs: CronRun[];
  schedules: { accounts: number; total: number; enabled: number; dueNow: number; list: ScheduleRow[] };
};

const when = (iso?: string) => (iso ? `${new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · ${relativeTime(iso)}` : "—");
const tone = (o?: CronRun["outcome"]) => (o === "ok" ? "success" : o === "failed" ? "danger" : "neutral");
const JOB_LABEL: Record<CronRun["job"], string> = { "scheduled-runs": "Daily run", "jobslake-companies": "Company refresh", "application-reminders": "Application reminders" };

export default function SchedulerPage() {
  const { data, error, reload } = useAdmin<Data>("scheduler");
  return (
    <>
      <PageTitle title="Scheduler" subtitle="The platform's scheduled jobs, what they last did, and the limits they run with." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && <Scheduler data={data} reload={reload} />}
    </>
  );
}

function Scheduler({ data, reload }: { data: Data; reload: () => void }) {
  const [draft, setDraft] = useState<SchedulerSettings>(data.settings);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const dirty = JSON.stringify({ a: draft.scheduledRuns, b: draft.companyRefresh }) !== JSON.stringify({ a: data.settings.scheduledRuns, b: data.settings.companyRefresh });
  const sr = (patch: Partial<SchedulerSettings["scheduledRuns"]>) => setDraft((d) => ({ ...d, scheduledRuns: { ...d.scheduledRuns, ...patch } }));
  const cr = (patch: Partial<SchedulerSettings["companyRefresh"]>) => setDraft((d) => ({ ...d, companyRefresh: { ...d.companyRefresh, ...patch } }));

  const save = async () => {
    setSaving(true);
    const r = await adminFetch<{ settings: SchedulerSettings }>("scheduler", { method: "PUT", body: JSON.stringify(draft) });
    setSaving(false);
    if (!r.ok) return setMessage({ tone: "danger", text: r.error.message });
    setDraft(r.data.settings);
    setMessage({ tone: "success", text: "Saved. The next run uses these settings." });
    reload();
  };
  const runNow = async () => {
    setRunning(true);
    setMessage(null);
    const r = await adminFetch<{ outcome: string; report?: { postings: number; companies: number; logosChecked: number; logosFound: number } }>("scheduler", { method: "POST", body: JSON.stringify({ job: "jobslake-companies" }) });
    setRunning(false);
    if (!r.ok) setMessage({ tone: "danger", text: r.error.message });
    else if (r.data.report) setMessage({ tone: "success", text: `Company refresh done: ${r.data.report.companies} companies from ${r.data.report.postings} postings; ${r.data.report.logosFound} of ${r.data.report.logosChecked} logos found.` });
    reload();
  };

  const num = (value: number, onChange: (n: number) => void, [lo, hi]: readonly [number, number], unit: string) => (
    <span className="flex items-center gap-2">
      <Input type="number" inputMode="numeric" min={lo} max={hi} value={value} onChange={(e) => onChange(Math.round(Number(e.target.value)))} className="w-24" />
      <span className="text-[12px] text-ink-3">
        {unit} ({lo}–{hi})
      </span>
    </span>
  );
  const row = (label: string, hint: string, control: React.ReactNode) => (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        <span className="block text-[12px] text-ink-3">{hint}</span>
      </span>
      {control}
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      {!data.cron.secretSet && <Note tone="warning">CRON_SECRET isn&apos;t set on this deployment, so Vercel Cron can&apos;t run these jobs.</Note>}
      {message && <Note tone={message.tone}>{message.text}</Note>}

      <Panel title="Jobs">
        <ul className="divide-y divide-line">
          {data.jobs.map((j) => {
            const on = j.id === "scheduled-runs" ? draft.scheduledRuns.enabled : draft.companyRefresh.enabled;
            return (
              <li key={j.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
                    {j.label}
                    <Badge tone={on ? "success" : "neutral"}>{on ? "On" : "Off"}</Badge>
                    {j.lastRun && <Badge tone={tone(j.lastRun.outcome)}>Last: {j.lastRun.outcome}</Badge>}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-ink-3">{j.description}</span>
                  <span className="mt-1 block text-[12px] text-ink-2">
                    {j.when} · next {when(j.nextRunAt)} · <span className="font-mono text-[11px] text-ink-4">{j.path}</span>
                  </span>
                  {j.lastRun && <span className="mt-0.5 block text-[12px] text-ink-3">Last run {when(j.lastRun.finishedAt)} — {j.lastRun.summary}</span>}
                </span>
                {j.id === "jobslake-companies" && (
                  <Button size="sm" variant="outline" className="shrink-0" icon={<Play className="size-3.5" aria-hidden />} loading={running} onClick={() => void runNow()}>
                    Run now
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Daily run">
        <ul className="divide-y divide-line">
          {row("Run", "Candidates' saved schedules, reminders and digests. Billing reconciliation and retention purges always run.", <Switch label="Daily run" checked={draft.scheduledRuns.enabled} onChange={(v) => sr({ enabled: v })} />)}
          {row("Accounts per run", "The most accounts one run takes; the rest wait for the next run.", num(draft.scheduledRuns.maxTenants, (n) => sr({ maxTenants: n }), data.limits.maxTenants, "accounts"))}
          {row("Time per account", "How long one account's searches may take before the run moves on.", num(draft.scheduledRuns.tenantBudgetSec, (n) => sr({ tenantBudgetSec: n }), data.limits.tenantBudgetSec, "seconds"))}
          {row("Reminders", "Follow-up and interview reminders.", <Switch label="Reminders" checked={draft.scheduledRuns.reminders} onChange={(v) => sr({ reminders: v })} />)}
          {row("Activity digests", "The once-a-day activity email.", <Switch label="Activity digests" checked={draft.scheduledRuns.digests} onChange={(v) => sr({ digests: v })} />)}
        </ul>
      </Panel>

      <Panel title="Company refresh">
        <ul className="divide-y divide-line">
          {row("Run", "JobsLake's company directory and logos, daily.", <Switch label="Company refresh" checked={draft.companyRefresh.enabled} onChange={(v) => cr({ enabled: v })} />)}
          {row("Logos per run", "Companies whose logo is looked for in one run.", num(draft.companyRefresh.logoLimit, (n) => cr({ logoLimit: n }), data.limits.logoLimit, "logos"))}
          {row("Time limit", "When the logo look-ups stop.", num(draft.companyRefresh.budgetSec, (n) => cr({ budgetSec: n }), data.limits.budgetSec, "seconds"))}
        </ul>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!dirty} loading={saving} onClick={() => void save()}>
          Save settings
        </Button>
        <Button variant="ghost" disabled={saving} onClick={() => setDraft({ ...data.settings, scheduledRuns: data.defaults.scheduledRuns, companyRefresh: data.defaults.companyRefresh })}>
          Use defaults
        </Button>
        {data.settings.updatedAt && (
          <span className="text-[12px] text-ink-3">
            Last changed {when(data.settings.updatedAt)} by {data.settings.updatedBy}
          </span>
        )}
      </div>

      <Panel title={`Candidates' schedules · ${data.schedules.total}`}>
        <p className="mb-2 text-[12px] text-ink-3">
          {data.schedules.enabled} on across {data.schedules.accounts} accounts · {data.schedules.dueNow} due now. Only timing is shown — never what a schedule searches for.
        </p>
        <ResponsiveTable
          rows={data.schedules.list}
          rowKey={(r) => `${r.account}-${r.nextRunAt}-${r.time}-${r.frequency}`}
          empty="No saved schedules yet."
          columns={[
            { header: "Account", cell: (r) => <span className="font-mono text-[12px]">{r.account}</span> },
            { header: "Cadence", cell: (r) => `${r.frequency} at ${r.time} (${r.timezone})` },
            { header: "Next", cell: (r) => (r.enabled ? when(r.nextRunAt) : "Off") },
            { header: "Last", cell: (r) => when(r.lastRunAt) },
          ]}
          card={(r) => (
            <div className="text-[13px]">
              <p className="font-medium text-ink">
                {r.frequency} at {r.time} <span className="text-ink-3">({r.timezone})</span>
              </p>
              <p className="text-[12px] text-ink-3">
                <span className="font-mono">{r.account}</span> · next {r.enabled ? when(r.nextRunAt) : "off"} · last {when(r.lastRunAt)}
              </p>
            </div>
          )}
        />
      </Panel>

      <Panel title="Recent runs">
        <ResponsiveTable
          rows={data.runs}
          rowKey={(r) => `${r.job}-${r.startedAt}`}
          empty="No runs recorded yet — the log starts with the next run."
          columns={[
            { header: "Job", cell: (r) => JOB_LABEL[r.job] ?? r.job },
            { header: "Started", cell: (r) => when(r.startedAt) },
            { header: "Outcome", cell: (r) => <Badge tone={tone(r.outcome)}>{r.outcome}</Badge> },
            { header: "By", cell: (r) => (r.trigger === "admin" ? "Run now" : "Cron") },
            { header: "What it did", cell: (r) => <span className="text-[12px] text-ink-2">{r.summary}</span> },
          ]}
          card={(r) => (
            <div className="text-[13px]">
              <p className="flex items-center gap-2 font-medium text-ink">
                {JOB_LABEL[r.job] ?? r.job} <Badge tone={tone(r.outcome)}>{r.outcome}</Badge>
              </p>
              <p className="text-[12px] text-ink-3">
                {when(r.startedAt)} · {r.trigger === "admin" ? "Run now" : "Cron"}
              </p>
              <p className="text-[12px] text-ink-2">{r.summary}</p>
            </div>
          )}
        />
      </Panel>
    </div>
  );
}
