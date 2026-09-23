"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { MOBILE_NAV, isActivePath } from "./nav";

/** The bottom bar shows the 5 real destinations directly — no "More" catch-all. Everything else
 * (Wonder's scheduling/automation controls, Career's Insights/Resume Studio/Interview Prep/Learning,
 * Help) is one tap away via TopBar's hamburger, which opens the same drawer this used to gate behind
 * a 6th tab. */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden wj-safe-bottom">
      <ul className="grid grid-cols-5">
        {MOBILE_NAV.map((item) => {
          const active = isActivePath(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-brand-600" : "text-ink-3")}>
                <span className={cn("flex h-7 w-11 items-center justify-center rounded-full transition-colors", active && "bg-brand-50")}>
                  <Icon className="size-5" aria-hidden />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
