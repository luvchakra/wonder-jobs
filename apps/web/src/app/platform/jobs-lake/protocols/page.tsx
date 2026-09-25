"use client";
import type { protocolDocument } from "@/server/jobslake/protocolDoc";
import { AccessBadge, LoadError, Loading, PageTitle, Panel, useAdmin } from "@/components/jobslake/ui";

type Doc = ReturnType<typeof protocolDocument>;

export default function ProtocolsPage() {
  const { data, error, reload } = useAdmin<Doc>("/api/jobs-lake/v1/protocol");
  return (
    <>
      <PageTitle title="Protocols" subtitle="JobsLake Protocol v1 — the contract WonderJobs and any other consumer use. Also served publicly at /api/jobs-lake/v1/protocol." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <div className="flex flex-col gap-4">
          <Panel title={`REST · ${data.base}`}>
            <ul className="divide-y divide-line">
              {data.endpoints.map((e) => (
                <li key={e.method + e.path} className="flex flex-col gap-0.5 py-2 text-[13px] md:flex-row md:items-baseline md:gap-3">
                  <span className="w-60 shrink-0 font-mono text-[12px] text-ink">
                    <span className={e.method === "GET" ? "text-success-600" : "text-brand-600"}>{e.method}</span> {e.path}
                  </span>
                  <span className="text-ink-2">{e.description}</span>
                  <span className="text-[12px] text-ink-4 md:ml-auto md:shrink-0">{e.auth}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title={`MCP · ${data.mcp.path}`}>
              <p className="mb-2 text-[12px] text-ink-3">
                {data.mcp.transport}. {data.mcp.auth}. Each tool calls the same code as its REST endpoint.
              </p>
              <ul className="flex flex-col gap-1.5 text-[13px]">
                {data.mcp.tools.map((t) => (
                  <li key={t.name}>
                    <span className="font-mono text-ink">{t.name}</span> — <span className="text-ink-3">{t.description}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Search request">
              <p className="text-[13px] text-ink-2">{data.searchRequest.note}</p>
              <p className="mt-2 font-mono text-[12px] text-ink-3">{data.searchRequest.fields.join(" · ")}</p>
              <p className="mt-3 text-[13px] font-medium text-ink">Stream events</p>
              <p className="font-mono text-[12px] text-ink-3">{data.events.join(" → ")}</p>
            </Panel>
            <Panel title="Canonical opportunity">
              <p className="font-mono text-[12px] leading-relaxed text-ink-3">{data.opportunityFields.join(" · ")}</p>
              <p className="mt-3 text-[13px] font-medium text-ink">Evidence authority (strongest first)</p>
              <ol className="list-decimal pl-5 text-[13px] text-ink-2">
                {data.authority.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ol>
            </Panel>
            <Panel title="Access labels & errors">
              <div className="flex flex-wrap gap-1">
                {Object.values(data.accessStrategies).map((l) => (
                  <AccessBadge key={l} label={l} />
                ))}
              </div>
              <p className="mt-3 font-mono text-[12px] leading-relaxed text-ink-3">{data.errors.join(" · ")}</p>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
