"use client";
import { useRef, useState } from "react";
import type { RatingKey } from "@/server/jobslake/ratingKeys";
import type { RatingsRunReport } from "@/server/jobslake/ratingsJob";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { LoadError, Loading, PageTitle, Panel, adminFetch, num, useAdmin } from "@/components/jobslake/ui";

interface RatingsView {
  keys: RatingKey[];
  coverage: { companies: number; rated: number; waiting: number };
}

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
    for (;;) {
      const r = await adminFetch<RatingsRunReport>("ratings/run", { method: "POST" });
      if (!r.ok) {
        setLog((l) => [...l, { tone: "warning", text: r.error.message }]);
        break;
      }
      const rep = r.data;
      checked += rep.checked;
      rated += rep.rated;
      for (const k of rep.retired) setLog((l) => [...l, { tone: "warning", text: `Key ${k.label ? `“${k.label}” ` : ""}${k.masked} is ${k.reason} — removed from the list.` }]);
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
      <PageTitle title="Company ratings" subtitle="Employee-review ratings (out of 5) from Explorium, looked up by each company's website. The job spends the keys below one after another." />
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
        </div>
      )}
    </>
  );
}
