import { cn } from "@/lib/cn";

/**
 * The WonderWorks mark: a "W" of two rounded wings (blue to lavender, violet to pink) meeting at a point, under a
 * four-point star. Inline so it needs no request; the paths and gradients are `public/brand/wonderstar-mark.svg`'s
 * (`scripts/brand-svg.py`) — change them there and copy them here.
 */
export function WonderStarMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="ws-left" x1="0.1" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#3730FF" />
          <stop offset="0.45" stopColor="#5B78FF" />
          <stop offset="1" stopColor="#C9A2F9" />
        </linearGradient>
        <linearGradient id="ws-left-fold" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor="#8F7BFF" stopOpacity="0.5" />
          <stop offset="1" stopColor="#4C0FF5" />
        </linearGradient>
        <linearGradient id="ws-right" x1="0.1" y1="1" x2="0.8" y2="0">
          <stop offset="0" stopColor="#5312FF" />
          <stop offset="0.5" stopColor="#A43FF7" />
          <stop offset="1" stopColor="#F563E0" />
        </linearGradient>
        <linearGradient id="ws-right-fold" x1="0.2" y1="1" x2="0.8" y2="0">
          <stop offset="0" stopColor="#8A3FFF" />
          <stop offset="0.6" stopColor="#E24DF2" />
          <stop offset="1" stopColor="#FF7EBF" />
        </linearGradient>
        <linearGradient id="ws-spark" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.2" stopColor="#3D33FF" />
          <stop offset="0.55" stopColor="#B444FF" />
          <stop offset="0.85" stopColor="#FF5CCF" />
        </linearGradient>
      </defs>
      <g transform="translate(1.4 9.8) scale(0.11) translate(-233 -137)">
        <path d="M240 374A66 66 0 0 1 326 284L588 400Q630 418 652 456L763 645L640 815A97 97 0 0 1 458 832Z" fill="url(#ws-left)" />
        <path d="M588 400Q630 418 652 456L763 645L640 815Q652 780 622 715Q562 590 562 500Q562 430 588 400Z" fill="url(#ws-left-fold)" />
        <path d="M763 645L880 460Q905 422 948 403L1208 285A66 66 0 0 1 1293 376L1056 835A97 97 0 0 1 878 815Z" fill="url(#ws-right)" />
        <path d="M878 815Q868 785 892 735Q990 510 1112 342L1208 285A66 66 0 0 1 1293 376L1056 835A97 97 0 0 1 878 815Z" fill="url(#ws-right-fold)" opacity="0.85" />
        <path d="M766 138C772 236 790 288 920 298C790 310 772 362 766 462C760 362 742 310 612 298C742 288 760 236 766 138Z" fill="url(#ws-spark)" />
      </g>
    </svg>
  );
}

/** "Wonder" in Deep Navy (white on dark) and "Works" in the violet→blue gradient. */
export function WonderStarWord({ dark, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight", className)}>
      <span className={dark ? "text-white" : "text-deep-navy"}>Wonder</span>
      <span className={cn("bg-clip-text text-transparent", dark ? "bg-linear-to-r from-[#c4b5fd] to-[#93c5fd]" : "bg-linear-to-r from-star-purple to-sky-blue")}>Works</span>
    </span>
  );
}

/** The primary horizontal logo. */
export function WonderStarLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} aria-label="WonderWorks" role="img">
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
