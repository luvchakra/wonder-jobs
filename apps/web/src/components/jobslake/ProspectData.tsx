"use client";
import { ChevronDown, Copy } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import type { ProspectAdminView } from "@/server/gateway/prospectsAdmin";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Field, Input, Switch } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { adminFetch, ConfirmAction, LoadError, Loading, Note, num, useAdmin } from "@/components/jobslake/ui";
import { relativeTime } from "@/lib/format";

const post = (body: Record<string, unknown>) => adminFetch<Record<string, unknown>>("prospects", { method: "POST", body: JSON.stringify(body) });

/**
 * Sources → Import → Prospect data (WJ-815, docs/PROSPECT_DATA_API.md): what WonderArk may read from WorksLake.
 * Closed until wanted, and it reads nothing until opened. Inside: the switch that lets an outside product hold a key,
 * its key (issued once, shown once), the stored sources it reads, each business's monthly allowance and this month's use.
 */
export function ProspectData() {
  const [opened, setOpened] = useState(false);
  const { data, error, reload } = useAdmin<ProspectAdminView>(opened ? "prospects" : null);
  return (
    <details className="wj-card group px-4 md:px-5" onToggle={(e) => e.currentTarget.open && setOpened(true)}>
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">Prospect data</span>
          <span className="block text-[12px] text-ink-3">What WonderArk may read from WorksLake: its key, each business&apos;s monthly allowance, and this month&apos;s use</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-4 pb-4 pt-1 md:pb-5">
        {error ? <LoadError error={error} onRetry={reload} /> : !data ? <Loading rows={2} /> : !data.configured ? <Note tone="warning">The gateway isn&apos;t configured on this deployment, so there is nothing to serve.</Note> : <Body d={data} reload={reload} />}
      </div>
    </details>
  );
}

function Body({ d, reload }: { d: ProspectAdminView; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const act = async (body: Record<string, unknown>, failed: string) => {
    setBusy(true);
    const r = await post(body);
    setBusy(false);
    if (!r.ok) toast.error(failed, r.error.message);
    reload();
    return r;
  };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <span className="text-ink-3">
          Let WonderArk read prospect data.{" "}
          {d.forcedOn ? "On for this deployment (GATEWAY_ALLOW_EXTERNAL_CONSUMERS is set)." : d.allowExternalConsumers ? "On. Turning it off stops new keys, not one already issued; Revoke does that." : "Off: no outside product can hold a key."}
        </span>
        <Switch label="Let WonderArk read prospect data" checked={d.allowExternalConsumers} disabled={busy || d.forcedOn} onChange={(on) => void act({ action: "outside", on }, "Couldn't save")} />
      </div>

      <section className="flex flex-col gap-2" aria-label="WonderArk's key">
        {issued && (
          <Note tone="success">
            <span className="block font-medium">Copy this key now. It isn&apos;t shown again.</span>
            <span className="mt-1 block break-all font-mono text-[12px]">{issued}</span>
            <span className="mt-1 block">
              In WonderArk&apos;s settings set WORKSLAKE_GATEWAY_URL to <span className="font-mono">{d.gatewayUrl}</span> and WORKSLAKE_GATEWAY_API_KEY to this key.
            </span>
            <Button
              className="mt-2"
              size="sm"
              variant="outline"
              icon={<Copy className="size-3.5" aria-hidden />}
              onClick={() => void navigator.clipboard.writeText(issued).then(() => toast.success("Key copied"), () => toast.error("Couldn't copy", "Select the key and copy it by hand."))}
            >
              Copy key
            </Button>
          </Note>
        )}
        {d.keys.map((k) => (
          <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="text-ink-2">
              <span className="font-mono">{k.prefix}…</span> · issued {relativeTime(k.createdAt)}
            </span>
            <ConfirmAction
              label="Revoke"
              title="Revoke this key?"
              body="WonderArk stops reading prospect data within seconds, until a new key is issued and set there."
              confirmLabel="Revoke key"
              onConfirm={async () => {
                const r = await post({ action: "revoke_key", id: k.id });
                reload();
                return r.ok ? null : r.error.message;
              }}
            />
          </div>
        ))}
        {!d.keys.length && !issued && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="text-ink-3">{d.allowExternalConsumers ? "WonderArk has no key yet." : "Turn the switch on to issue WonderArk's key."}</span>
            <Button
              size="sm"
              variant="primary"
              loading={busy}
              disabled={!d.allowExternalConsumers}
              onClick={async () => {
                const r = await act({ action: "issue_key" }, "Couldn't issue the key");
                if (r.ok && typeof r.data.key === "string") setIssued(r.data.key);
              }}
            >
              Issue WonderArk key
            </Button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-1.5" aria-label="Stored sources">
        <h3 className="text-[13px] font-medium text-ink-2">Stored sources</h3>
        {!d.sources.length && <span className="text-[13px] text-ink-3">No source is bound to a prospect dataset yet. The OpenStreetMap services sources bind on their next collection.</span>}
        {d.sources.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="min-w-0 text-ink-2">
              {s.name} · {s.datasets.join(", ")} · {s.state === "not_added" ? "not added yet" : `${num(s.rows)} rows${s.lastSuccessAt ? ` · collected ${relativeTime(s.lastSuccessAt)}` : " · nothing delivered yet"}`}
            </span>
            <span className="flex items-center gap-1.5">
              {s.termsPending && <Badge tone="warning">Terms pending</Badge>}
              <Badge tone={s.live && s.outside ? "success" : "neutral"}>{s.state === "not_added" ? "Not added" : !s.live ? (s.state === "ready" ? "Ready" : "Waiting") : s.outside ? "Served to WonderArk" : "WorksLake only"}</Badge>
              {/* One action, and only for a source this card manages (one that feeds prospect data alone). */}
              {s.own && s.state === "not_added" && (
                <Button size="sm" variant="outline" loading={busy} title="Adds it paused. Then run its collection on GitHub (Actions → Overture Maps collection) and come back to activate it." onClick={() => void act({ action: "add_source", file: s.id }, "Couldn't add the source")}>
                  Add
                </Button>
              )}
              {s.own && s.state === "ready" && (
                <Button size="sm" variant="outline" loading={busy} onClick={() => void act({ action: "activate_source", id: s.id }, "Couldn't activate the source")}>
                  Activate
                </Button>
              )}
              {s.own && s.state === "live" && (
                <Button size="sm" variant="ghost" loading={busy} onClick={() => void act({ action: "pause_source", id: s.id }, "Couldn't pause the source")}>
                  Pause
                </Button>
              )}
            </span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-1.5" aria-label="Live providers">
        <h3 className="text-[13px] font-medium text-ink-2">Live providers</h3>
        <span className="text-[12px] text-ink-3">
          Asked only when a search names one; nothing they return is stored. <Link href="/platform/jobs-lake/platform-keys" className="text-brand-600 hover:underline">Keys</Link>
        </span>
        {d.providers.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="min-w-0 text-ink-2">
              {p.label} · {p.kinds.join(", ")} · {p.paid ? "1 paid unit a page" : "free"} · {p.cacheHours ? `answers kept ${num(p.cacheHours)} h` : "answers not kept"}
            </span>
            <span className="flex items-center gap-1.5">
              {p.termsPending && <Badge tone="warning">Terms pending</Badge>}
              <Badge tone={p.ready ? "success" : "neutral"}>{p.ready ? "Active" : "Needs setup"}</Badge>
            </span>
          </div>
        ))}
      </section>

      <Usage d={d} />
      <Allowance d={d} reload={reload} />
    </>
  );
}

function Usage({ d }: { d: ProspectAdminView }) {
  const rows = d.usage.consumers;
  return (
    <section className="flex flex-col gap-1.5" aria-label="This month's use">
      <h3 className="text-[13px] font-medium text-ink-2">This month ({d.usage.month})</h3>
      {!rows.length && <span className="text-[13px] text-ink-3">No prospect request yet this month.</span>}
      {rows.map((c) => (
        <details key={c.consumerId} className="text-[13px]">
          <summary className="cursor-pointer text-ink-2">
            {c.consumerId}: {num(c.searches)} searches · {num(c.results)} results · {num(c.paidUnits)} paid units · {num(c.tenants.length)} businesses
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5 pl-4 text-ink-3">
            {c.tenants.slice(0, 50).map((t) => (
              <li key={t.tenant}>
                <span className="font-mono">{t.tenant}</span>: {num(t.searches)} of {num(d.quotas.search)} searches · {num(t.paidUnits)} of {num(d.quotas.paid)} paid units
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}

function Allowance({ d, reload }: { d: ProspectAdminView; reload: () => void }) {
  const [search, setSearch] = useState(String(d.quotas.search));
  const [paid, setPaid] = useState(String(d.quotas.paid));
  const [cap, setCap] = useState(String(d.paidPlatformCap));
  const [saving, setSaving] = useState(false);
  const whole = (v: string) => (/^\d{1,7}$/.test(v.trim()) ? Number(v.trim()) : null);
  const changed = whole(search) !== d.quotas.search || whole(paid) !== d.quotas.paid || whole(cap) !== d.paidPlatformCap;
  const valid = whole(search) !== null && whole(paid) !== null && whole(cap) !== null;
  return (
    <details className="text-[13px]">
      <summary className="cursor-pointer text-ink-2">
        Allowance: {num(d.quotas.search)} searches and {num(d.quotas.paid)} paid units per business each month · {num(d.paidPlatformCap)} paid units across all
      </summary>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <Field label="Searches per business" htmlFor="pd-search">
          <Input id="pd-search" inputMode="numeric" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <Field label="Paid units per business" htmlFor="pd-paid">
          <Input id="pd-paid" inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} />
        </Field>
        <Field label="Paid units, all businesses" htmlFor="pd-cap">
          <Input id="pd-cap" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} />
        </Field>
      </div>
      <Button
        className="mt-3"
        size="sm"
        variant="outline"
        loading={saving}
        disabled={!changed || !valid}
        onClick={async () => {
          setSaving(true);
          const r = await post({ action: "quotas", search: whole(search), paid: whole(paid), paidPlatformCap: whole(cap) });
          setSaving(false);
          if (r.ok) toast.success("Allowance saved");
          else toast.error("Couldn't save", r.error.message);
          reload();
        }}
      >
        Save allowance
      </Button>
    </details>
  );
}
