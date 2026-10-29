"use client";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { cn } from "@/lib/cn";
import { isActivePath } from "./nav";
import { useModuleNav } from "./useModuleNav";

/** The bottom bar: the four places, nothing else. Each place's own pages are tabs at its top (or rows
 * on You); help, account and sign-out are in the account menu — the top-bar avatar, or the round button above the bar. */
/** A screen showing its own action bar at the bottom: the floating menu button hides meanwhile, so it never covers it. */
export function useBottomBar(active = true) {
  const add = useUIStore((s) => s.addBottomBar);
  useEffect(() => {
    if (!active) return;
    add(1);
    return () => add(-1);
  }, [active, add]);
}

export function MobileNav() {
  const pathname = usePathname();
  const menu = useUIStore((s) => s.menu);
  const setMenu = useUIStore((s) => s.setMenu);
  const barShown = useUIStore((s) => s.bottomBars > 0);
  // Jobs' four places, or the active WonderWorks module's.
  const nav = useModuleNav();
  return (
    <>
      {/* The account menu (help, account, sign out) within thumb's reach, above the bar. */}
      {!barShown && (
        <button
          type="button"
          data-menu-trigger
          aria-label="Menu"
          aria-expanded={menu !== null}
          onClick={() => setMenu(menu ? null : "fab")}
          className="fixed bottom-[calc(var(--wj-mobile-nav-h)+1rem)] right-4 z-40 grid size-14 place-items-center rounded-full border border-line bg-surface text-ink shadow-lg active:scale-95 md:hidden"
        >
          <MoreHorizontal className="size-6" aria-hidden />
        </button>
      )}
      <nav aria-label="Primary" data-bottom-bar style={{ transform: "translateY(var(--wj-bottom-hidden, 0px))" }} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur transition-transform duration-300 ease-out motion-reduce:transition-none md:hidden wj-safe-bottom">
        <ul className="grid grid-flow-col auto-cols-fr">
          {nav.map((item) => {
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
    </>
  );
}
