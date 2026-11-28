import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { dbGuard } from "./dbGuard";

/**
 * Server-only Supabase client using the service role (or new secret key).
 * Tenant isolation is enforced by the API routes (every query filters by the
 * session's tenant); RLS is enabled with no anon policies so the publishable
 * key can never touch tenant data. Returns null when not configured so the
 * app degrades to in-memory / localStorage.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AdminClient = SupabaseClient<any, any, any, any, any>;
let client: AdminClient | null | undefined;

export function getSupabaseAdmin(): AdminClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  // Every request goes through the database guard (dbGuard.ts): capped concurrency, deadlines, back-off when failing.
  // All WonderJobs tables live in their own schema so the project can host other products too.
  client = url && key ? createClient(url, key, { db: { schema: "wonderjobs" }, auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: dbGuard.fetch } }) : null;
  return client;
}

export function isSupabaseConfigured() {
  return getSupabaseAdmin() !== null;
}

/** Tenants this server instance has touched lately: their row exists, and last_seen_at needn't move again yet. */
const touched = new Map<string, number>();
const TOUCH_MS = 5 * 60_000;

/** Ensure the tenant row exists (FK target) and bump last_seen_at — at most every five minutes per instance. */
export async function touchTenant(tenantId: string) {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const at = touched.get(tenantId);
  if (at && Date.now() - at < TOUCH_MS) return;
  await sb.from("tenants").upsert({ id: tenantId, last_seen_at: new Date().toISOString() }, { onConflict: "id" });
  touched.set(tenantId, Date.now());
}

/** When each account was created, as read: it never changes, so it's kept for the life of the instance. */
const createdAt = new Map<string, string | null>();

/** When the account was created (its tenant row), or null when there's no row or no database. Throws if the read fails. */
export async function tenantCreatedAt(tenantId: string): Promise<string | null> {
  if (createdAt.has(tenantId)) return createdAt.get(tenantId) ?? null;
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb.from("tenants").select("created_at").eq("id", tenantId).maybeSingle();
  if (error) throw error;
  const at = (data as { created_at?: string } | null)?.created_at ?? null;
  // Not cached when missing: the row is created on the account's first write.
  if (at) createdAt.set(tenantId, at);
  return at;
}

/** The tenant row is gone (account erased): the next write must create it again, not assume it's there. */
export function forgetTenant(tenantId: string) {
  touched.delete(tenantId);
  createdAt.delete(tenantId);
}
