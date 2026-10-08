import { describe, expect, it } from "vitest";
import { friendlyAuthError, isOtherBrowserError, OTHER_BROWSER } from "./friendly";

const PKCE = "PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and client to store the code verifier in cookies.";

describe("friendlyAuthError", () => {
  it("explains a link opened in another browser in plain words — the reported raw PKCE message", () => {
    expect(isOtherBrowserError(PKCE)).toBe(true);
    expect(friendlyAuthError(PKCE)).toBe(OTHER_BROWSER);
    expect(friendlyAuthError(PKCE)).not.toMatch(/pkce|verifier|ssr|supabase/i);
  });

  it("keeps the existing translations and passes unknown messages through", () => {
    expect(isOtherBrowserError("Invalid login credentials")).toBe(false);
    expect(friendlyAuthError("Invalid login credentials")).toMatch(/don't match/);
    expect(friendlyAuthError("Token has expired or is invalid")).toBe("This link is no longer valid. Request a new one.");
    expect(friendlyAuthError("Something new")).toBe("Something new");
  });
});
