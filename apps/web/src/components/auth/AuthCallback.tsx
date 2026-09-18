"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser, rememberUser } from "@/lib/auth/browser";
import { PageLoading } from "@/components/common/States";
import { Button } from "@/components/common/Button";

/** Completes email confirmation / magic-link sign-in (PKCE code exchange), then continues to the app. */
export function AuthCallback() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    const code = params.get("code");
    const rawNext = params.get("next");
    const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/app";
    const fail = (m: string) => setError(m);
    if (!sb) return fail("Sign-in isn't configured on this deployment.");
    if (params.get("error_description")) return fail(params.get("error_description")!);
    (async () => {
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
        <h1 className="text-xl font-semibold text-ink">We couldn&apos;t sign you in</h1>
        <p role="alert" className="mt-2 text-sm text-ink-3">
          {error}
        </p>
        <Button className="mt-5" href="/sign-in">
          Back to sign in
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
