"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Mail, ShieldCheck, Sparkles, Compass, FileEdit } from "lucide-react";
import { HeroScene } from "@/components/landing/HeroScene";
import { WonderLogo } from "@/components/brand/WonderLogo";
import { Button } from "@/components/common/Button";
import { Input, Field } from "@/components/common/Input";
import { PasswordInput } from "./PasswordInput";
import { GoogleButton } from "./GoogleButton";
import { JobTeaser, type PublicJobTeaser } from "./JobTeaser";
import { getSupabaseBrowser, rememberUser } from "@/lib/auth/browser";
import { friendlyAuthError } from "@/lib/auth/friendly";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";

const FEATURES = [
  { icon: Compass, label: "Find the right opportunities" },
  { icon: FileEdit, label: "Tailor your applications" },
  { icon: Sparkles, label: "Save time with AI" },
  { icon: ShieldCheck, label: "Stay in control" },
];

function safeNext(raw: string | null, fallback: string) {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}

/** Sign-in / sign-up (spec §5.1 "Get Started" / "Already have an account? Sign in"). Email + password, or a magic link. */
export function AuthForm({ mode, jobTeaser }: { mode: "sign-in" | "sign-up"; jobTeaser?: PublicJobTeaser | null }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next"), mode === "sign-up" ? "/onboarding" : "/app");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "password" | "magic">(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<null | "confirm" | "magic">(null);
  const sb = getSupabaseBrowser();

  // Full navigation: the product boots its stores fresh under this user's namespace.
  const finish = (userId: string) => {
    rememberUser(userId);
     
    window.location.href = next;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!sb) return setError("Sign-in isn't configured on this deployment yet.");
    setError(null);
    setBusy("password");
    try {
      if (mode === "sign-up") {
        const { data, error: err } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (err) throw err;
        track("account_created", { method: "password" });
        if (data.session?.user) return finish(data.session.user.id);
        setSent("confirm");
      } else {
        const { data, error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
        if (data.session?.user) {
          track("signed_in", { method: "password" });
          return finish(data.session.user.id);
        }
        setError("Signed in, but no session came back. Try again.");
      }
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setBusy(null);
    }
  };

  const magic = async () => {
    if (!sb) return setError("Sign-in isn't configured on this deployment yet.");
    if (!email.trim()) return setError("Enter your email first and we'll send you a link.");
    setError(null);
    setBusy("magic");
    try {
      const { error: err } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true, data: name.trim() ? { full_name: name.trim() } : undefined } });
      if (err) throw err;
      setSent("magic");
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setBusy(null);
    }
  };

  const title = mode === "sign-up" ? "Create your account" : "Welcome back";
  const sub = mode === "sign-up" ? "Wonder searches, analyzes and prepares. You stay in control." : "Pick up where your search left off.";

  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink text-white">
      <HeroScene variant="dusk" className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/40 to-ink/95" />
      <main id="main" className={cn("relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-8 md:max-w-5xl md:flex-row md:gap-16 md:px-10", jobTeaser ? "md:items-start md:py-14" : "md:items-center")}>
        <div className="md:flex-1">
          <WonderLogo href="/" tone="dark" size={34} />
          {jobTeaser ? (
            <>
              <h1 className="mt-10 text-[28px] font-semibold leading-[1.15] tracking-tight md:mt-14 md:text-[34px]">Someone shared a job with you on Wonder</h1>
              <p className="mt-2 max-w-lg text-[15px] text-white/80">Below is the real listing — description, requirements, company and hiring signals, no account needed. Sign in (or create a free account) and unlock your personalized match score, save this job, apply prepared by Wonder, and get matched to similar roles automatically.</p>
              <JobTeaser job={jobTeaser} />
            </>
          ) : (
            <>
              <h1 className="mt-10 text-[36px] font-semibold leading-[1.05] tracking-tight md:mt-14 md:text-[48px]">
                A smarter
                <br />
                way to your
                <br />
                next opportunity
              </h1>
              <p className="mt-3 text-[15px] text-white/80">We search. We analyze. You move forward.</p>
              <ul className="mt-6 hidden flex-col gap-2.5 md:flex" aria-label="What Wonder does">
                {FEATURES.map((f) => (
                  <li key={f.label} className="inline-flex w-fit items-center gap-2.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[13px] font-medium backdrop-blur">
                    <f.icon className="size-4 text-brand-200" aria-hidden /> {f.label}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className={cn("mt-8 w-full rounded-[24px] bg-white p-6 text-ink shadow-xl md:w-[420px] md:p-8", jobTeaser ? "md:mt-28" : "md:mt-0")}>
          <h2 className="text-[22px] font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-ink-3">{sub}</p>

          {sent ? (
            <div role="status" className="mt-6 rounded-[16px] bg-brand-50 p-4 text-sm text-ink-2">
              <p className="flex items-center gap-2 font-semibold text-ink">
                <Mail className="size-4 text-brand-600" aria-hidden /> Check your inbox
              </p>
              <p className="mt-1">
                {sent === "confirm" ? "We sent a confirmation link to " : "We sent a sign-in link to "}
                <span className="font-medium text-ink">{email.trim()}</span>. Open it on this device to continue.
              </p>
              <button type="button" onClick={() => setSent(null)} className="mt-3 text-[13px] font-semibold text-brand-600 hover:underline">
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
              {mode === "sign-up" && (
                <Field label="Your name" htmlFor="name" required>
                  <Input id="name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Morgan" required />
                </Field>
              )}
              <Field label="Email" htmlFor="email" required>
                <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </Field>
              <Field label="Password" htmlFor="password" required hint="At least 8 characters.">
                <PasswordInput id="password" name="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
                {mode === "sign-in" && (
                  <Link href={`/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`} className="self-end text-[12px] font-medium text-brand-600 hover:underline">
                    Forgot password?
                  </Link>
                )}
              </Field>
              {error && (
                <p role="alert" className="rounded-[12px] bg-danger-100/60 px-3 py-2 text-[13px] text-danger-600">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" full loading={busy === "password"} disabled={busy !== null || !email.trim() || password.length < 8 || (mode === "sign-up" && !name.trim())} iconRight={<ArrowRight className="size-4" aria-hidden />}>
                {mode === "sign-up" ? "Get Started" : "Sign in"}
              </Button>
              <Button type="button" variant="outline" size="lg" full loading={busy === "magic"} disabled={busy !== null || !email.trim()} onClick={magic} icon={<Mail className="size-4" aria-hidden />}>
                Email me a magic link instead
              </Button>
              <div className="flex items-center gap-3 text-[12px] text-ink-4" aria-hidden>
                <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
              </div>
              <GoogleButton next={next} disabled={busy !== null} onError={(m) => setError(friendlyAuthError(m))} label={mode === "sign-up" ? "Sign up with Google" : "Continue with Google"} />
            </form>
          )}

          <p className="mt-6 text-center text-[13px] text-ink-3">
            {mode === "sign-up" ? (
              <>
                Already have an account?{" "}
                <Link href={`/sign-in${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`} className="font-semibold text-brand-600 hover:underline">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New here?{" "}
                <Link href={`/sign-up${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`} className="font-semibold text-brand-600 hover:underline">
                  Create an account
                </Link>
              </>
            )}
          </p>
          <p className="mt-2 text-center text-[13px] text-ink-3">
            Just looking?{" "}
            <a href="/demo" className="font-semibold text-brand-600 hover:underline">
              Explore the demo
            </a>{" "}
            · Stuck?{" "}
            <Link href="/help" className="font-semibold text-brand-600 hover:underline">
              Read the guide
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
