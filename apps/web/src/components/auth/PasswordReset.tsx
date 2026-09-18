"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Mail, KeyRound } from "lucide-react";
import { HeroScene } from "@/components/landing/HeroScene";
import { WonderLogo } from "@/components/brand/WonderLogo";
import { Button } from "@/components/common/Button";
import { Input, Field } from "@/components/common/Input";
import { PasswordInput } from "./PasswordInput";
import { getSupabaseBrowser, rememberUser } from "@/lib/auth/browser";

function Shell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink text-white">
      <HeroScene variant="dusk" className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/40 to-ink/95" />
      <main id="main" className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-8 md:justify-center">
        <WonderLogo href="/" tone="dark" size={34} />
        <div className="mt-8 w-full rounded-[24px] bg-white p-6 text-ink shadow-xl md:p-8">
          <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-ink-3">{sub}</p>
          {children}
        </div>
        <p className="mt-4 text-center text-[13px] text-white/70">
          Need a hand?{" "}
          <Link href="/help" className="font-semibold text-white hover:underline">
            Read the guide
          </Link>
        </p>
      </main>
    </div>
  );
}

/** Step 1: ask for the account email; Supabase sends a recovery link to /auth/callback → /reset-password. */
export function ForgotPasswordForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseBrowser();
    if (!sb) return setError("Sign-in isn't configured on this deployment yet.");
    setBusy(true);
    setError(null);
    try {
      const request = sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}` });
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 30_000));
      const { error: err } = await Promise.race([request, timeout]);
      if (err) throw err;
      setSent(true);
    } catch (err) {
      const m = err instanceof Error ? err.message : "Something went wrong";
      if (m === "timeout") setError("That took too long. Check your connection and try again.");
      else if (/rate limit|too many/i.test(m)) setError("Too many requests. Give it a minute and try again.");
      else if (/invalid/i.test(m) && /email/i.test(m)) setError("That doesn't look like an address we can send to. Check it and try again.");
      else setError(m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Reset your password" sub="Enter the email you signed up with and we'll send a link to choose a new password.">
      {sent ? (
        <div role="status" className="mt-6 rounded-[16px] bg-brand-50 p-4 text-sm text-ink-2">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <Mail className="size-4 text-brand-600" aria-hidden /> Check your inbox
          </p>
          <p className="mt-1">
            If an account exists for <span className="font-medium text-ink">{email.trim()}</span>, a reset link is on its way. Open it on this device; it expires after an hour.
          </p>
          <button type="button" onClick={() => setSent(false)} className="mt-3 text-[13px] font-semibold text-brand-600 hover:underline">
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
          </Field>
          {error && (
            <p role="alert" className="rounded-[12px] bg-danger-100/60 px-3 py-2 text-[13px] text-danger-600">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" full loading={busy} disabled={busy || !email.trim()} iconRight={<ArrowRight className="size-4" aria-hidden />}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-[13px] text-ink-3">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-semibold text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </Shell>
  );
}

/** Step 2: with a recovery session in place, choose a new password. */
export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<"checking" | "yes" | "no">("checking");

  useEffect(() => {
    const sb = getSupabaseBrowser();
    let alive = true;
    const check: Promise<"yes" | "no"> = sb ? sb.auth.getSession().then(({ data }) => (data.session ? "yes" : "no")) : Promise.resolve("no");
    void check.then((v) => {
      if (alive) setSession(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const sb = getSupabaseBrowser();
    if (!sb) return setError("Sign-in isn't configured on this deployment yet.");
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await sb.auth.updateUser({ password });
      if (err) throw err;
      if (data.user) rememberUser(data.user.id);
      setDone(true);
      setTimeout(() => {
        // Full reload on purpose: the product boots its stores under the (possibly new) account.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/app";
      }, 1200);
    } catch (err) {
      const m = err instanceof Error ? err.message : "Something went wrong";
      setError(/same password|different from the old/i.test(m) ? "Choose a password you haven't used before." : m);
    } finally {
      setBusy(false);
    }
  };

  if (session === "no") {
    return (
      <Shell title="This reset link has expired" sub="Reset links work once and expire after an hour. Request a new one and open it on this device.">
        <Button className="mt-6" full href="/forgot-password">
          Request a new link
        </Button>
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new password" sub="At least 8 characters. You'll be signed in right after.">
      {done ? (
        <p role="status" className="mt-6 rounded-[16px] bg-success-100/60 p-4 text-sm font-medium text-ink">
          Password updated. Taking you to your dashboard…
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
          <Field label="New password" htmlFor="new-password">
            <PasswordInput id="new-password" name="new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoFocus disabled={session !== "yes"} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm-password">
            <PasswordInput id="confirm-password" name="confirm-password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required disabled={session !== "yes"} />
          </Field>
          {error && (
            <p role="alert" className="rounded-[12px] bg-danger-100/60 px-3 py-2 text-[13px] text-danger-600">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" full loading={busy} disabled={busy || session !== "yes" || password.length < 8 || !confirm} icon={<KeyRound className="size-4" aria-hidden />}>
            Update password
          </Button>
        </form>
      )}
    </Shell>
  );
}
