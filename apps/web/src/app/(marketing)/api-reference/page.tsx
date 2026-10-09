import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/landing/MarketingPage";
import { protocolDocument } from "@/server/jobslake/protocolDoc";
import { loadApiPlan } from "@/server/jobslake/apiPlanSettings";
import { BUILTIN_SOURCES } from "@/server/jobslake/registry";
import { siteUrl } from "@/lib/siteUrl";

export const metadata: Metadata = { title: "JobsLake API reference", description: "Search live job sources from your own code: API keys, endpoints, request and response fields, streaming events, MCP tools, limits and errors." };

/** Re-read every few minutes: the free allowance and the sources a key reaches are set in billing admin. */
export const revalidate = 300;

const Code = ({ children }: { children: string }) => <pre className="mt-3 overflow-x-auto rounded-[12px] bg-[#0e1030] p-4 text-[12.5px] leading-relaxed text-white/90">{children}</pre>;
const Table = ({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) => (
  <div className="mt-3 overflow-x-auto">
    <table className="w-full text-left text-[13px]">
      <thead>
        <tr className="border-b border-line text-ink-3">
          {head.map((h) => (
            <th key={h} className="py-2 pr-4 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-line align-top">
            {r.map((c, j) => (
              <td key={j} className="py-2 pr-4">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** The JobsLake Protocol, readable: the same document /api/jobs-lake/v1/protocol serves as JSON. */
export default async function ApiReferencePage() {
  await loadApiPlan().catch(() => undefined);
  const doc = protocolDocument();
  const origin = siteUrl().origin;
  const base = `${origin}${doc.base}`;
  const sourceName = (id: string) => BUILTIN_SOURCES.find((s) => s.id === id)?.name ?? id;
  const keyEndpoints = doc.endpoints.filter((e) => /API key|Public/.test(e.auth));
  const otherEndpoints = doc.endpoints.filter((e) => !/API key|Public/.test(e.auth));

  return (
    <MarketingPage
      eyebrow="Developers"
      title="JobsLake API reference"
      intro={`Search the same live job sources WonderJobs uses, from your own code. Protocol version ${doc.version}.`}
      sections={[
        {
          id: "start",
          title: "Get started",
          body: (
            <>
              <ol>
                <li>
                  Sign in and create a key under <Link href="/app/profile#jobslake-api">Account → API keys</Link>. It&apos;s shown once; up to 5 active keys per account.
                </li>
                <li>
                  Send it on every request: <code>{doc.apiKeys.header}</code>.
                </li>
                <li>Search:</li>
              </ol>
              <Code>{`curl -X POST ${base}/search \\
  -H "Authorization: Bearer jl_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{"query":{"text":"product manager","locations":["Bengaluru"]},"limit":20}'`}</Code>
            </>
          ),
        },
        {
          id: "pricing",
          title: "Usage, limits and billing",
          body: (
            <ul>
              <li>{doc.apiKeys.units}</li>
              <li>
                {doc.apiKeys.freePerMonth.toLocaleString("en-US")} free units each calendar month (UTC). {doc.apiKeys.overFree}
              </li>
              <li>{doc.apiKeys.rateLimit}</li>
              <li>Your month&apos;s usage and pay-as-you-go are under Account → API keys.</li>
            </ul>
          ),
        },
        {
          id: "sources",
          title: "Sources a key can reach",
          body: (
            <>
              <p>{doc.apiKeys.sourcesNote}</p>
              <ul>
                {doc.apiKeys.sources.map((id) => (
                  <li key={id}>
                    {sourceName(id)} <code>{id}</code>
                  </li>
                ))}
              </ul>
            </>
          ),
        },
        {
          id: "endpoints",
          title: "Endpoints",
          body: (
            <>
              <p>
                Base URL: <code>{base}</code>
              </p>
              <Table head={["Method", "Path", "What it does"]} rows={keyEndpoints.map((e) => [<code key="m">{e.method}</code>, <code key="p">{e.path}</code>, e.description])} />
              {otherEndpoints.length > 0 && <p className="mt-4 text-[13px] text-ink-3">Also on the protocol, for WonderJobs itself and platform admins (not reachable with an API key): {otherEndpoints.map((e) => `${e.method} ${e.path}`).join(" · ")}.</p>}
            </>
          ),
        },
        {
          id: "search",
          title: "Search request",
          body: (
            <>
              <p>
                Required: {doc.searchRequest.required.join(", ")}. {doc.searchRequest.note}
              </p>
              <Table head={["Field"]} rows={doc.searchRequest.fields.map((f) => [<code key={f}>{f}</code>])} />
              <p className="mt-4">Search modes:</p>
              <Table head={["searchMode", "Meaning"]} rows={Object.entries(doc.searchModes).map(([k, v]) => [<code key={k}>{k}</code>, `${v.label} — ${v.description}`])} />
            </>
          ),
        },
        {
          id: "response",
          title: "Opportunities and source outcomes",
          body: (
            <>
              <p>Each result is a canonical opportunity with these fields:</p>
              <p className="mt-2 flex flex-wrap gap-1.5">
                {doc.opportunityFields.map((f) => (
                  <code key={f}>{f}</code>
                ))}
              </p>
              <p className="mt-4">Every source asked reports how it went:</p>
              <Table head={["Outcome", "Meaning"]} rows={Object.entries(doc.sourceOutcomes).map(([k, v]) => [<code key={k}>{k}</code>, v])} />
            </>
          ),
        },
        {
          id: "stream",
          title: "Streaming",
          body: (
            <>
              <p>
                <code>POST /search/stream</code> runs the same search and sends newline-delimited JSON events as the work happens:
              </p>
              <p className="mt-2 flex flex-wrap gap-1.5">
                {doc.events.map((e) => (
                  <code key={e}>{e}</code>
                ))}
              </p>
            </>
          ),
        },
        {
          id: "mcp",
          title: "MCP",
          body: (
            <>
              <p>
                <code>{origin}{doc.mcp.path}</code> · {doc.mcp.transport}. {doc.mcp.auth}.
              </p>
              <Table head={["Tool", "What it does", "With an API key"]} rows={doc.mcp.tools.map((t) => [<code key={t.name}>{t.name}</code>, t.description, t.apiKey ? "Yes" : "No"])} />
            </>
          ),
        },
        {
          id: "errors",
          title: "Errors",
          body: (
            <>
              <p>Errors come back as JSON with one of these codes:</p>
              <p className="mt-2 flex flex-wrap gap-1.5">
                {doc.errors.map((e) => (
                  <code key={e}>{e}</code>
                ))}
              </p>
              <p className="mt-4 text-[13px] text-ink-3">
                The same document, machine-readable: <a href="/api/jobs-lake/v1/protocol">{`${doc.base}/protocol`}</a> (JSON).
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
