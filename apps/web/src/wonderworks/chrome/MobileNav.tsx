"use client";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { MoreHorizontal, Plus } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { cn } from "@/lib/cn";
import { isActivePath } from "./nav";
import { useModuleNav, useSelectedModule } from "./useModuleNav";
import { useChromeSlots } from "./slots";

/** The bottom bar: the five places, nothing else. Each place's own pages are tabs at its top (or rows
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
  // Jobs' five places, or the active WonderWorks module's.
  const nav = useModuleNav();
  // The selected module's "post a new entry" page (owner, 2026-11-02): a + just above the menu button. Not on that page itself.
  const slots = useChromeSlots();
  const selected = useSelectedModule();
  const post = slots.postFor?.(selected) ?? null;
  const showPost = !barShown && post && pathname !== post.href.split("?")[0];
  return (
    <>
      {showPost && (
        <Link
          href={post.href}
          aria-label={post.label}
          title={post.label}
          className="wj-gradient-bg fixed bottom-[calc(var(--wj-mobile-nav-h)+5.25rem)] right-5 z-40 grid size-12 place-items-center rounded-full text-white shadow-lg active:scale-95 md:hidden"
        >
          <Plus className="size-6" aria-hidden />
        </Link>
      )}
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
      {/* The bottom bar (owner, 2026-11-20: five places, Network in the middle, a professional look): a solid bar, the
          current place marked by a line on top and its colour, and no pill behind the icon. */}
      <nav aria-label="Primary" data-bottom-bar style={{ transform: "translateY(var(--wj-bottom-hidden, 0px))" }} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-xl transition-transform duration-300 ease-out motion-reduce:transition-none md:hidden wj-safe-bottom">
        <ul className="grid grid-flow-col auto-cols-fr">
          {nav.map((item) => {
            const active = isActivePath(pathname, item);
            const Icon = item.icon;
            return (
              <li key={item.href} className="min-w-0">
                <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("relative flex h-16 flex-col items-center justify-center gap-1 px-0.5 text-[11px] leading-none tracking-[0.01em] transition-colors duration-200", active ? "font-semibold text-brand-600" : "font-medium text-ink-3")}>
                  <span aria-hidden className={cn("absolute inset-x-4 top-0 h-[3px] rounded-b-full transition-colors duration-200", active ? "bg-brand-600" : "bg-transparent")} />
                  <Icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.8} aria-hidden />
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
