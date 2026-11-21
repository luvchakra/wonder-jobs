import { chromium, type FullConfig } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

/**
 * Playwright global setup: before every run, delete the throwaway data earlier runs left in the test
 * Supabase project — so a run killed halfway (no afterEach, no afterAll) can't pile up state that breaks
 * the next one.
 *
 * Only ever touches what the suite itself creates, and only once it's older than two hours (a run still
 * in progress elsewhere keeps its own):
 * - auth users whose address is `wj-e2e-…@example.com` (e2e/utils/testUser.ts). Each is deleted the way its owner
 *   would, through the product's own "Delete my account" route (e2e/fixtures/auth.ts `eraseTestAccount`), which knows
 *   everything an account owns; the setup gives the stale account a new throwaway password to sign in with. Then the
 *   fixed list of tables below is swept, as the fallback for an account that couldn't be erased that way;
 * - WorksLake sources the admin journeys add, named "Remotive API <ms>", "Credentialed <ms>",
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

async function staleTestUsers(admin: SupabaseClient): Promise<{ id: string; email: string }[]> {
  const ids: { id: string; email: string }[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const u of data.users) if (u.email && TEST_EMAIL.test(u.email.toLowerCase()) && isStale(u.created_at)) ids.push({ id: u.id, email: u.email });
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

/** At most this many stale accounts are erased through the product per run (each is a real sign-in); the rest get the sweep. */
const ERASE_AT_MOST = 20;

/**
 * Erases stale test accounts through the product, on the server this run tests (it is already up: Playwright starts
 * the web server before the global setup). Returns how many the product confirmed. Never throws.
 */
async function eraseThroughProduct(admin: SupabaseClient, users: { id: string; email: string }[], config: FullConfig | undefined): Promise<number> {
  const use = (config?.projects.find((p) => p.name === "chromium") ?? config?.projects[0])?.use;
  if (!use?.baseURL || !users.length) return 0;
  let erased = 0;
  const browser = await chromium.launch(use.launchOptions).catch(() => null);
  if (!browser) return 0;
  try {
    const { eraseTestAccount } = await import("./fixtures/auth");
    for (const u of users.slice(0, ERASE_AT_MOST)) {
      // Nobody knows a stale account's password any more: it gets a new throwaway one to sign in with, once.
      const password = `Wj-${randomBytes(9).toString("hex")}!`;
      const set = await admin.auth.admin.updateUserById(u.id, { password }).catch(() => null);
      if (!set || set.error) continue;
      if (await eraseTestAccount(browser, { id: u.id, email: u.email, password }, { baseURL: use.baseURL, proxy: use.proxy })) erased++;
    }
  } catch {
    // The sweep below still runs.
  } finally {
    await browser.close().catch(() => {});
  }
  return erased;
}

async function staleTestSources(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin.schema("wonderjobs").from("jobslake_sources").select("id, record, updated_at");
  if (error) return []; // WorksLake tables not migrated in this project: nothing of ours there.
  return (data ?? [])
    .filter((row: { record?: { name?: string; createdAt?: string }; updated_at?: string }) => TEST_SOURCE_NAME.test(row.record?.name ?? "") && isStale(row.record?.createdAt ?? row.updated_at))
    .map((row: { id: string }) => row.id);
}

export default async function cleanup(config?: FullConfig): Promise<void> {
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
    const erased = await eraseThroughProduct(admin, users, config);
    for (const u of users) await deleteUser(admin, u.id);
    const sources = await staleTestSources(admin);
    for (const id of sources) await admin.schema("wonderjobs").from("jobslake_sources").delete().eq("id", id).then(() => {}, () => {});
    console.log(`[e2e cleanup] removed ${users.length} stale test account(s) (${erased} through the product's own account deletion) and ${sources.length} stale test source(s)`);
  } catch (e) {
    // Cleanup is housekeeping: report it, don't fail the run over it.
    console.log(`[e2e cleanup] skipped: ${(e as Error).message}`);
  }
}
