import { cookies } from "next/headers";
import { DEMO_COOKIE, authConfigured } from "@/lib/auth/config";
import { AuthRequiredError, getSession } from "./auth";

/**
 * Who may read the help center (/help and its assistant): a signed-in account, like the rest of the app.
 * proxy.ts redirects signed-out visitors to sign-in first; this is the page's own check, so a request that
 * reaches the page without a session (a stale demo cookie in production, a matcher change) still gets
 * nothing.
 *
 * - Supabase Auth configured: a verified session, or demo mode where the deployment offers a demo
 *   (local development and the E2E suite; production has none — app/demo/route.ts).
 * - Auth not configured (local-only mode): open, as the whole app is.
 */
export type HelpAccess = "allowed" | "sign-in";

export function demoOffered(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.WJ_DEMO_ENABLED === "1";
}

export function decideHelpAccess(input: { authConfigured: boolean; signedIn: boolean; demoCookie: boolean; demoOffered: boolean }): HelpAccess {
  if (!input.authConfigured || input.signedIn) return "allowed";
  return input.demoCookie && input.demoOffered ? "allowed" : "sign-in";
}

export async function helpAccess(): Promise<HelpAccess> {
  let signedIn = false;
  try {
    await getSession();
    signedIn = true;
  } catch (e) {
    if (!(e instanceof AuthRequiredError)) throw e;
  }
  const demoCookie = (await cookies()).get(DEMO_COOKIE)?.value === "1";
  return decideHelpAccess({ authConfigured: authConfigured(), signedIn, demoCookie, demoOffered: demoOffered() });
}
