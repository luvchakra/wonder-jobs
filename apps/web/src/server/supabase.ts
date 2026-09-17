import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  // All WonderJobs tables live in their own schema so the project can host other products too.
  client = url && key ? createClient(url, key, { db: { schema: "wonderjobs" }, auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return client;
}

export function isSupabaseConfigured() {
  return getSupabaseAdmin() !== null;
}

/** Ensure the tenant row exists (FK target) and bump last_seen_at. Cheap upsert. */
export async function touchTenant(tenantId: string) {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  await sb.from("tenants").upsert({ id: tenantId, last_seen_at: new Date().toISOString() }, { onConflict: "id" });
}
