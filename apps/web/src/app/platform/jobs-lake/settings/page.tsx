"use client";
import type { JobsLakeFlags } from "@/server/jobslake/flags";
import type { StoreStatus } from "@/server/jobslake/store";
import Link from "next/link";
import { StatusPill } from "@/components/common/Badge";
import { useState } from "react";
import { LoadError, Loading, Note, PageTitle, Panel, adminFetch, useAdmin } from "@/components/jobslake/ui";
import { Segmented } from "@/components/common/Input";
import { UI_LABEL, type UiConfig, type UiVersion } from "@/domain/platform/ui";
import { platformUiChanged, setUiPreview, uiPreview } from "@/lib/ui";

type Settings = {
  actor: string;
  flags: JobsLakeFlags;
  store: StoreStatus;
  access: { authConfigured: boolean; adminAllowlist: number; localAdminMode: boolean; serviceToken: "set" | "too_short" | "not_set" };
  credentialEncryption: boolean;
};

const FLAG_INFO: { key: keyof JobsLakeFlags; env: string; label: string; off: string }[] = [
  { key: "jobsLakeEnabled", env: "JOBSLAKE_ENABLED", label: "WorksLake", off: "Everything below is off; WonderWorks searches each source directly." },
  { key: "jobsLakeSearchEnabled", env: "JOBSLAKE_SEARCH_ENABLED", label: "Search through WorksLake", off: "WonderWorks searches each source directly." },
  { key: "jobsLakeStreamingEnabled", env: "JOBSLAKE_STREAMING_ENABLED", label: "Streaming search", off: "Searches return in one response." },
  { key: "jobsLakeWarmPoolEnabled", env: "JOBSLAKE_WARM_POOL_ENABLED", label: "Warm pool", off: "Nothing is stored; every search is live only." },
  { key: "jobsLakeMcpEnabled", env: "JOBSLAKE_MCP_ENABLED", label: "MCP interface", off: "The MCP endpoint answers 404." },
  { key: "jobsLakeAdminEnabled", env: "JOBSLAKE_ADMIN_ENABLED", label: "Admin portal", off: "This portal and the admin API answer 404." },
];

/**
 * Which UI everyone sees (domain/platform/ui.ts; owner, 2026-11-28). The one switch on this page an admin sets here
 * rather than in the deployment: it changes only the look, and switching back is the same press.
 */
function LookPanel() {
  const { data, error, reload } = useAdmin<{ ui: UiConfig }>("ui");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // null follows the platform; read once on mount (this panel only renders in the browser, after the fetch).
  const [preview, setPreview] = useState<UiVersion | null>(() => (typeof window === "undefined" ? null : uiPreview()));
  const choose = async (version: UiVersion) => {
    setSaving(true);
    setFailed(null);
    const r = await adminFetch<{ ui: UiConfig }>("ui", { method: "PUT", body: JSON.stringify({ version }) });
    setSaving(false);
    if (!r.ok) return setFailed(r.error.message);
    platformUiChanged(r.data.ui.version);
    void reload();
  };
  return (
    <Panel title="Look">
      {error && <LoadError error={error} onRetry={reload} />}
      {data && (
        <div className="flex flex-col gap-3 text-[13px]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              <span className="font-medium text-ink">Everyone sees</span>
              <span className="block text-[12px] text-ink-3">
                Switches every user within about a minute. Only the look changes; switch back the same way.
                {data.ui.updatedBy && data.ui.updatedAt ? ` Last set by ${data.ui.updatedBy}, ${new Date(data.ui.updatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : ""}
              </span>
            </span>
            <Segmented value={String(data.ui.version)} onChange={(v) => !saving && Number(v) !== data.ui.version && void choose(Number(v) as UiVersion)} label="Everyone sees" options={[{ value: "1", label: UI_LABEL[1] }, { value: "2", label: UI_LABEL[2] }]} />
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              <span className="font-medium text-ink">This device</span>
              <span className="block text-[12px] text-ink-3">Try a UI here, in this browser only, before switching everyone.</span>
            </span>
            <Segmented
              value={preview === null ? "0" : String(preview)}
              onChange={(v) => {
                const next = v === "0" ? null : (Number(v) as UiVersion);
                setUiPreview(next);
                setPreview(next);
              }}
              label="This device"
              options={[{ value: "0", label: "As everyone" }, { value: "1", label: UI_LABEL[1] }, { value: "2", label: UI_LABEL[2] }]}
            />
          </div>
          {failed && <Note tone="danger">Not switched: {failed}</Note>}
        </div>
      )}
    </Panel>
  );
}

export default function SettingsPage() {
  const { data, error, reload } = useAdmin<Settings>("settings");
  return (
    <>
      <PageTitle
        title="Feature switches"
        subtitle="Look is set here. Every other switch is read-only: an environment variable, so each change is a deploy-time decision and is reversible without code."
        actions={
          <Link href="/platform/jobs-lake/protocols" className="text-[13px] font-medium text-brand-600 hover:underline">
            WorksLake protocol
          </Link>
        }
      />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <div className="flex flex-col gap-4">
          <LookPanel />
          <Panel title="Feature flags">
            <ul className="divide-y divide-line">
              {FLAG_INFO.map((f) => (
                <li key={f.key} className="flex flex-col gap-1 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="font-medium text-ink">{f.label}</span> <span className="font-mono text-[11px] text-ink-4">{f.env}</span>
                    {!data.flags[f.key] && <span className="block text-[12px] text-ink-3">{f.off}</span>}
                  </span>
                  <StatusPill tone={data.flags[f.key] ? "success" : "neutral"} label={data.flags[f.key] ? "On" : "Off"} />
                </li>
              ))}
            </ul>
          </Panel>
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Storage">
              <Note tone={data.store.durable ? "success" : "warning"}>{data.store.message}</Note>
            </Panel>
            <Panel title="Access">
              <ul className="flex flex-col gap-1.5 text-[13px] text-ink-2">
                <li>Signed in as {data.actor}</li>
                <li>{data.access.authConfigured ? `Admins: ${data.access.adminAllowlist} email${data.access.adminAllowlist === 1 ? "" : "s"} in JOBSLAKE_ADMIN_EMAILS` : data.access.localAdminMode ? "Local development mode (JOBSLAKE_LOCAL_ADMIN) — no real authentication" : "Auth not configured"}</li>
                <li>Service / MCP token: {data.access.serviceToken === "set" ? "set" : data.access.serviceToken === "too_short" ? "set but shorter than 24 characters — refused" : "not set — service callers are refused"}</li>
                <li>Credential encryption key: {data.credentialEncryption ? "set" : "not set — credentials can't be stored durably"}</li>
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
