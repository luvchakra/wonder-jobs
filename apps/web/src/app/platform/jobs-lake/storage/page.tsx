"use client";
import { useState } from "react";
import type { SafeguardRun, SafeguardSettings } from "@/server/jobslake/safeguards";
import { Button } from "@/components/common/Button";
import { Input, Switch } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { adminFetch, LoadError, Loading, Meter, PageTitle, Panel, num, useAdmin } from "@/components/jobslake/ui";

type Data = { settings: SafeguardSettings; ranges: Record<string, [number, number]>; lastRun: SafeguardRun | null; usage: { dbBytes: number; tables: { name: string; rows: number; bytes: number }[] } | null };
const mb = (b: number) => `${Math.round(b / 1048576)} MB`;

const FIELDS: { key: Exclude<keyof SafeguardSettings, "enabled">; label: string; hint: string; unit: string }[] = [
  { key: "limitMb", label: "Database limit (ADB)", hint: "The application database's plan size: 500 on Free, 8000 on Pro.", unit: "MB" },
  { key: "dataLimitMb", label: "Data database limit (DDB)", hint: "The optional data database's plan size, for its headroom on Databases.", unit: "MB" },
  { key: "alertPercent", label: "Alert at", hint: "Overview warns past this share of the limit.", unit: "%" },
  { key: "staleDays", label: "Remove listings not seen for", hint: "WorksLake listings no source has shown since; saved or applied ones stay.", unit: "days" },
  { key: "gatewayMaxPerSource", label: "Gateway listings per source", hint: "Newest kept; older ones beyond this go.", unit: "max" },
  { key: "gatewayMaxAgeDays", label: "Gateway listings kept for", hint: "Not re-seen in this long, a gateway listing goes.", unit: "days" },
  { key: "maxDeletesPerRun", label: "Most removed in one pass", hint: "Keeps a pass short; the rest go next day.", unit: "rows" },
];

/**
 * Storage safeguards (owner, 2026-11-01): how full the database is, and the limits that keep it under its plan. A
 * daily pass applies them; Run now applies them at once.
 */
export default function StoragePage() {
  const { data, error, reload } = useAdmin<Data>("storage");
  // The admin's edits, over the saved settings until they save.
  const [edits, setDraft] = useState<SafeguardSettings | null>(null);
  const [busy, setBusy] = useState<"save" | "run" | null>(null);
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <Loading rows={3} />;
  const draft = edits ?? data.settings;
  const used = data.usage?.dbBytes ?? data.lastRun?.dbBytes ?? null;
  const share = used == null ? null : used / (data.settings.limitMb * 1048576);

  const save = async () => {
    setBusy("save");
    const r = await adminFetch("storage", { method: "POST", body: JSON.stringify({ settings: draft }) });
    setBusy(null);
    if (r.ok) {
      toast.success("Saved", "The next daily pass uses these.");
      setDraft(null);
    }
    else toast.error("Couldn't save", r.error.message);
    reload();
  };
  const runNow = async () => {
    setBusy("run");
    const r = await adminFetch<{ run: SafeguardRun }>("storage", { method: "POST", body: JSON.stringify({ run: true }) });
    setBusy(null);
    if (r.ok) toast.success("Done", `${num(r.data.run.opportunitiesDeleted)} stale listings and ${num(r.data.run.gatewayDeleted)} gateway listings removed${r.data.run.error ? `; ${r.data.run.error}` : ""}.`);
    else toast.error("Couldn't run", r.error.message);
    reload();
  };

  return (
    <>
      <PageTitle title="Storage" subtitle="How full the database is, and the limits that keep it under its plan. Applied once a day; Run now applies them at once." actions={<Button size="sm" variant="outline" loading={busy === "run"} onClick={() => void runNow()}>Run now</Button>} />
      <Panel title={used == null ? "Database size unavailable" : `${mb(used)} of ${num(data.settings.limitMb)} MB`}>
        {share != null && <Meter label="Used" value={share} />}
        {data.usage && (
          <ul className="mt-3 flex flex-col gap-1 text-[12.5px] text-ink-2">
            {data.usage.tables.slice(0, 6).map((t) => (
              <li key={t.name} className="flex justify-between gap-2">
                <span className="truncate">{t.name}</span>
                <span className="shrink-0 tabular-nums text-ink-3">
                  {num(t.rows)} rows · {mb(t.bytes)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {data.lastRun && (
          <p className="mt-3 text-[12px] text-ink-3">
            Last pass {new Date(data.lastRun.at).toLocaleString()}: {num(data.lastRun.opportunitiesDeleted)} stale listings removed ({num(data.lastRun.opportunitiesKept)} kept, saved or applied), {num(data.lastRun.gatewayDeleted)} gateway listings removed{data.lastRun.error ? ` · ${data.lastRun.error}` : ""}.
          </p>
        )}
      </Panel>
      <Panel title="Limits" className="mt-4">
        <div className="flex flex-col gap-4 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="font-medium text-ink">Remove old data automatically</span>
              <span className="block text-[12px] text-ink-3">Off: nothing is deleted; the size is still measured and alerted.</span>
            </span>
            <Switch checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} label="Remove old data automatically" />
          </div>
          {FIELDS.map((f) => {
            const [lo, hi] = data.ranges[f.key] ?? [0, 0];
            return (
              <label key={f.key} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{f.label}</span>
                  <span className="block text-[12px] text-ink-3">{f.hint}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Input type="number" min={lo} max={hi} value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })} className="h-9 w-28 text-right tabular-nums" aria-label={f.label} />
                  <span className="w-10 text-[12px] text-ink-3">{f.unit}</span>
                </span>
              </label>
            );
          })}
          <Button className="self-start" loading={busy === "save"} onClick={() => void save()}>
            Save limits
          </Button>
        </div>
      </Panel>
    </>
  );
}
