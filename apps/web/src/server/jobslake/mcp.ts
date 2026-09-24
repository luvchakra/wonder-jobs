/**
 * The JobsLake MCP adapter (spec §37): JSON-RPC 2.0 over Streamable HTTP, answering with plain JSON.
 * Every tool calls the same service function as its REST endpoint and returns the same JSON, so an
 * MCP result and a REST result for the same question are identical (WJ-JL-029).
 *
 * MCP doesn't grant authorization by itself (spec §57): the route requires the service token and
 * the MCP flag before anything here runs.
 */
import { PROTOCOL_VERSION } from "@/domain/jobslake/protocol";
import type { Caller } from "./access";
import { coveragePublic, getOpportunity, getSourcePublic, healthPublic, listSourcesPublic, parseSearchRequest, refreshOpportunityById, runSearch, type Result } from "./service";

const MCP_PROTOCOL = "2025-03-26";

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>, caller: Caller) => Promise<Result<unknown>>;
}

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const idArg = { type: "object", properties: { id: { type: "string", description: "Opportunity id (opp_…) or WonderJobs job id" } }, required: ["id"] };

export const MCP_TOOLS: Tool[] = [
  {
    name: "search_jobs",
    description: "Search live job sources through JobsLake. Returns canonical opportunities with source provenance, per-source outcomes and dedupe counts. Same schema as POST /api/jobs-lake/v1/search.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "object", properties: { text: { type: "string" }, titles: { type: "array", items: { type: "string" } }, skills: { type: "array", items: { type: "string" } }, locations: { type: "array", items: { type: "string" } }, seniority: { type: "array", items: { type: "string" } } } },
        filters: { type: "object", properties: { freshnessDays: { type: "integer" }, workplaceTypes: { type: "array", items: { enum: ["remote", "hybrid", "onsite"] } } } },
        sourceIds: { type: "array", items: { type: "string" } },
        searchMode: { enum: ["fast", "balanced", "maximum_coverage"] },
        limit: { type: "integer", minimum: 1, maximum: 500 },
      },
      required: ["query"],
    },
    run: async (args, caller) => {
      const req = parseSearchRequest(args);
      return req.ok ? runSearch(caller, req.value) : req;
    },
  },
  { name: "get_job", description: "Get one canonical opportunity by id. Same schema as GET /api/jobs-lake/v1/opportunities/:id.", inputSchema: idArg, run: async (a) => getOpportunity(String(a.id ?? "")) },
  { name: "refresh_job", description: "Re-read one opportunity from its canonical source. Same schema as POST /api/jobs-lake/v1/opportunities/:id/refresh.", inputSchema: idArg, run: async (a, c) => refreshOpportunityById(c, String(a.id ?? "")) },
  {
    name: "search_sources",
    description: "List JobsLake sources with access strategy, status and health, optionally filtered by text.",
    inputSchema: { type: "object", properties: { text: { type: "string" } } },
    run: async (a) => {
      const q = String(a.text ?? "").toLowerCase();
      const all = await listSourcesPublic();
      return ok(q ? all.filter((s) => `${s.name} ${s.provider} ${s.accessLabel}`.toLowerCase().includes(q)) : all);
    },
  },
  {
    name: "get_source_health",
    description: "Health of one source (by id) or of all sources, computed from recorded runs.",
    inputSchema: { type: "object", properties: { id: { type: "string" } } },
    run: async (a) => (a.id ? getSourcePublic(String(a.id)) : ok(await healthPublic())),
  },
  {
    name: "get_coverage",
    description: "Coverage of the JobsLake warm pool by source, country, role family, seniority, industry and freshness.",
    inputSchema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 30 } } },
    run: async (a) => ok(await coveragePublic(Math.min(30, Math.max(1, Number(a.days) || 7)))),
  },
];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type RpcReply = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string; data?: unknown } };

const reply = (id: Rpc["id"], result: unknown): RpcReply => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Rpc["id"], code: number, message: string, data?: unknown): RpcReply => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message, data } });

/** Handles one JSON-RPC message. Returns null for notifications (no reply). */
export async function handleMcp(msg: Rpc, caller: Caller): Promise<RpcReply | null> {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(msg?.id, -32600, "Invalid Request");
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case "initialize":
      return reply(msg.id, { protocolVersion: MCP_PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "jobslake", version: PROTOCOL_VERSION } });
    case "ping":
      return reply(msg.id, {});
    case "tools/list":
      return reply(msg.id, { tools: MCP_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const tool = MCP_TOOLS.find((t) => t.name === name);
      if (!tool) return fail(msg.id, -32602, `Unknown tool: ${name}`);
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      const r = await tool.run(args, caller);
      // Tool errors are results with isError (MCP spec), carrying the same error body REST returns.
      const payload = r.ok ? r.value : { error: r.error };
      return reply(msg.id, { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: Array.isArray(payload) ? { items: payload } : payload, isError: !r.ok });
    }
    default:
      return isNotification ? null : fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
