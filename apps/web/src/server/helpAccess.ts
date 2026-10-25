import { authConfigured } from "@/lib/auth/config";
import { AuthRequiredError, getSession } from "./auth";

/**
 * Who may read the help center (/help and its assistant): a signed-in account, like the rest of the app.
 * proxy.ts redirects signed-out visitors to sign-in first; this is the page's own check, so a request that
 * reaches the page without a session (a matcher change) still gets nothing.
 *
 * - Supabase Auth configured: a verified session.
 * - Auth not configured (local-only mode): open, as the whole app is.
 */
export type HelpAccess = "allowed" | "sign-in";

export function decideHelpAccess(input: { authConfigured: boolean; signedIn: boolean }): HelpAccess {
  return !input.authConfigured || input.signedIn ? "allowed" : "sign-in";
}

export async function helpAccess(): Promise<HelpAccess> {
  let signedIn = false;
  try {
    await getSession();
    signedIn = true;
  } catch (e) {
    if (!(e instanceof AuthRequiredError)) throw e;
  }
  return decideHelpAccess({ authConfigured: authConfigured(), signedIn });
}
