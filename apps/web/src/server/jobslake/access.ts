import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/config";
import type { ErrorBody, ErrorCode } from "@/domain/jobslake/protocol";
import { AuthRequiredError, getSession, type Session } from "@/server/auth";
import { authenticateKey, presentedKey } from "./developer";
import { jobsLakeFlags } from "./flags";

/**
 * Who may use which part of JobsLake.
 *
 * - Admin portal + admin API: a signed-in account whose email is in JOBSLAKE_ADMIN_EMAILS. Unset
 *   means nobody — it fails closed. In local development without Supabase Auth (the legacy cookie
 *   mode, where identity isn't authenticated at all), JOBSLAKE_LOCAL_ADMIN=1 opts a developer in;
 *   that switch is ignored whenever real auth is configured.
 * - Candidate search + opportunities: any signed-in WonderJobs session (the WonderJobs client).
 * - Service/MCP callers: a bearer JOBSLAKE_MCP_TOKEN, compared in constant time; unset = refused.
 * - Developers: a JobsLake API key (`Authorization: Bearer jl_live_…` or `x-api-key`) on search,
 *   opportunities and MCP only — never on admin/platform endpoints or telemetry.
 */
export function jlError(code: ErrorCode, message: string, status: number, extra: Partial<ErrorBody> = {}) {
  const retryable = code === "RATE_LIMITED" || code === "SOURCE_TIMEOUT" || code === "SOURCE_UNAVAILABLE";
  return NextResponse.json({ error: { code, message, retryable, ...extra } }, { status, headers: { "cache-control": "no-store" } });
}

function adminEmails(): Set<string> {
  return new Set(
    (process.env.JOBSLAKE_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@")),
  );
}

export function isAdminSession(s: Session): boolean {
  if (!authConfigured()) return process.env.JOBSLAKE_LOCAL_ADMIN === "1";
  return !!s.email && adminEmails().has(s.email.toLowerCase());
}

export interface AdminActor {
  actor: string;
  session: Session;
}

/** For admin pages: the admin, or null (the page then 404s — the portal's existence isn't revealed). */
export async function currentAdmin(): Promise<AdminActor | null> {
  if (!jobsLakeFlags().jobsLakeAdminEnabled) return null;
  try {
    const s = await getSession();
    return isAdminSession(s) ? { actor: s.email ?? `local:${s.userId.slice(0, 10)}`, session: s } : null;
  } catch (e) {
    if (e instanceof AuthRequiredError) return null;
    throw e;
  }
}

export async function requireAdmin(): Promise<AdminActor | NextResponse> {
  if (!jobsLakeFlags().jobsLakeAdminEnabled) return jlError("FEATURE_DISABLED", "The JobsLake admin portal is turned off.", 404);
  let s: Session;
  try {
    s = await getSession();
  } catch (e) {
    if (e instanceof AuthRequiredError) return jlError("UNAUTHORIZED", "Sign in required.", 401);
    throw e;
  }
  if (!isAdminSession(s)) return jlError("FORBIDDEN", "JobsLake administration is limited to platform admins.", 403);
  return { actor: s.email ?? `local:${s.userId.slice(0, 10)}`, session: s };
}

export function hasServiceToken(req: Request): boolean {
  const expected = process.env.JOBSLAKE_MCP_TOKEN;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || expected.length < 24 || !given || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export type Caller = { kind: "candidate"; tenantId: string } | { kind: "admin"; actor: string } | { kind: "service" } | { kind: "developer"; ownerId: string; keyId: string };

/**
 * The developer behind a presented API key: null when the request presents none, or a 401 for an
 * unknown or revoked key (a request that presents a key is judged by it, never by a session cookie).
 */
export async function developerCaller(req: Request): Promise<Caller | NextResponse | null> {
  const key = presentedKey(req);
  if (!key) return null;
  try {
    const who = await authenticateKey(key);
    return who ? { kind: "developer", ...who } : jlError("UNAUTHORIZED", "Invalid or revoked JobsLake API key.", 401);
  } catch (e) {
    console.error(`[jobslake-api] key check failed: ${e instanceof Error ? e.message : "unknown"}`);
    return jlError("INTERNAL", "API keys can't be checked just now. Try again shortly.", 503);
  }
}

/** For v1 endpoints an API key may also call: search, stream, opportunities, refresh. */
export async function requireApiCaller(req: Request): Promise<Caller | NextResponse> {
  const dev = await developerCaller(req);
  return dev ?? requireCandidateOrService(req);
}

/**
 * For v1 endpoints a candidate may call: a WonderJobs session or the service token. An admin using
 * WonderJobs is a candidate here too — admin searches go through the admin playground, so a
 * candidate search is never recorded or shaped as an admin one.
 */
export async function requireCandidateOrService(req: Request): Promise<Caller | NextResponse> {
  if (hasServiceToken(req)) return { kind: "service" };
  try {
    const s = await getSession();
    return { kind: "candidate", tenantId: s.tenantId };
  } catch (e) {
    if (e instanceof AuthRequiredError) return jlError("UNAUTHORIZED", "Sign in required.", 401);
    throw e;
  }
}

/** For platform-level v1 endpoints (sources, health, coverage): admin or service token only. */
export async function requireAdminOrService(req: Request): Promise<Caller | NextResponse> {
  if (hasServiceToken(req)) return { kind: "service" };
  const a = await requireAdmin();
  return a instanceof NextResponse ? a : { kind: "admin", actor: a.actor };
}
