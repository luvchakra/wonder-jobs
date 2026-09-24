/**
 * WonderJobs' client for JobsLake Protocol v1 (spec §80). The browser talks to the same REST
 * endpoints any other JobsLake consumer would; nothing here knows how sources are fetched.
 */
import type { CanonicalOpportunity, ErrorBody, SearchEvent, SearchRequest, SearchResponse } from "@/domain/jobslake/protocol";

const BASE = "/api/jobs-lake/v1";

export class JobsLakeError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ErrorBody | null,
  ) {
    super(body?.message ?? `JobsLake responded ${status}`);
    this.name = "JobsLakeError";
  }
}

async function fail(res: Response): Promise<never> {
  const b = (await res.json().catch(() => null)) as { error?: ErrorBody } | null;
  throw new JobsLakeError(res.status, b?.error ?? null);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...init?.headers } });
  if (!res.ok) await fail(res);
  return (await res.json()) as T;
}

export const searchJobs = (req: SearchRequest, signal?: AbortSignal) => call<SearchResponse>("/search", { method: "POST", body: JSON.stringify(req), signal });

/**
 * Streaming search. Calls `onEvent` for each event as it arrives and resolves with the final
 * response. Throws `JobsLakeError` if the request is refused, or if the stream ends in an error or
 * without a `search_completed` event.
 */
export async function searchJobsStream(req: SearchRequest, onEvent: (e: SearchEvent) => void | Promise<void>, signal?: AbortSignal): Promise<SearchResponse> {
  const res = await fetch(`${BASE}/search/stream`, { method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(req), signal });
  if (!res.ok || !res.body) await fail(res);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let done: SearchResponse | null = null;
  const handle = async (line: string) => {
    if (!line.trim()) return;
    const e = JSON.parse(line) as SearchEvent;
    if (e.type === "error") throw new JobsLakeError(502, e.error);
    if (e.type === "search_completed") done = e.response;
    await onEvent(e);
  };
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      await handle(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  await handle(buf);
  if (!done) throw new JobsLakeError(502, { code: "INTERNAL", message: "The search stream ended early.", retryable: true });
  return done;
}

export const getJob = (id: string) => call<CanonicalOpportunity>(`/opportunities/${encodeURIComponent(id)}`);

export const refreshJob = (id: string) => call<{ status: "updated" | "gone" | "unavailable"; opportunity: CanonicalOpportunity; message?: string }>(`/opportunities/${encodeURIComponent(id)}/refresh`, { method: "POST" });

/** Per-source relevant/strong counts for a finished search. Best effort: telemetry never blocks a run. */
export function reportContribution(requestId: string, bySource: Record<string, { relevant: number; strong: number }>) {
  if (!Object.keys(bySource).length) return;
  void fetch(`${BASE}/telemetry`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId, bySource }), keepalive: true }).catch(() => undefined);
}
