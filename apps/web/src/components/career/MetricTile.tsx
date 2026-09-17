"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAnimatedNumber } from "@/lib/motion";

export function MetricTile({ icon: Icon, value, label, href, tone = "brand", className }: { icon: LucideIcon; value: number; label: string; href?: string; tone?: "brand" | "blue" | "pink" | "success"; className?: string }) {
  const display = useAnimatedNumber(value);
  const tones = { brand: "bg-brand-50 text-brand-600", blue: "bg-blue-100 text-blue-600", pink: "bg-[#fbe8ff] text-pink-500", success: "bg-success-100 text-success-600" };
  const inner = (
    <>
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-[14px]", tones[tone])}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[22px] font-semibold leading-none tracking-tight text-ink">{display}</span>
        <span className="mt-1 flex items-center gap-1 text-[13px] text-ink-3">
          {label} {href && <ChevronRight className="size-3.5" aria-hidden />}
        </span>
      </span>
    </>
  );
  const cls = cn("flex items-center gap-3 px-4 py-4 md:px-5", href && "rounded-[16px] transition-colors hover:bg-bg-soft", className);
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
