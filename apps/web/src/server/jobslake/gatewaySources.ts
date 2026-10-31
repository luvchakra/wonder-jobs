/**
 * Optional WorksLake gateway ingestion. No legacy source is changed or replaced.
 * Sources appear only when WORKSLAKE_GATEWAY_ENABLED=1 and a valid base URL is set.
 * They start in Draft and require the normal live source test + admin activation.
 */
import type { ModuleId } from "@/modules/registry";
import { MODULE_IDS } from "@/wonderworks/manifest";
import { PROTOCOL_VERSION } from "@/domain/jobslake/protocol";
import { checkDestination } from "@/domain/jobslake/ssrf";
import { DEFAULT_LIMITS, type SourceRecord } from "./types";

const prefix = "works_gateway_";
const base = process.env.WORKSLAKE_GATEWAY_URL?.replace(/\/$/, "") ?? "";
function enabled() {
  if (process.env.WORKSLAKE_GATEWAY_ENABLED !== "1" || !base) return false;
  try {
    const u = new URL(base);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && checkDestination(base).ok && !u.pathname.replaceAll("/", "");
  } catch { return false; }
}

export function gatewayModuleForSource(id: string): ModuleId | undefined {
  if (!enabled() || !id.startsWith(prefix)) return undefined;
  const selected = id.slice(prefix.length);
  return MODULE_IDS.find((m) => m === selected);
}

const FIELDS = {
  sourceJobId: "id",
  title: "title",
  employer: "employer",
  location: "location",
  description: "description",
  applyUrl: "applyUrl",
  postedAt: "postedAt",
  remote: "remote",
} as const;

export const GATEWAY_SOURCES: SourceRecord[] = enabled() ? MODULE_IDS.map((module) => ({
  protocolVersion: PROTOCOL_VERSION,
  id: prefix + module,
  name: "WorksLake External Data Gateway (" + module + ")",
  provider: "WorksLake Data Gateway",
  category: "aggregator",
  accessStrategy: "official_api",
  geography: ["global", "IN"],
  description: "Additional approved external sources indexed in the independent gateway; existing sources remain unchanged.",
  capabilities: ["Search", "Freshness", "Apply URL"],
  status: "draft",
  config: { kind: "json_api", api: { endpoint: base + "/v1/workslake/" + module + "/listings", queryParam: "q", locationParam: "location", credentialHeader: "Authorization", credentialPrefix: "Bearer ", mapping: { itemsPath: "items", fields: FIELDS } } },
  secretRef: "env:WORKSLAKE_GATEWAY_API_KEY",
  limits: { ...DEFAULT_LIMITS, timeoutMs: 12000, maxResults: 100 },
  roleFamilies: [],
  module,
  builtin: true,
  createdAt: "2026-10-31T00:00:00.000Z",
  updatedAt: "2026-10-31T00:00:00.000Z",
})) : [];
