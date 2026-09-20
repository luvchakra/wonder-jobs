"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/cn";
import { useUIStore } from "@/store/ui";
import { MOBILE_NAV, isActivePath } from "./nav";

export function MobileNav() {
  const pathname = usePathname();
  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);
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
        <li>
          {/* Everything not already in this bar — Calendar, Career DNA, Insights, Automation, Resources —
              lives one tap away here, in the same drawer the TopBar's hamburger opens (MobileSidebarDrawer). */}
          <button
            type="button"
            aria-expanded={mobileNavOpen}
            aria-label="More"
            onClick={() => setMobileNavOpen(true)}
            className={cn("flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium", mobileNavOpen ? "text-brand-600" : "text-ink-3")}
          >
            <span className={cn("flex h-7 w-11 items-center justify-center rounded-full transition-colors", mobileNavOpen && "bg-brand-50")}>
              <Menu className="size-5" aria-hidden />
            </span>
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
