"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, Plus, Users } from "lucide-react";
import { useUIStore } from "@/store/ui";
import { cn } from "@/lib/cn";
import { NETWORK_HREF, NETWORK_TAB, isActivePath, rememberAppPath } from "./nav";
import { Modal } from "@/components/common/Modal";
import { getClientMode } from "@/lib/mode";
import { useHydration } from "@/store/hydration";

// The post sheet loads only when the + is pressed.
const PostSheet = dynamic(() => import("@/components/network/PostSheet").then((m) => m.PostSheet), { ssr: false });
const NewMessageSheet = dynamic(() => import("@/components/network/NewMessageSheet").then((m) => m.NewMessageSheet), { ssr: false });
import { useModuleNav, useSelectedModule } from "./useModuleNav";
import { useChromeSlots } from "./slots";

/** The bottom bar: the module's four places, nothing else. Each place's own pages are tabs at its top (or rows
 * on You); help, account and sign-out are in the account menu (the top-bar avatar). Network is the round button above
 * the bar, under the +; it opens network mode, where the bar steps away (owner, 2026-11-22). */
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
  const barShown = useUIStore((s) => s.bottomBars > 0);
  // Jobs' five places, or the active WonderWorks module's.
  const nav = useModuleNav();
  // Network has its own round button, so the bar holds the other four.
  const places = nav.filter((item) => item.href !== NETWORK_HREF);
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
  // Network mode (owner, 2026-11-22: "once the network icon is clicked, hide the bottom bar completely"): on Network's
  // pages the bar goes, and what sits above it (toasts, action bars) drops to the screen's foot. Elsewhere the page is
  // remembered, so the top bar's way back returns to it.
  useEffect(() => {
    const root = document.documentElement;
    if (onNetwork) root.dataset.networkMode = "";
    else rememberAppPath(`${pathname}${window.location.search}`);
    return () => {
      delete root.dataset.networkMode;
    };
  }, [onNetwork, pathname]);
  const NetworkIcon = NETWORK_TAB.icon;
  return (
    <>
      {!barShown && signedIn && (
        <button
          type="button"
          aria-label={choose ? "Create" : "New post"}
          title={choose ? "Create" : "New post"}
          onClick={() => setCreate(choose ? "choose" : "post")}
          className={cn("wj-gradient-bg fixed right-5 z-40 grid size-12 place-items-center rounded-full text-white shadow-lg active:scale-95 md:hidden", onNetwork ? "bottom-[calc(var(--wj-mobile-nav-h)+1.25rem)]" : "bottom-[calc(var(--wj-mobile-nav-h)+5.25rem)]")}
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
      {/* Network, right under the +: a raised round button in the brand gradient, set apart from the four places. */}
      {!barShown && !onNetwork && (
        <Link
          href={NETWORK_HREF}
          aria-label={NETWORK_TAB.label}
          title={NETWORK_TAB.label}
          className="wj-gradient-bg fixed bottom-[calc(var(--wj-mobile-nav-h)+1rem)] right-4 z-40 grid size-14 place-items-center rounded-full text-white shadow-[0_8px_22px_-6px_rgba(99,59,255,0.75)] ring-4 ring-surface active:scale-95 md:hidden"
        >
          <NetworkIcon className="size-6" strokeWidth={2.2} aria-hidden />
        </Link>
      )}
      {/* The bottom bar (owner, 2026-11-22: "make the bottom bar little more modern"): the four places share one look, a
          soft pill behind the current one's icon. In network mode it isn't there at all. */}
      {!onNetwork && (
        <nav aria-label="Primary" data-bottom-bar style={{ transform: "translateY(var(--wj-bottom-hidden, 0px))" }} className="fixed inset-x-0 bottom-0 z-40 rounded-t-[22px] border-t border-line/70 bg-surface/95 shadow-[0_-6px_24px_-12px_rgba(40,20,90,0.18)] backdrop-blur-xl transition-transform duration-300 ease-out motion-reduce:transition-none md:hidden wj-safe-bottom">
          <ul className="grid grid-flow-col auto-cols-fr items-end px-1.5">
            {places.map((item) => {
              const active = isActivePath(pathname, item);
              const Icon = item.icon;
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
      )}
    </>
  );
}
