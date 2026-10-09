"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/platform/billing/plans", label: "Plans & features" },
  { href: "/platform/billing/prices", label: "Prices" },
  { href: "/platform/billing/discounts", label: "Discounts" },
  { href: "/platform/billing/api", label: "JobsLake API" },
  { href: "/platform/billing/history", label: "History" },
] as const;

export function BillingNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Billing sections" className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
      {TABS.map(({ href, label }) => {
        const on = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[12px]", on ? "bg-ink font-medium text-white" : "bg-bg-soft text-ink-2")}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
