"use client";
import { useState } from "react";
import type { PlatformKeyStatus } from "@/server/jobslake/platformKeys";
import { Button } from "@/components/common/Button";
import { Input, Textarea } from "@/components/common/Input";
import { adminFetch, LoadError, Loading, PageTitle, Panel, useAdmin } from "@/components/jobslake/ui";
import { CredentialsPanel } from "@/components/jobslake/CredentialsPanel";

/**
 * The API keys sources need, set here on the platform instead of in the hosting dashboard (owner, 2026-11-01).
 * Encrypted on the server and shown only masked; a deployment variable of the same name, if any, still wins.
 */
export default function ApiKeysPage() {
  const { data, error, reload } = useAdmin<{ keys: PlatformKeyStatus[] }>("keys");
  const missing = data?.keys.filter((k) => !k.set).length ?? 0;
  return (
    <>
      <PageTitle title="Keys" subtitle="Every key and credential the sources need, in one place. Saved encrypted on the server and shown only masked; a source that needs one says Needs setup until it's set." />
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
      <CredentialsPanel />
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
  const removeAt = async (i: number) => {
    setBusy(true);
    setMsg(null);
    const r = await adminFetch<{ message: string }>("keys", { method: "POST", body: JSON.stringify({ name: k.name, removeAt: i }) });
    setBusy(false);
    setMsg(r.ok ? r.data.message : r.error.message);
    onChanged();
  };
  const test = async () => {
    setBusy(true);
    setMsg(null);
    const r = await adminFetch<{ ok: boolean; message: string }>("keys", { method: "POST", body: JSON.stringify({ name: k.name, test: true }) });
    setBusy(false);
    setMsg(r.ok ? r.data.message : r.error.message);
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
      {k.multi && (
        <div className="flex flex-col gap-2">
          {/* Several keys, used in turn (owner, 2026-11-05: "configure multiple key setup in admin"): each masked, each removable. */}
          {k.keys && k.keys.length > 0 && (
            <ul className="flex flex-col gap-1">
              {k.keys.map((m, i) => (
                <li key={`${m}-${i}`} className="flex items-center justify-between gap-2 rounded-[8px] bg-bg-soft px-2.5 py-1.5">
                  <code className="text-[12px] text-ink-2">{m}</code>
                  <button type="button" disabled={busy} onClick={() => void removeAt(i)} className="text-[12px] font-medium text-danger-600 hover:underline">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(value);
            }}
          >
            <Textarea autoComplete="off" rows={2} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste one or more keys, one per line" aria-label={k.label} className="[-webkit-text-security:disc]" />
            <span>
              <Button type="submit" size="sm" loading={busy} disabled={value.trim().length < 4}>
                Add {value.split(/[\s,]+/).filter((x) => x.trim().length >= 4).length > 1 ? "keys" : "key"}
              </Button>
            </span>
          </form>
        </div>
      )}
      {!k.multi && k.from !== "environment" && (
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
        {k.set && k.testable && (
          <>
            {" · "}
            <button type="button" disabled={busy} onClick={() => void test()} className="font-medium text-brand-600 hover:underline">
              Test
            </button>
          </>
        )}
        {msg ? ` · ${msg}` : ""}
      </span>
    </li>
  );
}
