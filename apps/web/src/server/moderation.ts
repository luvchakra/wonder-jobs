/**
 * Moderation for every module's listings (owner, 2026-11-03: "control on bad post or post with bad intention"):
 *
 * - Anyone signed in can report a listing (`module_reports`, one report per person and listing, so a count is a count of
 *   different people). Once the number of people passes the platform's threshold (Admin → Moderation, default 3), the
 *   listing is hidden from everyone's Find. Nobody is told who reported it.
 * - A platform admin can hide a listing, ban it (for a regulator's or authority's notice: hidden for good, with the
 *   reason recorded), restore it, or delete it. Every action is audited.
 * - Whoever posted a listing on WonderWorks can delete it, and so can a platform admin. An outside listing can't be deleted
 *   at its source: "delete" removes it from WonderWorks for good.
 *
 * State lives in the platform's own document (`wj.moderation`), read through a short in-memory cache; it holds listing
 * ids and reasons only, never a reporter.
 */
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { table } from "@/server/db/table";
import type { Session } from "@/server/auth";
import { requirePermission } from "@/server/hiring";
import { hashKey } from "@/lib/ids";
import { fileReport, reports, type ReportRow } from "@/server/modules/safety";

const KEY = "wj.moderation" as const;
export const DEFAULT_THRESHOLD = 3;
export const MAX_THRESHOLD = 100;

export type ListingAction = "hidden" | "banned" | "deleted" | "restored";
export interface ModerationEntry {
  module: string;
  listingId: string;
  title?: string;
  action: ListingAction;
  /** Who: an admin's email, "reports" (the threshold was crossed) or "owner". */
  by: string;
  reason?: string;
  at: string;
}
export interface ModerationState {
  threshold: number;
  entries: Record<string, ModerationEntry>;
}

/** The audit trail (WorksLake's), loaded lazily: the search core imports this file to filter what it serves. */
const audit = async (actor: string, action: string, sourceId?: string, detail?: Record<string, unknown>) => (await import("@/server/jobslake/core")).audit(actor, action, sourceId, detail);

export const entryKey = (module: string, listingId: string) => `${module}:${listingId}`;
/** A listing no one sees: hidden, banned or deleted (restored is shown again). */
export const isHiddenAction = (a: ListingAction | undefined) => a === "hidden" || a === "banned" || a === "deleted";

let cache: { at: number; state: ModerationState } | null = null;
const TTL = 30_000;

export async function moderationState(now = Date.now()): Promise<ModerationState> {
  if (cache && now - cache.at < TTL) return cache.state;
  const raw = (await stateStore.get(PLATFORM_TENANT, KEY).catch(() => undefined))?.state as Partial<ModerationState> | undefined;
  const state: ModerationState = { threshold: clampThreshold(raw?.threshold), entries: raw?.entries && typeof raw.entries === "object" ? raw.entries : {} };
  cache = { at: now, state };
  return state;
}

async function save(state: ModerationState) {
  await stateStore.put(PLATFORM_TENANT, KEY, state);
  cache = { at: Date.now(), state };
}

export function clampThreshold(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_THRESHOLD) : DEFAULT_THRESHOLD;
}

/** The ids of a module's listings no one sees. */
export async function hiddenListingIds(module: string): Promise<Set<string>> {
  const { entries } = await moderationState();
  return new Set(Object.values(entries).filter((e) => e.module === module && isHiddenAction(e.action)).map((e) => e.listingId));
}

/** A module's results without the listings no one sees (by their listing id). */
export async function withoutHidden<T extends { id: string }>(module: string, items: T[]): Promise<T[]> {
  const hidden = await hiddenListingIds(module);
  return hidden.size ? items.filter((i) => !hidden.has(i.id)) : items;
}

/** A module search's answer without the listings no one sees (each module's Find route wraps its search in this). */
export function hideIn(module: string) {
  return async <R extends { results: { id: string }[] }>(r: R): Promise<R> => ({ ...r, results: await withoutHidden(module, r.results) });
}

const REPORT_REASONS = ["spam", "scam", "offensive", "illegal", "wrong", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const isReportReason = (v: unknown): v is ReportReason => typeof v === "string" && (REPORT_REASONS as readonly string[]).includes(v);

/**
 * Report a listing. A person's second report of the same listing changes nothing. When the number of different people
 * reaches the threshold, the listing is hidden (unless an admin already decided on it).
 */
export async function reportListing(reporter: string, module: string, listingId: string, reason: ReportReason, note: string, title?: string): Promise<{ repeated: boolean; hidden: boolean }> {
  const r = await fileReport(module, reporter, { kind: "listing", id: listingId }, `${reason}${note.trim() ? `: ${note.trim()}` : ""}`.slice(0, 500));
  const count = new Set((await reports().find({ module, subject_kind: "listing", subject_id: listingId })).map((x) => x.reporter_tenant)).size;
  const state = await moderationState(Date.now() + TTL); // fresh
  const key = entryKey(module, listingId);
  if (!state.entries[key] && count >= state.threshold) {
    state.entries[key] = { module, listingId, ...(title ? { title: title.slice(0, 160) } : {}), action: "hidden", by: "reports", reason: `${count} people reported it`, at: new Date().toISOString() };
    await save(state);
    await audit("reports", "listing.hidden_by_reports", undefined, { module, listingId, count });
    return { repeated: r.repeated, hidden: true };
  }
  return { repeated: r.repeated, hidden: isHiddenAction(state.entries[key]?.action) };
}

/** An admin's decision on a listing (hide, ban, restore), audited. */
export async function setListingAction(by: string, module: string, listingId: string, action: Exclude<ListingAction, "deleted">, reason: string, title?: string): Promise<ModerationEntry> {
  const state = await moderationState(Date.now() + TTL);
  const key = entryKey(module, listingId);
  const entry: ModerationEntry = { module, listingId, ...(title || state.entries[key]?.title ? { title: (title || state.entries[key]?.title)!.slice(0, 160) } : {}), action, by, ...(reason.trim() ? { reason: reason.trim().slice(0, 500) } : {}), at: new Date().toISOString() };
  state.entries[key] = entry;
  await save(state);
  await audit(by, `listing.${action}`, undefined, { module, listingId, reason: entry.reason });
  return entry;
}

export async function setThreshold(by: string, threshold: number): Promise<number> {
  const state = await moderationState(Date.now() + TTL);
  state.threshold = clampThreshold(threshold);
  await save(state);
  await audit(by, "moderation.threshold", undefined, { threshold: state.threshold });
  return state.threshold;
}

/* ----------------------------------------------------------------------------------------------- deleting an entry */

/** Modules whose WonderWorks posts live in the shared `listings` table, by `ws_<id>`. */
const SHARED_TABLE_MODULES = new Set(["internships", "teaching", "services", "therapists", "events", "scholarships"]);

type SharedRow = { id: string; module: string; org_id: string; title: string };
type MarketRow = { id: string; seller_tenant: string; title: string };
type JobRow = { id: string; org_id: string; title: string };

/** Jobs' id for a job a company posted on WonderWorks (server/careers.ts, the "WonderWorks employers" source). */
export const employerListingId = (jobId: string) => `employers_${hashKey(`employers:${jobId}`)}`;

/** Which WonderWorks post a listing id names, if any: the row's table and id. Outside listings name none. */
export function postOf(module: string, listingId: string): { table: "listings" | "marketplace_listings" | "employer_jobs"; id: string } | null {
  if (SHARED_TABLE_MODULES.has(module) && listingId.startsWith("ws_")) return { table: "listings", id: listingId.slice(3) };
  if (module === "marketplace" && listingId.startsWith("mk_") && !listingId.startsWith("mk_out_")) return { table: "marketplace_listings", id: listingId.slice(3) };
  if (module === "jobs" && listingId.startsWith("employers_")) return { table: "employer_jobs", id: listingId };
  return null;
}

/**
 * Delete a listing. Its poster may delete their own WonderWorks post (a team member who may edit the organisation's posts,
 * or the seller); a platform admin may delete any. An outside listing (no post here) can only be removed by an admin:
 * it's hidden for good. Applications, requests and threads on a deleted post go with it (the tables cascade).
 */
export async function deleteListing(actor: { session?: Session; admin?: string }, module: string, listingId: string, reason = ""): Promise<{ deleted: "post" | "hidden" }> {
  const post = postOf(module, listingId);
  const by = actor.admin ?? actor.session?.email ?? actor.session?.tenantId ?? "owner";
  if (post?.table === "listings") {
    const row = await table<SharedRow>("listings").one({ id: post.id, module });
    if (!row) throw Object.assign(new Error("That listing isn't there any more."), { status: 404 });
    if (!actor.admin) await requirePermission(actor.session!, row.org_id, "jobs.edit");
    await table<SharedRow>("listings").remove({ id: post.id, module, org_id: row.org_id });
    await markDeleted(by, module, listingId, row.title, reason, !!actor.admin);
    return { deleted: "post" };
  }
  if (post?.table === "marketplace_listings") {
    const row = await table<MarketRow>("marketplace_listings").one({ id: post.id });
    if (!row) throw Object.assign(new Error("That listing isn't there any more."), { status: 404 });
    if (!actor.admin && row.seller_tenant !== actor.session?.tenantId) throw Object.assign(new Error("Only its seller can delete it."), { status: 403 });
    await table<MarketRow>("marketplace_listings").remove({ id: post.id, seller_tenant: row.seller_tenant });
    await markDeleted(by, module, listingId, row.title, reason, !!actor.admin);
    return { deleted: "post" };
  }
  if (post?.table === "employer_jobs") {
    // Jobs' listing id is a hash of the job's id: found among the posted jobs (newest first).
    const row = (await table<JobRow>("employer_jobs").find({}, { order: "updated_at", desc: true, limit: 5000 })).find((j) => employerListingId(j.id) === listingId);
    if (!row) throw Object.assign(new Error("That job isn't there any more."), { status: 404 });
    if (!actor.admin) await requirePermission(actor.session!, row.org_id, "jobs.edit");
    await table<JobRow>("employer_jobs").remove({ id: row.id, org_id: row.org_id });
    await markDeleted(by, module, listingId, row.title, reason, !!actor.admin);
    return { deleted: "post" };
  }
  if (!actor.admin) throw Object.assign(new Error("Only a WonderWorks post can be deleted by its poster."), { status: 403 });
  await markDeleted(by, module, listingId, undefined, reason, true);
  return { deleted: "hidden" };
}

async function markDeleted(by: string, module: string, listingId: string, title: string | undefined, reason: string, admin: boolean) {
  const state = await moderationState(Date.now() + TTL);
  state.entries[entryKey(module, listingId)] = { module, listingId, ...(title ? { title: title.slice(0, 160) } : {}), action: "deleted", by: admin ? by : "owner", ...(reason.trim() ? { reason: reason.trim().slice(0, 500) } : {}), at: new Date().toISOString() };
  await save(state);
  await audit(by, admin ? "listing.deleted_by_admin" : "listing.deleted_by_owner", undefined, { module, listingId });
}

/* ------------------------------------------------------------------------------------------------- the admin queue */

export interface ModerationRow {
  module: string;
  listingId: string;
  title?: string;
  reports: number;
  reasons: Record<string, number>;
  lastReportAt?: string;
  action?: ListingAction;
  by?: string;
  reason?: string;
  at?: string;
  /** A WonderWorks post (deletable at its source), or an outside listing. */
  posted: boolean;
}

/** Every reported or acted-on listing, newest first: the report count and reasons (never who), and any decision. */
export async function moderationQueue(): Promise<{ threshold: number; rows: ModerationRow[] }> {
  const [state, all] = await Promise.all([moderationState(Date.now() + TTL), reports().find({ subject_kind: "listing" } as Partial<ReportRow>, { order: "created_at", desc: true, limit: 2000 })]);
  const rows = new Map<string, ModerationRow>();
  for (const r of all) {
    const key = entryKey(r.module, r.subject_id);
    const row = rows.get(key) ?? { module: r.module, listingId: r.subject_id, reports: 0, reasons: {}, posted: !!postOf(r.module, r.subject_id) };
    const seen = (row as ModerationRow & { _who?: Set<string> })._who ?? new Set<string>();
    if (!seen.has(r.reporter_tenant)) {
      seen.add(r.reporter_tenant);
      row.reports++;
      const reason = r.reason.split(":")[0];
      row.reasons[reason] = (row.reasons[reason] ?? 0) + 1;
    }
    (row as ModerationRow & { _who?: Set<string> })._who = seen;
    if (!row.lastReportAt || r.created_at > row.lastReportAt) row.lastReportAt = r.created_at;
    rows.set(key, row);
  }
  for (const e of Object.values(state.entries)) {
    const key = entryKey(e.module, e.listingId);
    const row = rows.get(key) ?? { module: e.module, listingId: e.listingId, reports: 0, reasons: {}, posted: !!postOf(e.module, e.listingId) };
    rows.set(key, { ...row, title: e.title ?? row.title, action: e.action, by: e.by, reason: e.reason, at: e.at });
  }
  const out = [...rows.values()].map((r) => {
    const copy = { ...r } as ModerationRow & { _who?: Set<string> };
    delete copy._who;
    return copy as ModerationRow;
  });
  out.sort((a, b) => (b.at ?? b.lastReportAt ?? "").localeCompare(a.at ?? a.lastReportAt ?? ""));
  return { threshold: state.threshold, rows: out };
}

/** For tests. */
export function __resetModerationCache() {
  cache = null;
}
