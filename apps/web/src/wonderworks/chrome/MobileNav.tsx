"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, MoreHorizontal, Plus, Users } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { cn } from "@/lib/cn";
import { NETWORK_HREF, isActivePath } from "./nav";
import { Modal } from "@/components/common/Modal";
import { getClientMode } from "@/lib/mode";
import { useHydration } from "@/store/hydration";

// The post sheet loads only when the + is pressed.
const PostSheet = dynamic(() => import("@/components/network/PostSheet").then((m) => m.PostSheet), { ssr: false });
const NewMessageSheet = dynamic(() => import("@/components/network/NewMessageSheet").then((m) => m.NewMessageSheet), { ssr: false });
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
  // The + (owner, 2026-11-21: "use the + icon to create new post"): a post to the member's network from any module,
  // about the listing on screen if there is one. Where the module also has its own new entry (owner, 2026-11-02: post a
  // job, host an event…), the + asks which. On Network's own pages it opens the post straight away.
  const slots = useChromeSlots();
  const selected = useSelectedModule();
  const entry = slots.postFor?.(selected) ?? null;
  const onNetwork = pathname === NETWORK_HREF || pathname.startsWith(`${NETWORK_HREF}/`);
  const moduleEntry = entry && !onNetwork && pathname !== entry.href.split("?")[0] ? entry : null;
  // On Messages, the + also offers a new message to a connection (owner, 2026-11-21).
  const onMessages = pathname === `${NETWORK_HREF}/messages`;
  const choose = !!moduleEntry || onMessages;
  const [create, setCreate] = useState<"choose" | "post" | "message" | null>(null);
  const signedIn = useHydration((h) => h.hydrated) && getClientMode().mode === "user";
  return (
    <>
      {!barShown && signedIn && (
        <button
          type="button"
          aria-label={choose ? "Create" : "New post"}
          title={choose ? "Create" : "New post"}
          onClick={() => setCreate(choose ? "choose" : "post")}
          className="wj-gradient-bg fixed bottom-[calc(var(--wj-mobile-nav-h)+5.25rem)] right-5 z-40 grid size-12 place-items-center rounded-full text-white shadow-lg active:scale-95 md:hidden"
        >
          <Plus className="size-6" aria-hidden />
        </button>
      )}
      {create === "choose" && choose && (
        <Modal open onClose={() => setCreate(null)} title="Create" size="sm">
          <div className="flex flex-col gap-2 pb-1">
            {onMessages && (
              <button type="button" onClick={() => setCreate("message")} className="flex min-h-14 items-center gap-3 rounded-[14px] border border-line bg-surface px-4 text-left hover:bg-bg-soft">
                <MessageSquarePlus className="size-5 shrink-0 text-brand-600" aria-hidden />
                <span>
                  <span className="block text-[14.5px] font-semibold text-ink">New message</span>
                  <span className="block text-[12px] text-ink-3">To one of your connections</span>
                </span>
              </button>
            )}
            <button type="button" onClick={() => setCreate("post")} className="flex min-h-14 items-center gap-3 rounded-[14px] border border-line bg-surface px-4 text-left hover:bg-bg-soft">
              <Users className="size-5 shrink-0 text-brand-600" aria-hidden />
              <span>
                <span className="block text-[14.5px] font-semibold text-ink">Post to your network</span>
                <span className="block text-[12px] text-ink-3">Your connections, or everyone on the network</span>
              </span>
            </button>
            {moduleEntry && (
              <Link href={moduleEntry.href} onClick={() => setCreate(null)} className="flex min-h-14 items-center gap-3 rounded-[14px] border border-line bg-surface px-4 text-left hover:bg-bg-soft">
                <Plus className="size-5 shrink-0 text-brand-600" aria-hidden />
                <span className="block text-[14.5px] font-semibold text-ink">{moduleEntry.label}</span>
              </Link>
            )}
          </div>
        </Modal>
      )}
      {create === "post" && <PostSheet onClose={() => setCreate(null)} />}
      {create === "message" && <NewMessageSheet onClose={() => setCreate(null)} />}
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
      {/* The bottom bar (owner, 2026-11-22: "make the bottom bar little more modern. make network tab round and little
          more different looking to attract attention. and keep continuity between 4 older tabs"): the four places share
          one look, a soft pill behind the current one's icon; Network, in the middle, is a raised round button in the
          brand gradient. */}
      <nav aria-label="Primary" data-bottom-bar style={{ transform: "translateY(var(--wj-bottom-hidden, 0px))" }} className="fixed inset-x-0 bottom-0 z-40 rounded-t-[22px] border-t border-line/70 bg-surface/95 shadow-[0_-6px_24px_-12px_rgba(40,20,90,0.18)] backdrop-blur-xl transition-transform duration-300 ease-out motion-reduce:transition-none md:hidden wj-safe-bottom">
        <ul className="grid grid-flow-col auto-cols-fr items-end px-1.5">
          {nav.map((item) => {
            const active = isActivePath(pathname, item);
            const Icon = item.icon;
            if (item.href === NETWORK_HREF)
              return (
                <li key={item.href} className="flex min-w-0 justify-center">
                  <Link href={item.href} aria-current={active ? "page" : undefined} className="group flex h-16 flex-col items-center justify-end gap-1 pb-1.5 text-[11px] leading-none">
                    <span aria-hidden className={cn("wj-gradient-bg -mt-7 grid size-14 place-items-center rounded-full text-white ring-4 ring-surface transition-transform duration-200 group-active:scale-95", active ? "shadow-[0_8px_22px_-6px_rgba(99,59,255,0.75)]" : "shadow-[0_6px_16px_-6px_rgba(99,59,255,0.55)]")}>
                      <Icon className="size-6" strokeWidth={2.2} />
                    </span>
                    <span className={cn("max-w-full truncate", active ? "font-semibold text-brand-700" : "font-semibold text-brand-600")}>{item.label}</span>
                  </Link>
                </li>
              );
            return (
              <li key={item.href} className="min-w-0">
                <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex h-16 flex-col items-center justify-center gap-1 px-0.5 text-[11px] leading-none tracking-[0.01em] transition-colors duration-200", active ? "font-semibold text-brand-700" : "font-medium text-ink-3")}>
                  <span aria-hidden className={cn("grid h-8 w-14 place-items-center rounded-full transition-colors duration-200", active ? "bg-brand-100" : "bg-transparent")}>
                    <Icon className="size-[21px]" strokeWidth={active ? 2.3 : 1.8} />
                  </span>
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
