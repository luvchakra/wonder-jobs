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
/** Admin → Keys' sections, in order (owner, 2026-11-06: the platform's own settings moved here from Vercel). */
const GROUPS: { id: NonNullable<PlatformKeyStatus["group"]>; title: string; hint: string }[] = [
  { id: "email", title: "Email", hint: "The mailbox every WonderWorks email is sent from, and the team's addresses." },
  { id: "ai", title: "WonderWorks AI", hint: "The platform-billed model behind WonderWorks AI drafts and Ask Wonder." },
  { id: "push", title: "Push notifications", hint: "The key pair browsers use to receive WonderWorks notifications." },
  { id: "runner", title: "Collection runner", hint: "Lets Import now start the collection on GitHub Actions instead of the site." },
  { id: "sources", title: "Sources", hint: "The API keys the data sources need." },
];

export default function ApiKeysPage() {
  const { data, error, reload } = useAdmin<{ keys: PlatformKeyStatus[] }>("keys");
  return (
    <>
      <PageTitle title="Keys" subtitle="The platform's settings and every source's key, in one place. Secrets are saved encrypted and shown only masked; a value still set in the deployment wins, and Copy from the deployment moves it here so the deployment's variable can be deleted." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data &&
        GROUPS.map((g) => {
          const keys = data.keys.filter((k) => (k.group ?? "sources") === g.id);
          if (!keys.length) return null;
          const missing = keys.filter((k) => !k.set).length;
          return (
            <Panel key={g.id} title={`${g.title}${missing ? ` · ${missing} of ${keys.length} not set` : " · all set"}`} className="mb-4">
              <p className="-mt-1 mb-1 text-[12.5px] text-ink-3">{g.hint}</p>
              <ul className="flex flex-col divide-y divide-line">
                {keys.map((k) => (
                  <KeyRow key={k.name} k={k} onChanged={reload} />
                ))}
              </ul>
              {g.id === "email" && <GroupAction action="test_email" label="Send a test email" busyLabel="Sending" />}
              {g.id === "push" && !keys.some((k) => k.set && k.name !== "VAPID_SUBJECT") && <GroupAction action="generate_vapid" label="Generate a key pair" busyLabel="Generating" onDone={reload} />}
            </Panel>
          );
        })}
      <CredentialsPanel />
    </>
  );
}

/** One button under a section (Send a test email, Generate a key pair), with its answer beside it. */
function GroupAction({ action, label, busyLabel, onDone }: { action: string; label: string; busyLabel: string; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
      <Button
        size="sm"
        variant="outline"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await adminFetch<{ message: string }>("keys", { method: "POST", body: JSON.stringify({ action }) });
          setBusy(false);
          setMsg(r.ok ? r.data.message : r.error.message);
          if (r.ok) onDone?.();
        }}
      >
        {busy ? busyLabel : label}
      </Button>
      {msg && <span className="text-ink-3">{msg}</span>}
    </div>
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
  const importEnv = async () => {
    setBusy(true);
    setMsg(null);
    const r = await adminFetch<{ message: string }>("keys", { method: "POST", body: JSON.stringify({ name: k.name, importEnv: true }) });
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
            <span className="flex flex-wrap items-center gap-2">
              {(k.envCount ?? 0) > 0 && (
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void importEnv()}>
                  Copy {k.envCount} from the deployment
                </Button>
              )}
              <Button type="submit" size="sm" loading={busy} disabled={value.trim().length < 4}>
                Add {value.split(/[\s,]+/).filter((x) => x.trim().length >= 4).length > 1 ? "keys" : "key"}
              </Button>
            </span>
          </form>
        </div>
      )}
      {!k.multi && k.from === "environment" && (
        <span className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void importEnv()}>
            Copy from the deployment
          </Button>
          <span className="text-[12px] text-ink-3">Then delete {k.name} in Vercel; this value takes over.</span>
        </span>
      )}
      {!k.multi && k.from !== "environment" && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(value);
          }}
        >
          <Input type={k.plain ? "text" : "password"} autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder={k.set ? (k.plain ? "Type a new value to replace it" : "Paste a new value to replace it") : k.plain ? "Type the value" : "Paste the key"} aria-label={k.label} className="h-9 min-w-0 flex-1" />
          <Button type="submit" size="sm" loading={busy} disabled={value.trim().length < (k.minLength ?? 4)}>
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
        {(k.group ?? "sources") === "sources" && (
          <>
            {k.free ? "Free · " : ""}
            <a href={k.signup} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">
              Get a key
            </a>
          </>
        )}
        {k.name === "GITHUB_DISPATCH_TOKEN" && (
          <a href={k.signup} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">
            Create a token
          </a>
        )}
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
