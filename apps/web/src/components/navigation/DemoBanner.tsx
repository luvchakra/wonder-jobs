"use client";
import { FlaskConical, LogIn } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useHydration } from "@/store/hydration";

/**
 * Always visible while in demo mode — not tucked behind the avatar menu — so nobody mistakes
 * seeded sample data for their own account. `/demo/exit` clears the demo cookie before landing
 * on sign-in, so re-entering the demo afterward starts from a clean slate rather than resuming
 * this browser's old seeded data.
 */
export function DemoBanner() {
  const hydrated = useHydration((s) => s.hydrated);
  const mode = useAuthStore((s) => s.mode);
  if (!hydrated || mode !== "demo") return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 bg-brand-600 px-4 py-2 text-center text-[13px] font-medium text-white">
      <span className="inline-flex items-center gap-1.5">
        <FlaskConical className="size-4 shrink-0" aria-hidden />
        You&apos;re exploring sample demo data — nothing here is saved to an account.
      </span>
      <a
        href="/demo/exit?next=/sign-in"
        className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-semibold transition-colors hover:bg-white/25"
      >
        <LogIn className="size-3.5" aria-hidden /> Exit demo &amp; sign in
      </a>
    </div>
  );
}
