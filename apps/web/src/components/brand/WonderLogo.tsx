import Link from "next/link";
import { cn } from "@/lib/cn";

/** WonderJobs wordmark: a two-tone "W" mark drawn in SVG + the name. */
export function WonderMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="wj-mark-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d4cf5" />
          <stop offset="1" stopColor="#a66bff" />
        </linearGradient>
        <linearGradient id="wj-mark-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b7bff" />
          <stop offset="1" stopColor="#6d4cf5" />
        </linearGradient>
      </defs>
      <path d="M4 7.5c0-1.2 1.5-1.8 2.4-.9L16 16l-5.7 8.4c-.6.9-2 .7-2.3-.4L4 7.5z" fill="url(#wj-mark-b)" />
      <path d="M28 7.5c0-1.2-1.5-1.8-2.4-.9L16 16l5.7 8.4c.6.9 2 .7 2.3-.4L28 7.5z" fill="url(#wj-mark-a)" />
      <path d="M16 16l-3.2 9.6c-.3.9.9 1.6 1.5.9L16 24.4l1.7 2.1c.6.7 1.8 0 1.5-.9L16 16z" fill="#c26ef5" opacity=".9" />
    </svg>
  );
}

export function WonderLogo({ href = "/", className, compact = false, size = 28 }: { href?: string; className?: string; compact?: boolean; size?: number }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-semibold tracking-tight text-ink", className)} aria-label="WonderJobs home">
      <WonderMark size={size} />
      {!compact && <span className="text-[17px]">WonderJobs</span>}
    </Link>
  );
}
