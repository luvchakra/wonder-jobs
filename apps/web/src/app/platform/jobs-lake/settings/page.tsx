"use client";
import type { JobsLakeFlags } from "@/server/jobslake/flags";
import type { StoreStatus } from "@/server/jobslake/store";
import { StatusPill } from "@/components/common/Badge";
import { LoadError, Loading, Note, PageTitle, Panel, useAdmin } from "@/components/jobslake/ui";

type Settings = {
  actor: string;
  flags: JobsLakeFlags;
  store: StoreStatus;
  access: { authConfigured: boolean; adminAllowlist: number; localAdminMode: boolean; serviceToken: "set" | "too_short" | "not_set" };
  credentialEncryption: boolean;
};

const FLAG_INFO: { key: keyof JobsLakeFlags; env: string; label: string; off: string }[] = [
  { key: "jobsLakeEnabled", env: "JOBSLAKE_ENABLED", label: "JobsLake", off: "Everything below is off; WonderJobs searches each source directly." },
  { key: "jobsLakeSearchEnabled", env: "JOBSLAKE_SEARCH_ENABLED", label: "Search through JobsLake", off: "WonderJobs searches each source directly." },
  { key: "jobsLakeStreamingEnabled", env: "JOBSLAKE_STREAMING_ENABLED", label: "Streaming search", off: "Searches return in one response." },
  { key: "jobsLakeWarmPoolEnabled", env: "JOBSLAKE_WARM_POOL_ENABLED", label: "Warm pool", off: "Nothing is stored; every search is live only." },
  { key: "jobsLakeMcpEnabled", env: "JOBSLAKE_MCP_ENABLED", label: "MCP interface", off: "The MCP endpoint answers 404." },
  { key: "jobsLakeAdminEnabled", env: "JOBSLAKE_ADMIN_ENABLED", label: "Admin portal", off: "This portal and the admin API answer 404." },
];

export default function SettingsPage() {
  const { data, error, reload } = useAdmin<Settings>("settings");
  return (
    <>
      <PageTitle title="Settings" subtitle="Read-only: every switch is an environment variable, so each change is a deploy-time decision and is reversible without code." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <div className="flex flex-col gap-4">
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
