import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-pink-500 font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/** Company tile: initial on the company's brand color (no third-party logo assets). */
export function CompanyLogo({ name, color, size = 40, className }: { name: string; color?: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[12px] border border-line bg-surface font-bold", className)}
      style={{ width: size, height: size, color: color ?? "var(--wj-brand-600)", fontSize: Math.max(12, size * 0.42) }}
      aria-hidden="true"
    >
      {name.trim()[0]?.toUpperCase()}
    </span>
  );
}
