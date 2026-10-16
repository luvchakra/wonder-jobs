import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Playwright global setup: before every run, delete the throwaway data earlier runs left in the test
 * Supabase project — so a run killed halfway (no afterEach, no afterAll) can't pile up state that breaks
 * the next one.
 *
 * Only ever touches what the suite itself creates, and only once it's older than two hours (a run still
 * in progress elsewhere keeps its own):
 * - auth users whose address is `wj-e2e-…@example.com` (e2e/utils/testUser.ts), with the product rows
 *   keyed by their id — the same tables e2e/fixtures/auth.ts `deleteTestAccount` clears;
 * - JobsLake sources the admin journeys add, named "Remotive API <ms>", "Credentialed <ms>",
 *   "Audited <ms>" (e2e/jobslake.spec.ts).
 * Nothing else. It does nothing without Supabase admin credentials, and leaves the production project
 * alone unless E2E_ALLOW_PRODUCTION=true (pre-launch only: see docs/testing/README.md).
 */

export const TEST_EMAIL = /^wj-e2e-[a-z0-9-]+@example\.com$/;
export const TEST_SOURCE_NAME = /^(Remotive API|Credentialed|Audited) \d{13}$/;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;
const TENANT_TABLES = ["app_state", "action_audit", "push_subscriptions", "ai_provider_secrets", "resume_files"];

/** The production project's ref. Kept here as well as in the workflow so a local run can't hit it by accident. */
export const FORBIDDEN_SUPABASE_REFS = (process.env.E2E_FORBIDDEN_SUPABASE_REFS ?? "tybkklggpifpsmsidhok").split(/\s+/).filter(Boolean);

export function isProductionSupabase(url: string | undefined): boolean {
  return !!url && FORBIDDEN_SUPABASE_REFS.some((ref) => url.includes(ref));
}

/** Pre-launch switch (owner, 2026-10-16): the app isn't live, so E2E may create disposable accounts in
 *  the production project when this is "true". Turn it off at launch. */
export function productionAllowed(): boolean {
  return process.env.E2E_ALLOW_PRODUCTION === "true";
}

/** Whether E2E may write to this Supabase project: any project but production, or production pre-launch. */
export function supabaseUsable(url: string | undefined): boolean {
  return !!url && (!isProductionSupabase(url) || productionAllowed());
}

export function isStale(createdAt: string | undefined, now = Date.now()): boolean {
  const t = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(t) && now - t > MAX_AGE_MS;
}

async function staleTestUsers(admin: SupabaseClient): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const u of data.users) if (u.email && TEST_EMAIL.test(u.email.toLowerCase()) && isStale(u.created_at)) ids.push(u.id);
    if (data.users.length < 1000) break;
  }
  return ids;
}

async function deleteUser(admin: SupabaseClient, id: string): Promise<void> {
  const db = admin.schema("wonderjobs");
  for (const table of TENANT_TABLES) await db.from(table).delete().eq("tenant_id", id).then(() => {}, () => {});
  await db.from("tenants").delete().eq("id", id).then(() => {}, () => {});
  await admin.auth.admin.deleteUser(id).catch(() => {});
}

async function staleTestSources(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin.schema("wonderjobs").from("jobslake_sources").select("id, record, updated_at");
  if (error) return []; // JobsLake tables not migrated in this project: nothing of ours there.
  return (data ?? [])
    .filter((row: { record?: { name?: string; createdAt?: string }; updated_at?: string }) => TEST_SOURCE_NAME.test(row.record?.name ?? "") && isStale(row.record?.createdAt ?? row.updated_at))
    .map((row: { id: string }) => row.id);
}

export default async function cleanup(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  if (!supabaseUsable(url)) {
    console.log("[e2e cleanup] Supabase points at production and E2E_ALLOW_PRODUCTION isn't set: not touching it (signed-in specs report BLOCKED).");
    return;
  }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const users = await staleTestUsers(admin);
    for (const id of users) await deleteUser(admin, id);
    const sources = await staleTestSources(admin);
    for (const id of sources) await admin.schema("wonderjobs").from("jobslake_sources").delete().eq("id", id).then(() => {}, () => {});
    console.log(`[e2e cleanup] removed ${users.length} stale test account(s) and ${sources.length} stale test source(s)`);
  } catch (e) {
    // Cleanup is housekeeping: report it, don't fail the run over it.
    console.log(`[e2e cleanup] skipped: ${(e as Error).message}`);
  }
}
