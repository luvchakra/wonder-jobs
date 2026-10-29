import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { PRIVACY_NOTICE_VERSION } from "../../src/content/privacy";
import { SEED_DNA } from "../../src/testing/sample/seed";
import { sampleDocs } from "./sampleDocs";

/**
 * A signed-in candidate with history, for journeys that need one without a real account: the account WonderJobs'
 * product demo used to show, now only here. Nothing in the product serves it. The web server these specs run
 * against has no Supabase (local mode), so the browser is "signed in" by the cookie the proxy would have set, and
 * its stores start from the documents below — written through the stores' own `partialize`, so they are exactly
 * what the product would have saved. Searches answer from the same sample postings (WJ_E2E_FIXTURE_JOBS, set by
 * playwright.config.ts) through the real WorksLake path.
 */

export interface SampleOptions {
  /** Hold every search this long before it starts, so a test can pause or stop it while it runs. */
  latencyMs?: number;
  /** Start without the sample history: a brand-new, onboarded-less account. */
  empty?: boolean;
  /** The plan to test on (no payment: the pre-launch testing-plan switch). Max unless said, so no limit gets in a journey's way. */
  plan?: "free" | "pro" | "max";
}

/** What the sample candidate's saved jobs and applications refer to, for specs that assert on them. */
export const SAMPLE = { name: SEED_DNA.name, savedJobIds: ["job_google_pm", "job_amazon_growth", "job_airbnb_pm"] } as const;

/**
 * Signs a fresh browser context in as the sample candidate (or, with `empty`, as a new account with nothing) and
 * opens `next`. Each call is its own account: nothing carries over between tests.
 */
export async function openApp(page: Page, next = "/app", opts: SampleOptions = {}): Promise<{ userId: string }> {
  const userId = `u-e2e-${randomBytes(6).toString("hex")}`;
  const seed = opts.empty ? {} : sampleDocs();
  await page.addInitScript(
    ({ userId: id, seed: s }) => {
      document.cookie = `wj_user=${id}; Path=/; SameSite=Lax`;
      // The account's email, as sign-in would give it (read only under WJ_E2E_LEGACY_EMAIL=1, wj-e2e-*@example.com only).
      document.cookie = `wj_e2e_email=${encodeURIComponent(`wj-e2e-${id}@example.com`)}; Path=/; SameSite=Lax`;
      // Only the first page of the context: later navigations keep whatever the app has saved since.
      if (sessionStorage.getItem("wj-e2e-seeded")) return;
      sessionStorage.setItem("wj-e2e-seeded", "1");
      for (const [name, doc] of Object.entries(s)) localStorage.setItem(`${id}:${name}`, doc);
    },
    { userId, seed },
  );
  if (opts.latencyMs) {
    await page.route("**/api/jobs-lake/v1/search/stream", async (route) => {
      await new Promise((r) => setTimeout(r, opts.latencyMs));
      await route.continue();
    });
  }
  // The privacy notice is answered the way the in-app gate would, so it doesn't interrupt the journey.
  await page.request.post("/api/privacy/consent", { data: { noticeVersion: PRIVACY_NOTICE_VERSION, accept: true, adult: true } });
  await page.request.post("/api/billing/test-plan", { data: { plan: opts.plan ?? "max" } });
  await page.goto(next);
  if (new URL(page.url()).pathname === "/sign-in") {
    throw new Error("The web server has Supabase Auth configured, so signing in by cookie doesn't apply. Run it with NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= SUPABASE_SERVICE_ROLE_KEY= (CI's local part has none; a local .env.local does).");
  }
  return { userId };
}
