import { cn } from "@/lib/cn";

/**
 * The WonderStar mark: a "W" of two V-shaped wings (indigo-violet and violet-magenta) with a four-point star.
 * Inline so it needs no request; the paths and gradients are `public/brand/wonderstar-mark.svg`'s
 * (`scripts/brand-svg.py`) — change them there and copy them here.
 */
export function WonderStarMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="ws-left" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient id="ws-right" x1="0.2" y1="1" x2="0.8" y2="0">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#EC4899" />
        </linearGradient>
        <linearGradient id="ws-spark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C084FC" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <g strokeLinejoin="round">
        <path d="M5 22 L24 22 L37 58 L48 36 L63 36 L42 86 L32 86 Z" fill="url(#ws-left)" stroke="url(#ws-left)" strokeWidth="5" />
        <path d="M48 36 L63 36 L73 58 L90 18 L115 18 L80 86 L69 86 Z" fill="url(#ws-right)" stroke="url(#ws-right)" strokeWidth="5" opacity="0.94" />
        <path d="M42 2 Q44.2 10.8 53 13 Q44.2 15.2 42 24 Q39.8 15.2 31 13 Q39.8 10.8 42 2 Z" fill="url(#ws-spark)" />
      </g>
    </svg>
  );
}

/** "Wonder" in Deep Navy (white on dark) and "Star" in the violet→blue gradient. */
export function WonderStarWord({ dark, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight", className)}>
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
