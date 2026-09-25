/**
 * The adapter-neutral JobsLake operations behind REST v1 and MCP (spec §37: "MCP must not implement
 * separate search logic"). Each takes an already-authorized caller and returns either a value or a
 * protocol error body; the adapters only translate transport.
 */
import { z } from "zod";
import type { CanonicalOpportunity, ErrorBody, SearchEvent, SearchRequest, SearchResponse } from "@/domain/jobslake/protocol";
import { rateLimit } from "@/server/rateLimit";
import type { Caller } from "./access";
import { publicStatus, refreshOpportunity, search, type SearchOptions } from "./core";
import { jobsLakeFlags } from "./flags";
import { getSource } from "./registry";
import { jobsLakeStore } from "./store";
import { coverageView, listSourceViews, publicSource, sourceView } from "./views";
import { healthBySource } from "./core";

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: ErrorBody };

export const err = (status: number, code: ErrorBody["code"], message: string, extra: Partial<ErrorBody> = {}): { ok: false; status: number; error: ErrorBody } => ({
  ok: false,
  status,
  error: { code, message, retryable: code === "RATE_LIMITED" || code === "SOURCE_TIMEOUT" || code === "SOURCE_UNAVAILABLE", ...extra },
});

const WorkMode = z.enum(["remote", "hybrid", "onsite"]);
const str = (max: number) => z.string().trim().min(1).max(max);

/** Spec §34. Only what's needed to search — the schema rejects nothing else, but nothing else is read. */
export const SearchRequestSchema = z.object({
  query: z.object({
    text: z.string().trim().max(200).optional(),
    titles: z.array(str(120)).max(10).optional(),
    skills: z.array(str(60)).max(20).optional(),
    locations: z.array(str(80)).max(10).default([]),
    seniority: z.array(str(30)).max(6).optional(),
  }),
  filters: z.object({ freshnessDays: z.number().int().min(1).max(365).optional(), workplaceTypes: z.array(WorkMode).max(3).optional() }).optional(),
  sourceIds: z.array(str(80)).max(60).optional(),
  searchMode: z.enum(["fast", "balanced", "maximum_coverage"]).default("balanced"),
  limit: z.number().int().min(1).max(500).default(100),
  correlationId: z.string().max(80).optional(),
});

/**
 * Validates a search body. The search text is what the caller asked for — the query text, or else
 * its first title. With neither there's nothing to search for, and JobsLake says so rather than
 * inventing a query.
 */
export function parseSearchRequest(body: unknown): Result<SearchRequest> {
  const p = SearchRequestSchema.safeParse(body);
  if (!p.success) return err(400, "INVALID_REQUEST", p.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).slice(0, 3).join("; "));
  const text = p.data.query.text || p.data.query.titles?.[0] || "";
  if (!text) return err(400, "INVALID_REQUEST", "query.text or query.titles is required — JobsLake doesn't guess what to search for.");
  return { ok: true, value: { ...p.data, query: { ...p.data.query, text } } };
}

/** Candidates: 20 searches, refilling one every 6s. Service callers get a higher, shared budget. */
function limitFor(caller: Caller) {
  if (caller.kind === "candidate") return rateLimit(`jl:search:${caller.tenantId}`, { capacity: 20, refillPerSec: 1 / 6 });
  if (caller.kind === "service") return rateLimit("jl:search:service", { capacity: 120, refillPerSec: 2 });
  return rateLimit(`jl:search:admin:${caller.actor}`, { capacity: 60, refillPerSec: 1 });
}

/** What a caller may see of a response: candidates get category-level source messages only. */
export function shapeResponse(caller: Caller, r: SearchResponse): SearchResponse {
  return caller.kind === "candidate" ? { ...r, sources: r.sources.map(publicStatus) } : r;
}

export function shapeEvent(caller: Caller, e: SearchEvent): SearchEvent {
  if (caller.kind !== "candidate") return e;
  if (e.type === "source_completed") return { ...e, status: publicStatus(e.status) };
  if (e.type === "search_completed") return { ...e, response: shapeResponse(caller, e.response) };
  return e;
}

export function searchGate(caller: Caller): Result<null> {
  if (!jobsLakeFlags().jobsLakeSearchEnabled) return err(404, "FEATURE_DISABLED", "JobsLake search is turned off.");
  const rl = limitFor(caller);
  if (!rl.ok) return err(429, "RATE_LIMITED", `Too many searches. Try again in ${rl.retryAfterSec}s.`);
  return { ok: true, value: null };
}

export async function runSearch(caller: Caller, req: SearchRequest, opts: Omit<SearchOptions, "trigger"> & { gateChecked?: boolean } = {}): Promise<Result<SearchResponse>> {
  if (!opts.gateChecked) {
    const gate = searchGate(caller);
    if (!gate.ok) return gate;
  }
  const { response } = await search(req, { signal: opts.signal, trigger: caller.kind === "admin" ? "playground" : "search", emit: opts.emit ? (e) => opts.emit!(shapeEvent(caller, e)) : undefined });
  return { ok: true, value: shapeResponse(caller, response) };
}

/* --------------------------------------------------------- opportunities */

export async function getOpportunity(id: string): Promise<Result<CanonicalOpportunity>> {
  if (!jobsLakeFlags().jobsLakeEnabled) return err(404, "FEATURE_DISABLED", "JobsLake is turned off.");
  if (!/^[\w.:-]{1,200}$/.test(id)) return err(400, "INVALID_REQUEST", "Invalid opportunity id.");
  const o = await jobsLakeStore().getOpportunity(id);
  return o ? { ok: true, value: o } : err(404, "NOT_FOUND", "No such opportunity in JobsLake. It may not have been seen in a recent search.");
}

export async function refreshOpportunityById(caller: Caller, id: string): Promise<Result<{ status: "updated" | "gone" | "unavailable"; opportunity: CanonicalOpportunity; message?: string }>> {
  const found = await getOpportunity(id);
  if (!found.ok) return found;
  const key = caller.kind === "candidate" ? caller.tenantId : caller.kind;
  if (!rateLimit(`jl:refresh:${key}`, { capacity: 20, refillPerSec: 0.2 }).ok) return err(429, "RATE_LIMITED", "Too many refreshes. Try again shortly.");
  const r = await refreshOpportunity(found.value);
  // Candidates see the category, not the upstream detail.
  return { ok: true, value: caller.kind === "candidate" && r.status === "unavailable" ? { ...r, message: "Its source is temporarily unavailable" } : r };
}

/* ----------------------------------------------------- sources / health */

export async function listSourcesPublic() {
  return (await listSourceViews()).map(publicSource);
}

export async function getSourcePublic(id: string): Promise<Result<ReturnType<typeof publicSource>>> {
  const s = await getSource(id);
  if (!s) return err(404, "NOT_FOUND", "No such source.");
  return { ok: true, value: publicSource(await sourceView(s, await healthBySource())) };
}

export async function healthPublic() {
  const views = await listSourceViews();
  return {
    protocolVersion: "1.0",
    store: await jobsLakeStore().status(),
    sources: views.map((v) => ({ id: v.id, name: v.name, status: v.status, available: v.available, health: publicSource(v).health })),
  };
}

export async function coveragePublic(days = 7) {
  return coverageView(days);
}
