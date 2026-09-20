import { test as base, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { uniqueTestEmail, testPassword } from "../utils/testUser";

export interface TestAccount {
  id: string;
  email: string;
  password: string;
}

let cachedAdmin: SupabaseClient | null | undefined;

/** Null when the environment this test run inherited has no Supabase admin credentials — every
 *  account-dependent spec checks this and reports BLOCKED rather than faking a pass (see AGENTS note:
 *  "If a feature is absent, report NOT_APPLICABLE or BLOCKED; do not fake coverage"). */
function adminClient(): SupabaseClient | null {
  if (cachedAdmin !== undefined) return cachedAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cachedAdmin = url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
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
  return { id: data.user.id, email, password };
}

/** Removes the auth user and whatever product state it wrote, so a test run leaves nothing behind in
 *  the shared project beyond a moment's row that was always going to be deleted. Best-effort: a cleanup
 *  failure must never fail the test it's cleaning up after. */
export async function deleteTestAccount(id: string): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  await admin.auth.admin.deleteUser(id).catch(() => {});
  await admin.schema("wonderjobs").from("app_state").delete().eq("tenant_id", id).then(
    () => {},
    () => {},
  );
  await admin.schema("wonderjobs").from("action_audit").delete().eq("tenant_id", id).then(
    () => {},
    () => {},
  );
}

/** Drives the real sign-in form (not an API shortcut) so the assertion is about the actual UI candidates use. */
export async function signInThroughUI(page: Page, account: Pick<TestAccount, "email" | "password">): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app(\/|$)/, { timeout: 20_000 });
}

/**
 * A brand-new account has no Career DNA yet, so `AppShell`'s `Gate` client-side-redirects it from `/app`
 * to `/onboarding` once local state finishes hydrating — a redirect that lands a beat *after* the sign-in
 * navigation `signInThroughUI` already resolved on. A test that needs the real app shell (TopBar, the
 * profile menu, sign-out) has to settle past that race first, or a click can land mid-redirect and hit a
 * detached element. Call this right after signing in whenever the test is about to use the TopBar.
 */
export async function skipOnboardingIfShown(page: Page): Promise<void> {
  await page.waitForURL(/\/onboarding/, { timeout: 3_000 }).catch(() => {});
  if (/\/onboarding/.test(page.url())) {
    await page.getByRole("button", { name: "Skip" }).click();
    await page.waitForURL(/\/app(\/|$)/, { timeout: 20_000 });
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
  account: async ({}, use) => {
    test.skip(!supabaseConfigured(), "No Supabase admin credentials in this environment — account-dependent test is BLOCKED, not run.");
    const account = await createTestAccount();
    await use(account);
    await deleteTestAccount(account.id);
  },
  signedInPage: async ({ page, account }, use) => {
    await signInThroughUI(page, account);
    await use({ page, account });
  },
});

export { expect };
