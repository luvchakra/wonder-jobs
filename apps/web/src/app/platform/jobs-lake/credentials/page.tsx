"use client";
import Link from "next/link";
import type { SourceView } from "@/server/jobslake/views";
import { relativeTime } from "@/lib/format";
import { StatusPill } from "@/components/common/Badge";
import { LoadError, Loading, Note, PageTitle, Panel, ResponsiveTable, useAdmin } from "@/components/jobslake/ui";

/** Which sources hold a credential, and in what state. Values are never shown — only a mask. */
export default function CredentialsPage() {
  const { data, error, reload } = useAdmin<{ sources: SourceView[] }>("sources");
  const rows = (data?.sources ?? []).filter((s) => s.credential || s.config.kind === "json_api" || s.config.kind === "mcp");
  return (
    <>
      <PageTitle title="Credentials" subtitle="Encrypted with AES-256-GCM on the server and shown only masked. Set or replace one from its source's Configuration tab." />
      <div className="mb-4">
        <Note>JobsLake never returns a credential through any API, never logs one, and never puts one in an error message.</Note>
      </div>
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <Panel>
          <ResponsiveTable
            rows={rows}
            rowKey={(r) => r.id}
            empty="No source uses a credential."
            columns={[
              { header: "Source", cell: (r) => <Link href={`/platform/jobs-lake/sources/${r.id}`} className="font-medium text-ink hover:underline">{r.name}</Link> },
              { header: "Managed by", cell: (r) => (r.credential?.managedBy === "environment" ? "Deployment environment" : "JobsLake") },
              { header: "State", cell: (r) => <StatusPill tone={r.credential?.present ? "success" : "warning"} label={r.credential?.present ? "Set" : "Missing"} /> },
              { header: "Value", cell: (r) => <span className="font-mono text-[12px]">{r.credential?.masked ?? "—"}</span> },
              { header: "Last changed", cell: (r) => (r.credential?.replacedAt ? relativeTime(r.credential.replacedAt) : r.credential?.createdAt ? relativeTime(r.credential.createdAt) : "—") },
            ]}
            card={(r) => (
              <Link href={`/platform/jobs-lake/sources/${r.id}`} className="flex items-center justify-between gap-2 text-[13px]">
                <span>
                  <span className="font-medium text-ink">{r.name}</span>
                  <span className="block font-mono text-[12px] text-ink-3">{r.credential?.masked ?? "—"}</span>
                </span>
                <StatusPill tone={r.credential?.present ? "success" : "warning"} label={r.credential?.present ? "Set" : "Missing"} />
              </Link>
            )}
          />
        </Panel>
      )}
    </>
  );
}
