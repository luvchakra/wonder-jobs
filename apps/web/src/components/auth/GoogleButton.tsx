"use client";
import { useState } from "react";
import { Button } from "@/components/common/Button";
import { getSupabaseBrowser } from "@/lib/auth/browser";
import { track } from "@/lib/analytics";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z" />
    </svg>
  );
}

/**
 * Google OAuth through Supabase Auth (PKCE). Supabase redirects back to
 * /auth/callback, which exchanges the code and continues to `next`.
 */
export function GoogleButton({ next, label = "Continue with Google", disabled, onError }: { next: string; label?: string; disabled?: boolean; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const start = async () => {
    const sb = getSupabaseBrowser();
    if (!sb) return onError("Sign-in isn't configured on this deployment yet.");
    setBusy(true);
    try {
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
    <Button type="button" variant="outline" size="lg" full loading={busy} disabled={disabled || busy} onClick={start} icon={<GoogleMark />}>
      {label}
    </Button>
  );
}
