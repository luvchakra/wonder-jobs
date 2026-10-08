"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser, rememberUser } from "@/lib/auth/browser";
import { friendlyAuthError, isOtherBrowserError } from "@/lib/auth/friendly";
import { PageLoading } from "@/components/common/States";
import { Button } from "@/components/common/Button";
import { safeNextPath } from "@/lib/safeRedirect";

/** Completes email confirmation / magic-link sign-in (PKCE code exchange), then continues to the app. */
export function AuthCallback() {
  const params = useSearchParams();
  const [error, setError] = useState<{ title: string; message: string; action: { href: string; label: string } } | null>(null);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    const code = params.get("code");
    const rawNext = params.get("next");
    const next = safeNextPath(rawNext, "/app");
    const recovery = next === "/reset-password" || params.get("type") === "recovery";
    const fail = (m: string) => {
      // A link opened in another browser: sign-up confirmation is already done by then, so the way on is
      // to sign in here; a password reset has to be asked for again from this browser.
      if (isOtherBrowserError(m))
        return setError(
          recovery
            ? { title: "Open the reset link where you asked for it", message: "Password reset links only work in the browser you asked for them from. Ask for a new one here.", action: { href: "/forgot-password", label: "Send a new link" } }
            : { title: "Sign in to continue", message: friendlyAuthError(m), action: { href: `/sign-in?next=${encodeURIComponent(next)}`, label: "Sign in" } },
        );
      setError({ title: "We couldn't sign you in", message: friendlyAuthError(m), action: { href: recovery ? "/forgot-password" : "/sign-in", label: recovery ? "Send a new link" : "Back to sign in" } });
    };
    if (!sb) return fail("Sign-in isn't configured on this deployment.");
    if (params.get("error_description")) return fail(params.get("error_description")!.replace(/\+/g, " "));
    const tokenHash = params.get("token_hash");
    const type = params.get("type");
    (async () => {
      if (tokenHash && type) {
        // Token-hash links (recovery, magic link, email confirmation) work on any device: no PKCE verifier needed.
        const { data, error: err } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: type as "recovery" | "magiclink" | "signup" | "email" | "invite" | "email_change" });
        if (err || !data.session) return fail(err?.message ?? "This link is no longer valid. Request a new one.");
        rememberUser(data.session.user.id);
         
        window.location.href = type === "recovery" ? "/reset-password" : next;
        return;
      }
      if (code) {
        const { data, error: err } = await sb.auth.exchangeCodeForSession(code);
        if (err || !data.session) return fail(err?.message ?? "This link is no longer valid. Request a new one.");
        rememberUser(data.session.user.id);
      } else {
        // Implicit-flow links land with a hash; the client parses it on getSession.
        const { data } = await sb.auth.getSession();
        if (!data.session) return fail("This link is no longer valid. Request a new one.");
        rememberUser(data.session.user.id);
      }
       
      window.location.href = next;
    })();
  }, [params]);

  if (error) {
    return (
      <div className="mx-auto max-w-md p-8">
        <h1 className="text-xl font-semibold text-ink">{error.title}</h1>
        <p role="alert" className="mt-2 text-sm text-ink-3">
          {error.message}
        </p>
        <Button className="mt-5" href={error.action.href}>
          {error.action.label}
        </Button>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md p-8">
      <PageLoading rows={2} />
    </div>
  );
}
