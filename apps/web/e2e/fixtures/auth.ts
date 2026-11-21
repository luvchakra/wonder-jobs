import { test as base, expect, type Browser, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { uniqueTestEmail, testPassword } from "../utils/testUser";
import { ERASE_PHRASE, PRIVACY_NOTICE_VERSION } from "../../src/content/privacy";
import { supabaseUsable } from "../cleanup";

export interface TestAccount {
  id: string;
  email: string;
  password: string;
}

let cachedAdmin: SupabaseClient | null | undefined;

/** Null when the environment this test run inherited has no Supabase admin credentials — every
 *  account-dependent spec checks this and reports BLOCKED rather than faking a pass (see AGENTS note:
 *  "If a feature is absent, report NOT_APPLICABLE or BLOCKED; do not fake coverage"). Also null for the
 *  production project unless E2E_ALLOW_PRODUCTION=true (pre-launch only). */
function adminClient(): SupabaseClient | null {
  if (cachedAdmin !== undefined) return cachedAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cachedAdmin = url && key && supabaseUsable(url) ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
  return cachedAdmin;
}

export function supabaseConfigured(): boolean {
  return adminClient() !== null;
}

/**
 * Creates a real, pre-confirmed Supabase account. `email_confirm: true` is what makes this safe to run
 * against the real project without ever sending mail: Supabase only emails a confirmation link to an
 * *unconfirmed* new user, and this account is never in that state. The address itself is disposable and
 * unique per call (`uniqueTestEmail`) — nothing is ever actually delivered to it either way.
 */
export async function createTestAccount(tag = "auth"): Promise<TestAccount> {
  const admin = adminClient();
  if (!admin) throw new Error("Supabase admin credentials are not set (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  const email = uniqueTestEmail(tag);
  const password = testPassword();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`Could not create test account: ${error?.message ?? "no user returned"}`);
  await acceptPrivacyNotice(data.user.id);
  return { id: data.user.id, email, password };
}

/**
 * Records the test account's acceptance of the current privacy notice, as the in-app gate would, so
 * specs about other flows aren't interrupted by it. Best-effort: a project without migration 0008
 * simply shows the gate (which then lets the candidate continue).
 */
async function acceptPrivacyNotice(id: string): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  const db = admin.schema("wonderjobs");
  await db.from("tenants").upsert({ id }, { onConflict: "id" }).then(() => {}, () => {});
  for (const purpose of ["age_confirmation", "privacy_notice"]) {
    await db.from("consent_records").insert({ tenant_id: id, purpose, notice_version: PRIVACY_NOTICE_VERSION, granted: true }).then(() => {}, () => {});
  }
}

/** The fallback after `eraseTestAccount` (use `removeTestAccount`): removes the auth user and the product state in
 *  the tables listed here, so a test run leaves nothing behind in the shared project even when the account could no
 *  longer sign in. It knows only these tables; the product's own erasure knows the rest. Access tokens stay valid until they expire, so a page closing after the user is
 *  gone can still flush one last state write; a second sweep catches it. Best-effort: a cleanup failure
 *  must never fail the test it's cleaning up after. */
export async function deleteTestAccount(id: string): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  await admin.auth.admin.deleteUser(id).catch(() => {});
  const sweep = async () => {
    const db = admin.schema("wonderjobs");
    for (const table of ["app_state", "action_audit", "push_subscriptions", "ai_provider_secrets"]) {
      await db.from(table).delete().eq("tenant_id", id).then(
        () => {},
        () => {},
      );
    }
    await db.from("tenants").delete().eq("id", id).then(
      () => {},
      () => {},
    );
  };
  await sweep();
  await new Promise((r) => setTimeout(r, 2_000));
  await sweep();
}

/**
 * Deletes a test account the way its owner would: signed in, through the product's own "Delete my account" route.
 * That is the path that knows everything an account owns (the tenant row's cascade plus every `ACCOUNT_DATA` entry,
 * e.g. Network), so cleanup removes what a hand-kept list of tables would miss, and every run exercises real erasure.
 * True when the product said the account is erased. False when it couldn't be done this way (the account can no
 * longer sign in, or the product refused): the caller then falls back to `deleteTestAccount`.
 */
export async function eraseTestAccount(browser: Browser, account: TestAccount, context?: Parameters<Browser["newContext"]>[0]): Promise<boolean> {
  // An account that already deleted itself in its test (or was never created) has nobody to sign in: say so at once
  // instead of waiting on a sign-in that can't succeed.
  const user = await adminClient()?.auth.admin.getUserById(account.id).catch(() => null);
  if (!user || user.error || !user.data.user) return false;
  // A test's own `browser` already carries the run's base URL and proxy; the global setup's doesn't, and passes them.
  const ctx = await browser.newContext(context).catch(() => null);
  if (!ctx) return false;
  try {
    const page = await ctx.newPage();
    await signInThroughUI(page, account);
    const res = await page.request.post("/api/privacy/erase", { data: { confirm: ERASE_PHRASE } });
    return res.ok();
  } catch {
    return false;
  } finally {
    await ctx.close().catch(() => {});
  }
}

/** A test's own cleanup: the product's erasure first, then the sweep for whatever is left (or for an account that
 *  could no longer sign in). Best-effort, like `deleteTestAccount`: it never fails the test it cleans up after.
 *  Each account is a real sign-in (about ten seconds), so a hook that removes several gives itself the time:
 *  `test.setTimeout(CLEANUP_TIMEOUT_MS)`. */
export const CLEANUP_TIMEOUT_MS = 300_000;
export async function removeTestAccount(browser: Browser, account: TestAccount): Promise<void> {
  await eraseTestAccount(browser, account);
  await deleteTestAccount(account.id);
}

/** Drives the real sign-in form (not an API shortcut) so the assertion is about the actual UI candidates use. */
export async function signInThroughUI(page: Page, account: Pick<TestAccount, "email" | "password">): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Against a deployment, the first sign-in after a quiet spell can wait on cold functions; allow for that.
  await page.waitForURL(/\/app(\/|$)/, { timeout: 45_000 });
}

/**
 * A brand-new account has no Career DNA yet, so `AppShell`'s `Gate` client-side-redirects it from `/app`
 * to `/onboarding` once local state finishes hydrating — a redirect that lands a beat *after* the sign-in
 * navigation `signInThroughUI` already resolved on. A test that needs the real app shell (TopBar, the
 * profile menu, sign-out) has to settle past that race first, or a click can land mid-redirect and hit a
 * detached element. Call this right after signing in whenever the test is about to use the TopBar.
 */
export async function skipOnboardingIfShown(page: Page): Promise<void> {
  // The app sends a new account to onboarding once its stored state has loaded, which on a first visit waits on
  // the server: wait for that decision (the page's loading skeleton gone, or onboarding), not a fixed time.
  await expect(async () => {
    if (/\/onboarding/.test(page.url())) return;
    // The loading mark by its role, not its label (the label is "Loading…" now, and a page may pass its own).
    await expect(page.locator('#main [role="status"][aria-busy="true"]')).toHaveCount(0, { timeout: 1_000 });
  }).toPass({ timeout: 45_000 });
  if (/\/onboarding/.test(page.url())) {
    await page.getByRole("button", { name: "Skip" }).click();
    // Against a deployment, the first sign-in after a quiet spell can wait on cold functions; allow for that.
  await page.waitForURL(/\/app(\/|$)/, { timeout: 45_000 });
  }
}

interface Fixtures {
  /** A disposable, confirmed Supabase account — created before the test, deleted after, never signed in
   *  automatically (for specs that want to drive sign-in themselves, or test with fresh credentials). */
  account: TestAccount;
  /** The same account, already signed in through the real sign-in UI, landed on /app. */
  signedInPage: { page: Page; account: TestAccount };
}

export const test = base.extend<Fixtures>({
  account: async ({ browser }, use) => {
    test.skip(!supabaseConfigured(), "No Supabase admin credentials in this environment — account-dependent test is BLOCKED, not run.");
    const account = await createTestAccount();
    await use(account);
    await removeTestAccount(browser, account);
  },
  signedInPage: async ({ page, account }, use) => {
    await signInThroughUI(page, account);
    await use({ page, account });
  },
});

export { expect };
