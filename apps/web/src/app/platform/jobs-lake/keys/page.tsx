"use client";
import { useState } from "react";
import type { PlatformKeyStatus } from "@/server/jobslake/platformKeys";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { adminFetch, LoadError, Loading, PageTitle, Panel, useAdmin } from "@/components/jobslake/ui";

/**
 * The API keys sources need, set here on the platform instead of in the hosting dashboard (owner, 2026-11-01).
 * Encrypted on the server and shown only masked; a deployment variable of the same name, if any, still wins.
 */
export default function ApiKeysPage() {
  const { data, error, reload } = useAdmin<{ keys: PlatformKeyStatus[] }>("keys");
  const missing = data?.keys.filter((k) => !k.set).length ?? 0;
  return (
    <>
      <PageTitle title="API keys" subtitle="Keys the sources need. Saved encrypted on the server and shown only masked; a source that needs one says Needs setup until it's set." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <Panel title={missing ? `${missing} of ${data.keys.length} not set` : "All set"}>
          <ul className="flex flex-col divide-y divide-line">
            {data.keys.map((k) => (
              <KeyRow key={k.name} k={k} onChanged={reload} />
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

function KeyRow({ k, onChanged }: { k: PlatformKeyStatus; onChanged: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const send = async (v: string | null) => {
    setBusy(true);
    setMsg(null);
    const r = await adminFetch<{ message: string }>("keys", { method: "POST", body: JSON.stringify({ name: k.name, value: v }) });
    setBusy(false);
    setMsg(r.ok ? r.data.message : r.error.message);
    if (r.ok) setValue("");
    onChanged();
  };
  return (
    <li className="flex flex-col gap-2 py-3 text-[13px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="min-w-0">
          <span className="font-medium text-ink">{k.label}</span> <code className="text-[11.5px] text-ink-4">{k.name}</code>
          <span className="block text-[12px] text-ink-3">{k.usedBy}</span>
        </span>
        <span className={k.set ? "text-[12px] font-medium text-success-600" : "text-[12px] font-medium text-warning-600"}>{k.masked}</span>
      </div>
      {k.from !== "environment" && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(value);
          }}
        >
          <Input type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder={k.set ? "Paste a new value to replace it" : "Paste the key"} aria-label={k.label} className="h-9 min-w-0 flex-1" />
          <Button type="submit" size="sm" loading={busy} disabled={value.trim().length < 4}>
            {k.set ? "Replace" : "Save"}
          </Button>
          {k.set && (
            <button type="button" disabled={busy} onClick={() => void send(null)} className="text-[12px] font-medium text-danger-600 hover:underline">
              Remove
            </button>
          )}
        </form>
      )}
      <span className="text-[12px] text-ink-3">
        {k.free ? "Free · " : ""}
        <a href={k.signup} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">
          Get a key
        </a>
        {msg ? ` · ${msg}` : ""}
      </span>
    </li>
  );
}
