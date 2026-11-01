"use client";
import { useRef, useState } from "react";
import type { RatingKey } from "@/server/jobslake/ratingKeys";
import type { RatingsRunReport } from "@/server/jobslake/ratingsJob";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { Input, Select } from "@/components/common/Input";
import { RATINGS_FREQUENCIES, type RatingsFrequency } from "@/domain/scheduler/settings";
import type { RatingRun } from "@/server/jobslake/ratingRuns";
import { LoadError, Loading, PageTitle, Panel, ResponsiveTable, adminFetch, num, useAdmin } from "@/components/jobslake/ui";

interface RatingsView {
  keys: RatingKey[];
  coverage: { companies: number; rated: number; waiting: number };
  schedule: { enabled: boolean; frequency: RatingsFrequency; notifyEmail: string; nextRunAt?: string; lastScheduledAt?: string };
  runs: RatingRun[];
}

const STATUS_LABEL: Record<RatingRun["status"], string> = { complete: "Complete", needs_key: "Needs a key", more: "In progress", stopped: "Stopped" };

type Line = { tone: "info" | "success" | "warning"; text: string };

/** Company ratings: Explorium API keys on a list, and the job that spends them one after another until every company is covered. */
export default function RatingsPage() {
  const { data, error, reload } = useAdmin<RatingsView>("ratings");
  const [keyValue, setKeyValue] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<Line[]>([]);
  const stop = useRef(false);
  const [freq, setFreq] = useState<RatingsFrequency | "off" | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const frequency: RatingsFrequency | "off" = freq ?? (data ? (data.schedule.enabled ? data.schedule.frequency : "off") : "weekly");
  const notifyEmail = email ?? data?.schedule.notifyEmail ?? "";

  async function sendTest() {
    setTesting(true);
    setScheduleMsg("");
    const r = await adminFetch<{ to: string; sent: boolean; reason?: string }>("ratings/test-email", { method: "POST" });
    setTesting(false);
    if (!r.ok) return setScheduleMsg(r.error.message);
    setScheduleMsg(r.data.sent ? `Test email sent to ${r.data.to}. Check the inbox (and spam).` : `The test email to ${r.data.to} was not sent: ${r.data.reason ?? "failed"}.`);
  }

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault();
    setSavingSchedule(true);
    setScheduleMsg("");
    const r = await adminFetch<unknown>("ratings/schedule", { method: "POST", body: JSON.stringify({ enabled: frequency !== "off", ...(frequency !== "off" ? { frequency } : {}), notifyEmail }) });
    setSavingSchedule(false);
    if (!r.ok) return setScheduleMsg(r.error.message);
    setScheduleMsg("Saved.");
    setFreq(null);
    setEmail(null);
    reload();
  }

  async function addKey(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError("");
    const r = await adminFetch<unknown>("ratings/keys", { method: "POST", body: JSON.stringify({ key: keyValue, label }) });
    setAdding(false);
    if (!r.ok) return setAddError(r.error.message);
    setKeyValue("");
    setLabel("");
    reload();
  }

  async function removeKey(k: RatingKey) {
    if (!window.confirm(`Remove the key ${k.label ? `“${k.label}” ` : ""}${k.masked} from the list?`)) return;
    const r = await adminFetch<unknown>(`ratings/keys?id=${encodeURIComponent(k.id)}`, { method: "DELETE" });
    if (!r.ok) setAddError(r.error.message);
    reload();
  }

  async function run() {
    stop.current = false;
    setRunning(true);
    setLog([{ tone: "info", text: "Started…" }]);
    let checked = 0;
    let rated = 0;
    // One id for the whole click, so its steps are one line in the history.
    let runId: string | undefined;
    for (;;) {
      const r = await adminFetch<RatingsRunReport & { runId?: string }>("ratings/run", { method: "POST", body: JSON.stringify({ runId }) });
      if (!r.ok) {
        setLog((l) => [...l, { tone: "warning", text: r.error.message }]);
        break;
      }
      const rep = r.data;
      runId = rep.runId ?? runId;
      checked += rep.checked;
      rated += rep.rated;
      for (const note of rep.notes) setLog((l) => (l.some((x) => x.text === note) ? l : [...l, { tone: "warning", text: note }]));
      for (const k of rep.retired) setLog((l) => [...l, { tone: "warning", text: `Key ${k.label ? `“${k.label}” ` : ""}${k.masked} removed from the list — ${k.reason}${k.creditsLeft ? ` (${num(k.creditsLeft)} credit${k.creditsLeft === 1 ? "" : "s"} left)` : ""}.` }]);
      setLog((l) => [...l.filter((x) => !x.text.startsWith("Looked up")), { tone: "info", text: `Looked up ${num(checked)} ${checked === 1 ? "company" : "companies"} so far — ${num(rated)} with a rating.` }]);
      reload();
      if (rep.status !== "more" || stop.current) {
        if (rep.status !== "more") setLog((l) => [...l, { tone: rep.status === "complete" ? "success" : "warning", text: rep.message }]);
        else setLog((l) => [...l, { tone: "info", text: `Stopped. ${num(rep.left)} ${rep.left === 1 ? "company is" : "companies are"} still left.` }]);
        break;
      }
    }
    setRunning(false);
  }

  const waiting = data?.coverage.waiting ?? 0;
  return (
    <>
      <PageTitle title="Employee ratings" subtitle="Employee-review ratings (out of 5) from Explorium, looked up by each company's website. The job spends the keys below one after another." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <div className="flex flex-col gap-4">
          <Panel title="Run the job" action={running ? <Button size="sm" variant="outline" onClick={() => (stop.current = true)}>Stop after this step</Button> : undefined}>
            <p className="text-[13px] text-ink-2">
              {num(data.coverage.rated)} of {num(data.coverage.companies)} companies have a rating. {num(waiting)} {waiting === 1 ? "company is" : "companies are"} waiting for a lookup (never looked up, or not for 90 days). Companies Explorium can&apos;t match aren&apos;t charged.
            </p>
            <div className="mt-3">
              <Button onClick={run} disabled={running || !waiting || !data.keys.length}>
                {running ? "Running…" : "Get ratings from Explorium"}
              </Button>
              {!data.keys.length && waiting > 0 && <p className="mt-2 text-[12.5px] text-warning-600">Add an API key first.</p>}
              {!waiting && <p className="mt-2 text-[12.5px] text-ink-3">All companies are covered — no company left.</p>}
            </div>
            {log.length > 0 && (
              <ul className="mt-3 space-y-1" aria-live="polite">
                {log.map((l, i) => (
                  <li key={i} className={l.tone === "success" ? "text-[13px] font-medium text-success-600" : l.tone === "warning" ? "text-[13px] text-warning-600" : "text-[13px] text-ink-2"}>
                    {l.text}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Schedule">
            <p className="mb-3 text-[12.5px] text-ink-3">
              The job runs by itself on this schedule, spending the keys below the same way. {data.schedule.enabled ? `Next run: ${data.schedule.nextRunAt ? new Date(data.schedule.nextRunAt).toLocaleString() : "—"}.` : "It is turned off."}
              {data.schedule.lastScheduledAt ? ` Last scheduled run: ${relativeTime(data.schedule.lastScheduledAt)}.` : ""}
            </p>
            <form onSubmit={saveSchedule} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="text-[12.5px] text-ink-3 sm:w-52">
                How often
                <Select value={frequency} onChange={(e) => setFreq(e.target.value as RatingsFrequency | "off")} className="mt-1 h-10">
                  {(Object.keys(RATINGS_FREQUENCIES) as RatingsFrequency[]).map((f) => (
                    <option key={f} value={f}>
                      {RATINGS_FREQUENCIES[f].label}
                    </option>
                  ))}
                  <option value="off">Off (run it myself)</option>
                </Select>
              </label>
              <label className="min-w-0 flex-1 text-[12.5px] text-ink-3">
                Email when no key is left
                <Input value={notifyEmail} onChange={(e) => setEmail(e.target.value)} type="email" className="mt-1 h-10" />
              </label>
              <Button type="submit" size="sm" className="h-10" disabled={savingSchedule || (freq === null && email === null)}>
                {savingSchedule ? "Saving…" : "Save"}
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-10" onClick={sendTest} disabled={testing}>
                {testing ? "Sending…" : "Send test email"}
              </Button>
            </form>
            {scheduleMsg && <p className="mt-2 text-[12.5px] text-ink-3">{scheduleMsg}</p>}
          </Panel>

          <Panel title={`API keys (${data.keys.length})`}>
            <p className="mb-3 text-[12.5px] text-ink-3">Spent in this order. A key that runs out of credits, or that Explorium refuses, is removed automatically and the next one takes over. Keys are stored encrypted and never shown again.</p>
            {data.keys.length ? (
              <ol className="mb-4 divide-y divide-line rounded-[12px] border border-line">
                {data.keys.map((k, i) => (
                  <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-[13px]">
                    <span className="w-5 text-ink-4">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-ink">{k.label || "API key"}</span> <span className="text-ink-3">{k.masked}</span>
                      <span className="block text-[12px] text-ink-3">
                        {k.creditsLeft !== undefined ? `${num(k.creditsLeft)} credits left${k.creditsCheckedAt ? ` (${relativeTime(k.creditsCheckedAt)})` : ""}` : "Credits not checked yet"}
                        {k.lastUsedAt ? ` · used ${relativeTime(k.lastUsedAt)}` : ""} · added {relativeTime(k.addedAt)}
                      </span>
                    </span>
                    <Button size="sm" variant="outline" onClick={() => removeKey(k)} disabled={running} aria-label={`Remove key ${k.masked}`}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mb-4 text-[13px] text-ink-3">No keys yet. Add the key from your Explorium account.</p>
            )}
            <form onSubmit={addKey} className="flex flex-col gap-2 sm:flex-row">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name (optional)" aria-label="Key name" className="h-10 sm:w-48" maxLength={60} />
              <Input value={keyValue} onChange={(e) => setKeyValue(e.target.value)} type="password" autoComplete="off" placeholder="Explorium API key" aria-label="Explorium API key" className="h-10 flex-1" />
              <Button type="submit" size="sm" className="h-10" disabled={adding || keyValue.trim().length < 8}>
                {adding ? "Checking…" : "Add key"}
              </Button>
            </form>
            {addError && <p className="mt-2 text-[12.5px] text-danger-600">{addError}</p>}
          </Panel>

          <Panel title="History">
            <ResponsiveTable
              rows={data.runs}
              rowKey={(r) => r.id}
              empty="No runs yet. The first one appears here."
              columns={[
                { header: "When", cell: (r) => <span title={new Date(r.startedAt).toLocaleString()}>{relativeTime(r.startedAt)}</span>, className: "whitespace-nowrap" },
                { header: "Run by", cell: (r) => (r.trigger === "scheduled" ? "Schedule" : r.actor ?? "Admin") },
                { header: "Result", cell: (r) => <RunResult r={r} /> },
                { header: "Companies left", cell: (r) => num(r.left), className: "tabular-nums text-right" },
              ]}
              card={(r) => (
                <div className="text-[13px]">
                  <p className="font-medium text-ink">
                    {relativeTime(r.startedAt)} · {r.trigger === "scheduled" ? "Schedule" : r.actor ?? "Admin"}
                  </p>
                  <RunResult r={r} />
                </div>
              )}
            />
          </Panel>
        </div>
      )}
    </>
  );
}

/** One history line: what it did, which keys it used up, and who was told. */
function RunResult({ r }: { r: RatingRun }) {
  return (
    <span className="block text-[12.5px] text-ink-2">
      <span className="font-medium text-ink">{STATUS_LABEL[r.status]}</span> — looked up {num(r.checked)}, {num(r.rated)} with a rating, {num(r.notFound)} none found. {num(r.left)} left, {num(r.keysLeft)} key{r.keysLeft === 1 ? "" : "s"} on the list.
      {r.retired.map((k, i) => (
        <span key={i} className="block text-ink-3">
          Key {k.label ? `“${k.label}” ` : ""}{k.masked} removed — {k.reason}.
        </span>
      ))}
      {r.notes.map((n) => (
        <span key={n} className="block text-warning-600">
          {n}
        </span>
      ))}
      {r.email && (
        <span className="block text-ink-3">
          {r.email.sent ? `Emailed ${r.email.to}: a new key is needed.` : `Email to ${r.email.to} not sent (${r.email.reason ?? "failed"}).`}
        </span>
      )}
    </span>
  );
}
