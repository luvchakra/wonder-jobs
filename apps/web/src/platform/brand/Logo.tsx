import { cn } from "@/lib/cn";

/** The WonderStar mark: two violet-to-pink wings forming a W, with a four-point star (same paths as public/brand/). */
export function WonderStarMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 52" className={className} aria-hidden>
      <defs>
        <linearGradient id="wsmL" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id="wsmR" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EC4899" />
          <stop offset="0.55" stopColor="#A855F7" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id="wsmS" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A855F7" />
          <stop offset="1" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <path fill="none" stroke="url(#wsmL)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" d="M7 17 18.5 45 30 17" />
      <path fill="none" stroke="url(#wsmR)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" strokeOpacity=".94" d="M28 17 39.5 45 57 9" />
      <path fill="url(#wsmS)" transform="translate(-5 -1)" d="M24 0c.6 4.2 2.4 6 6.6 6.6-4.2.6-6 2.4-6.6 6.6-.6-4.2-2.4-6-6.6-6.6C21.6 6 23.4 4.2 24 0z" />
    </svg>
  );
}

/** "Wonder" in Deep Navy (white on dark) and "Star" in the violet→blue gradient. */
export function WonderStarWord({ dark, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={cn("font-bold tracking-tight", className)}>
      <span className={dark ? "text-white" : "text-deep-navy"}>Wonder</span>
      <span className={cn("bg-clip-text text-transparent", dark ? "bg-linear-to-r from-[#c4b5fd] to-[#93c5fd]" : "bg-linear-to-r from-star-purple to-sky-blue")}>Star</span>
    </span>
  );
}

/** The primary horizontal logo. */
export function WonderStarLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} aria-label="WonderStar" role="img">
      <WonderStarMark className="h-[1.3em] w-auto" />
      <WonderStarWord />
    </span>
  );
}

export const TAGLINE = ["Discover opportunities.", "Unlock possibilities."] as const;

/** The splash: the stacked logo and tagline on the deep indigo→violet gradient with soft waves. */
export function WonderStarSplash({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("relative overflow-hidden rounded-[24px] bg-linear-to-b from-[#1e1b4b] via-indigo to-star-purple px-6 pb-8 pt-10 text-center text-white", className)}>
      <svg aria-hidden viewBox="0 0 400 120" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full opacity-40">
        <path fill="#a855f7" d="M0 70C80 40 160 110 250 80S360 40 400 55V120H0z" />
        <path fill="#c084fc" fillOpacity=".5" d="M0 95C90 70 170 120 260 98S350 75 400 85V120H0z" />
      </svg>
      <div className="relative">
        <WonderStarMark className="mx-auto h-14 w-auto" />
        <WonderStarWord dark className="mt-2 block text-3xl" />
        <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-white/85">
          {TAGLINE[0]}
          <br />
          {TAGLINE[1]}
        </p>
        {children}
      </div>
    </div>
  );
}

/** The primary action's gradient (Star Purple → Indigo). */
export const WS_PRIMARY = "bg-linear-to-r from-star-purple to-indigo text-white shadow-[0_6px_20px_-6px_rgba(124,58,237,0.6)] hover:brightness-110 wj-press";
