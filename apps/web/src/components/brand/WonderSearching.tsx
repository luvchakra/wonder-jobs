import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * The WonderWorks mark at work, shown while a search runs (owner, 2026-11-01: "the star at the middle should blink and
 * the left and right wings should open up nicely"): the two wings open out from where they meet, hold, and fold back;
 * the four-point star twinkles above them. The same paths as `wonderworks/brand/Logo.tsx`; pure SVG + CSS
 * (`wj-ww-*` in globals.css). With reduced motion it's the still mark. Decorative — the text beside it says what's
 * happening.
 */
const INNER = "translate(1.4 9.8) scale(0.11) translate(-233 -137)";

export function WonderSearching({ size = 64, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 120 100" width={(size * 120) / 100} height={size} aria-hidden className={cn("shrink-0 overflow-visible", className)}>
      <defs>
        <linearGradient id={`${id}l`} x1="0.1" y1="0" x2="0.7" y2="1"><stop offset="0" stopColor="#3730FF" /><stop offset="0.45" stopColor="#5B78FF" /><stop offset="1" stopColor="#C9A2F9" /></linearGradient>
        <linearGradient id={`${id}lf`} x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stopColor="#8F7BFF" stopOpacity="0.5" /><stop offset="1" stopColor="#4C0FF5" /></linearGradient>
        <linearGradient id={`${id}r`} x1="0.1" y1="1" x2="0.8" y2="0"><stop offset="0" stopColor="#5312FF" /><stop offset="0.5" stopColor="#A43FF7" /><stop offset="1" stopColor="#F563E0" /></linearGradient>
        <linearGradient id={`${id}rf`} x1="0.2" y1="1" x2="0.8" y2="0"><stop offset="0" stopColor="#8A3FFF" /><stop offset="0.6" stopColor="#E24DF2" /><stop offset="1" stopColor="#FF7EBF" /></linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0"><stop offset="0.2" stopColor="#3D33FF" /><stop offset="0.55" stopColor="#B444FF" /><stop offset="0.85" stopColor="#FF5CCF" /></linearGradient>
      </defs>
      <g className="wj-ww-wing-l">
        <g transform={INNER}>
          <path d="M240 374A66 66 0 0 1 326 284L588 400Q630 418 652 456L763 645L640 815A97 97 0 0 1 458 832Z" fill={`url(#${id}l)`} />
          <path d="M588 400Q630 418 652 456L763 645L640 815Q652 780 622 715Q562 590 562 500Q562 430 588 400Z" fill={`url(#${id}lf)`} />
        </g>
      </g>
      <g className="wj-ww-wing-r">
        <g transform={INNER}>
          <path d="M763 645L880 460Q905 422 948 403L1208 285A66 66 0 0 1 1293 376L1056 835A97 97 0 0 1 878 815Z" fill={`url(#${id}r)`} />
          <path d="M878 815Q868 785 892 735Q990 510 1112 342L1208 285A66 66 0 0 1 1293 376L1056 835A97 97 0 0 1 878 815Z" fill={`url(#${id}rf)`} opacity="0.85" />
        </g>
      </g>
      <g className="wj-ww-star">
        <g transform={INNER}>
          <path d="M766 138C772 236 790 288 920 298C790 310 772 362 766 462C760 362 742 310 612 298C742 288 760 236 766 138Z" fill={`url(#${id}s)`} />
        </g>
      </g>
    </svg>
  );
}
