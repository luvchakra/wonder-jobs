import { test, expect, supabaseConfigured, createTestAccount, deleteTestAccount, signInThroughUI, skipOnboardingIfShown } from "./fixtures/auth";
import { uniqueTestEmail } from "./utils/testUser";

test.describe("AUTH — landing and sign-up UI (no account needed)", () => {
  test("AUTH-001 landing page has the essentials, no broken assets, no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("/");
    await expect(page).toHaveTitle(/WonderJobs/i);
    await expect(page.getByRole("link", { name: /sign up|get started/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /demo/i }).first()).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
    // Every rendered <img> actually loaded (a broken image reports naturalWidth 0).
    const broken = await page.locator("img").evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 0).map((i) => (i as HTMLImageElement).src));
    expect(broken, `broken images: ${broken.join(", ")}`).toEqual([]);
    expect(errors, `console/page errors: ${errors.join("\n")}`).toEqual([]);
  });

  test("AUTH-002 sign-up form has email, password with reveal, and legal/help links", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByLabel("Your name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show password" })).toBeVisible();
    await expect(page.getByRole("button", { name: /get started/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /read the guide/i })).toBeVisible();
  });

  test("AUTH-004 invalid sign-up email is rejected by the browser's own validation", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Your name").fill("Test Candidate");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("a-fine-password-1");
    await page.getByRole("button", { name: /get started/i }).click();
    // The field itself reports the failure (native `type="email"` validity), and the app never navigates away.
    const valid = await page.getByLabel("Email").evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(valid).toBe(false);
    await expect(page).toHaveURL(/\/sign-up/);
  });

  test("AUTH-005 password validation: too short is rejected before submit", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Your name").fill("Test Candidate");
    await page.getByLabel("Email").fill(uniqueTestEmail("shortpw"));
    await page.getByLabel("Password", { exact: true }).fill("short");
    await expect(page.getByRole("button", { name: /get started/i })).toBeDisabled();
  });

  test("AUTH-005 empty email and password leave submit disabled", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByRole("button", { name: /get started/i })).toBeDisabled();
  });

  test("AUTH-006 password reveal toggles visibility and leaves the value unchanged", async ({ page }) => {
    await page.goto("/sign-up");
    const pw = page.getByLabel("Password", { exact: true });
    await pw.fill("check-this-value-123");
    await expect(pw).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(pw).toHaveAttribute("type", "text");
    await expect(pw).toHaveValue("check-this-value-123");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(pw).toHaveAttribute("type", "password");
    await expect(pw).toHaveValue("check-this-value-123");
  });

  test("AUTH-008 invalid credentials on sign-in show a safe, understandable error and no session", async ({ page }) => {
    test.skip(!supabaseConfigured(), "No Supabase configured in this environment.");
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(uniqueTestEmail("nouser"));
    await page.getByLabel("Password", { exact: true }).fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("alert")).not.toContainText(/stack|exception|at Object\./i);
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("AUTH-015 protected routes redirect to sign-in without a session", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in/);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("AUTH — real account lifecycle (Supabase-backed, disposable)", () => {
  test.skip(!supabaseConfigured(), "No Supabase admin credentials in this environment — every test below is BLOCKED, not run.");

  test("AUTH-003b a pre-confirmed account signs in through the real UI and reaches an empty onboarding-gated dashboard", async ({ signedInPage }) => {
    const { page } = signedInPage;
    await expect(page).toHaveURL(/\/onboarding|\/app/);
  });

  test("AUTH-007 signing out and back in reaches the same account's data, not someone else's", async ({ account, page }) => {
    await signInThroughUI(page, account);
    // Complete onboarding for real (not a fabricated marker): this writes Career DNA through
    // `completeOnboarding()`, which is server-synced state (the career store's `createRemoteStorage`),
    // unlike raw localStorage — `signOutEverywhere` deliberately wipes this account's own local keys too
    // on sign-out (local state is a cache; the server document is the source of truth after sign-out), so
    // a bare localStorage marker would never actually prove account continuity.
    await skipOnboardingIfShown(page);
    await expect(page).toHaveURL(/\/app(\/|$)/);

    await page.getByRole("button", { name: "Profile menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$|\/sign-in/, { timeout: 15_000 });

    await signInThroughUI(page, account);
    // Same account's onboarding-complete state round-trips through the server: signing back in with the
    // same account never re-onboards, proving the state that survived is this account's own.
    await page.waitForURL(/\/onboarding/, { timeout: 3_000 }).catch(() => {});
    expect(page.url()).toMatch(/\/app(\/|$)/);
  });

  test("AUTH-013 session persists across a reload", async ({ signedInPage }) => {
    const { page } = signedInPage;
    await page.reload();
    await expect(page).not.toHaveURL(/\/sign-in/);
  });

  test("AUTH-016 sign-out clears the session and protected routes reject access again", async ({ signedInPage }) => {
    const { page } = signedInPage;
    await skipOnboardingIfShown(page);
    await page.getByRole("button", { name: "Profile menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$|\/sign-in/, { timeout: 15_000 });
    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("AUTH-017 two accounts on the same browser never see each other's local data", async ({ page }) => {
    const a = await createTestAccount("isoA");
    const b = await createTestAccount("isoB");
    try {
      await signInThroughUI(page, a);
      await skipOnboardingIfShown(page);
      // Namespaced the real way (see AUTH-007 above): an unnamespaced key would never be scoped to
      // account A in the first place, so it wouldn't actually exercise the isolation this test is for.
      const secretKey = `${a.id}:wj.e2e.secret`;
      await page.evaluate((k) => localStorage.setItem(k, "belongs-to-A"), secretKey);
      await page.getByRole("button", { name: "Profile menu" }).click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
      await expect(page).toHaveURL(/\/$|\/sign-in/, { timeout: 15_000 });

      await signInThroughUI(page, b);
      const leaked = await page.evaluate((k) => localStorage.getItem(k), secretKey);
      expect(leaked, "account B's browser storage must not carry account A's namespaced data").toBeNull();
    } finally {
      await deleteTestAccount(a.id);
      await deleteTestAccount(b.id);
    }
  });
});

test.describe("AUTH — environmentally blocked (would send real email, or needs OAuth/clock control)", () => {
  test("AUTH-003 a brand-new account signs up through the real UI and gets a confirmation email", async () => {
    test.skip(
      true,
      "This project has \"Confirm email\" on: a real sign-up always makes GoTrue attempt to send a confirmation " +
        "email. Probing confirmed this directly — signup to the RFC 2606 placeholder domain example.com is " +
        "rejected outright by Supabase's own domain validation (\"Email address ... is invalid\", before any " +
        "email is attempted), and every other domain tried instead hit GoTrue's send-side rate limit, meaning " +
        "it had gotten far enough to attempt a real send. There is no domain that both passes validation and " +
        "is guaranteed not to trigger that send, so this path can't be exercised without breaking the \"never " +
        "send real external email\" rule (see AUTH-009 below). Account creation itself is still fully covered: " +
        "AUTH-003b onward create accounts via the admin API (createUser with email_confirm: true), which " +
        "never sends mail, and sign in through the real UI.",
    );
  });
  test("AUTH-009 magic link", async () => {
    test.skip(true, "Would require reading a real inbox for a delivered email; the plan explicitly forbids sending real external email from tests.");
  });
  test("AUTH-010/011 forgot/reset password, reused/expired recovery token", async () => {
    test.skip(true, "Same constraint: consuming a real recovery link needs a real inbox this environment doesn't have. Verified manually in an earlier session (see docs/IMPLEMENTATION_TRACKER.md, forgot-password story).");
  });
  test("AUTH-012 Google OAuth", async () => {
    test.skip(true, "Needs a configured Google test identity and interactive consent; not available in this environment.");
  });
  test("AUTH-014 session refresh (expired/refreshable token)", async () => {
    test.skip(true, "Needs control over token expiry (a fake clock or a manufactured stale JWT) that isn't wired up yet.");
  });
});
