import { NextResponse } from "next/server";
import type { SearchEvent } from "@/domain/jobslake/protocol";
import { requireCandidateOrService } from "@/server/jobslake/access";
import { jobsLakeFlags } from "@/server/jobslake/flags";
import { badJson, readJson, send } from "@/server/jobslake/http";
import { err, parseSearchRequest, runSearch, searchGate } from "@/server/jobslake/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/jobs-lake/v1/search/stream — the same search, as newline-delimited JSON `SearchEvent`s
 * (spec §36). Each event is emitted when the work it describes actually happened; the last line is
 * `search_completed` (with the full response) or `error`.
 */
export async function POST(req: Request) {
  const caller = await requireCandidateOrService(req);
  if (caller instanceof NextResponse) return caller;
  if (!jobsLakeFlags().jobsLakeStreamingEnabled) return send(err(404, "FEATURE_DISABLED", "JobsLake streaming is turned off; use POST /v1/search."));
  const body = await readJson(req);
  if (body === null) return badJson();
  const parsed = parseSearchRequest(body);
  if (!parsed.ok) return send(parsed);
  const gate = searchGate(caller);
  if (!gate.ok) return send(gate);

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (e: SearchEvent) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          open = false;
        }
      };
      try {
        // The gate already ran (and spent the rate-limit token), so the search itself skips it.
        const r = await runSearch(caller, parsed.value, { emit: write, signal: req.signal, gateChecked: true });
        if (!r.ok) write({ type: "error", error: r.error });
      } catch (e) {
        console.error(`[jobslake] stream search failed: ${e instanceof Error ? e.message : String(e)}`);
        write({ type: "error", error: { code: "INTERNAL", message: "The search failed unexpectedly.", retryable: true } });
      } finally {
        open = false;
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
