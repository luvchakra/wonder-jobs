import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * The Wonder mark as a "dressing for the interview" loop, shown while a search runs: the two wings
 * settle like a shirt collar, a knot appears where they meet, and the middle piece drops in and swings
 * like a tie, then it all resets. Pure SVG + CSS (`wj-collar-*` in globals.css); with reduced motion
 * it's the still mark. Decorative — the text beside it says what's happening.
 */
export function WonderSearching({ size = 64, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 10 540 480" width={(size * 540) / 480} height={size} aria-hidden className={cn("shrink-0 overflow-visible", className)}>
      <defs>
        <linearGradient id={`${id}l`} x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stopColor="#4a2ae0" /><stop offset="1" stopColor="#5d3ef2" /></linearGradient>
        <linearGradient id={`${id}r`} x1="1" y1="0" x2="0.3" y2="1"><stop offset="0" stopColor="#b47ef6" /><stop offset="1" stopColor="#6440ee" /></linearGradient>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5f6ff4" /><stop offset="1" stopColor="#aaa0f6" /></linearGradient>
      </defs>
      <path className="wj-collar-left" d="M277.0 217.0 L37.6 50.5 Q8.0 30.0 17.5 64.7 L104.1 380.9 Q111.0 406.0 128.2 386.5 Z" fill={`url(#${id}l)`} />
      <path className="wj-collar-right" d="M283.0 217.0 L501.3 51.7 Q530.0 30.0 521.4 64.9 L443.2 380.8 Q437.0 406.0 420.6 385.8 Z" fill={`url(#${id}r)`} />
      <path className="wj-collar-tie" d="M277.8 241.6 Q280.0 236.0 282.2 241.6 L367.9 457.6 Q376.0 478.0 357.5 466.1 L283.4 418.2 Q280.0 416.0 276.6 418.2 L202.5 466.1 Q184.0 478.0 192.1 457.6 Z" fill={`url(#${id}t)`} />
      <path className="wj-collar-knot" d="M246 196 Q280 184 314 196 L297 264 Q280 273 263 264 Z" fill="#4a2ae0" />
    </svg>
  );
}
