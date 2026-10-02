"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/common/Button";
import { getSupabaseBrowser, oauthProviderEnabled } from "@/lib/auth/browser";
import { track } from "@/lib/analytics";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z" />
    </svg>
  );
}

const NOT_ENABLED = "Google sign-in isn't switched on for WonderJobs yet. Use your email instead.";

/**
 * Google OAuth through Supabase Auth (PKCE). Supabase redirects back to
 * /auth/callback, which exchanges the code and continues to `next`.
 *
 * `signInWithOAuth` only builds a URL and navigates — it never asks Supabase whether the provider is
 * on, so a project with Google disabled dropped people on a raw JSON error page. The provider's state
 * is read from Auth's public settings first, and the button says plainly when it isn't available.
 */
export function GoogleButton({ next, label = "Continue with Google", disabled, onError }: { next: string; label?: string; disabled?: boolean; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void oauthProviderEnabled("google").then((on) => {
      if (alive) setEnabled(on);
    });
    return () => {
      alive = false;
    };
  }, []);
  const start = async () => {
    const sb = getSupabaseBrowser();
    if (!sb) return onError("Sign-in isn't configured on this deployment yet.");
    setBusy(true);
    try {
      // Re-checked on click as well: the first check may not have finished yet.
      if ((await oauthProviderEnabled("google")) === false) {
        setBusy(false);
        setEnabled(false);
        return onError(NOT_ENABLED);
      }
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`, queryParams: { prompt: "select_account" } },
      });
      if (error) throw error;
      track("signed_in", { method: "google" });
      // The browser is being redirected to Google; keep the spinner until then.
    } catch (e) {
      setBusy(false);
      onError(e instanceof Error ? e.message : "Google sign-in failed");
    }
  };
  return (
    <div>
      <Button type="button" variant="outline" size="lg" full loading={busy} disabled={disabled || busy || enabled === false} onClick={start} icon={<GoogleMark />} aria-describedby={enabled === false ? "google-unavailable" : undefined}>
        {label}
      </Button>
      {enabled === false && (
        <p id="google-unavailable" className="mt-1.5 text-center text-[12.5px] text-ink-3">
          {NOT_ENABLED}
        </p>
      )}
    </div>
  );
}
