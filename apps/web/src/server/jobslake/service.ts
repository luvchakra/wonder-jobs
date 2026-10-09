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
import { apiSourceIds, chargeUnits, developerSources, forDeveloper } from "./developer";
import { getSource, listSources } from "./registry";
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
    variants: z.array(str(120)).max(3).optional(),
  }),
  filters: z.object({ freshnessDays: z.number().int().min(1).max(365).optional(), workplaceTypes: z.array(WorkMode).max(3).optional() }).optional(),
  sourceIds: z.array(str(80)).max(60).optional(),
  searchMode: z.enum(["fast", "balanced", "maximum_coverage"]).default("balanced"),
  limit: z.number().int().min(1).max(500).default(100),
  correlationId: z.string().max(80).optional(),
  cache: z.enum(["use", "refresh"]).optional(),
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

/** Candidates and API-key developers get the public shape: category-level source messages only. */
export const isPublicCaller = (caller: Caller) => caller.kind === "candidate" || caller.kind === "developer";

/** One bucket per API key, shared by every v1 call it makes: 30 at once, refilling one every 2s. */
const keyLimit = (keyId: string) => rateLimit(`jl:key:${keyId}`, { capacity: 30, refillPerSec: 0.5 });

/** Candidates: 20 searches, refilling one every 6s. Service callers get a higher, shared budget. */
function limitFor(caller: Caller) {
  if (caller.kind === "candidate") return rateLimit(`jl:search:${caller.tenantId}`, { capacity: 20, refillPerSec: 1 / 6 });
  if (caller.kind === "developer") return keyLimit(caller.keyId);
  if (caller.kind === "service") return rateLimit("jl:search:service", { capacity: 120, refillPerSec: 2 });
  return rateLimit(`jl:search:admin:${caller.actor}`, { capacity: 60, refillPerSec: 1 });
}

/**
 * What a caller may see of a response: candidates and developers get category-level source messages
 * only, and developers only postings from sources an API key may reach.
 */
export function shapeResponse(caller: Caller, r: SearchResponse): SearchResponse {
  if (!isPublicCaller(caller)) return r;
  const shaped = { ...r, sources: r.sources.map(publicStatus) };
  if (caller.kind !== "developer") return shaped;
  const allow = new Set(apiSourceIds());
  return { ...shaped, results: r.results.flatMap((o) => forDeveloper(o, allow) ?? []) };
}

export function shapeEvent(caller: Caller, e: SearchEvent): SearchEvent {
  if (!isPublicCaller(caller)) return e;
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

/** A search that passed the gate (and, for an API key, was charged): the sources it may use, and how to undo the charge. */
export interface Admission {
  onlySources?: string[];
  refund?: () => Promise<void>;
}

/**
 * The gate, after validation. For an API key it also restricts the search to the sources a key may
 * reach and charges one unit — only here, so an invalid or refused request costs nothing.
 */
export async function admitSearch(caller: Caller, req: SearchRequest): Promise<Result<Admission>> {
  const gate = searchGate(caller);
  if (!gate.ok) return gate;
  if (caller.kind !== "developer") return { ok: true, value: {} };
  const onlySources = developerSources(req.sourceIds, await listSources());
  if (!onlySources.length) return err(400, "INVALID_REQUEST", `None of the requested sources are available to API keys. API keys can search: ${apiSourceIds().join(", ")}.`);
  const charge = await chargeUnits(caller.ownerId, 1);
  if (!charge.ok) return err(charge.status, charge.code, charge.message);
  return { ok: true, value: { onlySources, refund: charge.refund } };
}

export async function runSearch(caller: Caller, req: SearchRequest, opts: Omit<SearchOptions, "trigger" | "onlySources"> & { admitted?: Admission } = {}): Promise<Result<SearchResponse>> {
  let admitted = opts.admitted;
  if (!admitted) {
    const a = await admitSearch(caller, req);
    if (!a.ok) return a;
    admitted = a.value;
  }
  const trigger = caller.kind === "admin" ? "playground" : caller.kind === "developer" ? "api" : "search";
  try {
    const { response } = await search(req, { signal: opts.signal, trigger, onlySources: admitted.onlySources, emit: opts.emit ? (e) => opts.emit!(shapeEvent(caller, e)) : undefined });
    return { ok: true, value: shapeResponse(caller, response) };
  } catch (e) {
    // A search that failed outright isn't charged.
    await admitted.refund?.();
    throw e;
  }
}

/* --------------------------------------------------------- opportunities */

/** One opportunity. Free for an API key (still rate-limited), and only from sources a key may reach. */
export async function getOpportunity(id: string, caller?: Caller): Promise<Result<CanonicalOpportunity>> {
  if (!jobsLakeFlags().jobsLakeEnabled) return err(404, "FEATURE_DISABLED", "JobsLake is turned off.");
  if (!/^[\w.:-]{1,200}$/.test(id)) return err(400, "INVALID_REQUEST", "Invalid opportunity id.");
  if (caller?.kind === "developer" && !keyLimit(caller.keyId).ok) return err(429, "RATE_LIMITED", "Too many requests for this API key. Try again shortly.");
  const notFound = err(404, "NOT_FOUND", "No such opportunity in JobsLake. It may not have been seen in a recent search.");
  const o = await jobsLakeStore().getOpportunity(id);
  if (!o) return notFound;
  if (caller?.kind !== "developer") return { ok: true, value: o };
  const mine = forDeveloper(o, new Set(apiSourceIds()));
  return mine ? { ok: true, value: mine } : notFound;
}

export async function refreshOpportunityById(caller: Caller, id: string): Promise<Result<{ status: "updated" | "gone" | "unavailable"; opportunity: CanonicalOpportunity; message?: string }>> {
  const found = await getOpportunity(id, caller);
  if (!found.ok) return found;
  const key = caller.kind === "candidate" ? caller.tenantId : caller.kind === "developer" ? `key:${caller.keyId}` : caller.kind;
  if (!rateLimit(`jl:refresh:${key}`, { capacity: 20, refillPerSec: 0.2 }).ok) return err(429, "RATE_LIMITED", "Too many refreshes. Try again shortly.");
  // A refresh re-reads the source, so an API key pays one unit for it — after every check above.
  let refund: (() => Promise<void>) | undefined;
  if (caller.kind === "developer") {
    const charge = await chargeUnits(caller.ownerId, 1);
    if (!charge.ok) return err(charge.status, charge.code, charge.message);
    refund = charge.refund;
  }
  let r: Awaited<ReturnType<typeof refreshOpportunity>>;
  try {
    r = await refreshOpportunity(found.value);
  } catch (e) {
    await refund?.();
    throw e;
  }
  const opportunity = caller.kind === "developer" ? (forDeveloper(r.opportunity, new Set(apiSourceIds())) ?? found.value) : r.opportunity;
  // Candidates and developers see the category, not the upstream detail.
  return { ok: true, value: isPublicCaller(caller) && r.status === "unavailable" ? { ...r, opportunity, message: "Its source is temporarily unavailable" } : { ...r, opportunity } };
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
