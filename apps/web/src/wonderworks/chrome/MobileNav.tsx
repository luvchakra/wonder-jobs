"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { ChevronUp, MessageSquarePlus, MoreHorizontal, Plus, Undo2, Users } from "lucide-react";
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
import { useNetworkMode } from "./networkMode";
import { useLeaveNetwork } from "./LeaveNetwork";
import { NetworkMark } from "@/wonderworks/brand/NetworkMark";
import { useUi } from "@/lib/ui";

/** The bottom bar: the module's four places, nothing else. Each place's own pages are tabs at its top (or rows
 * on You); help, account and sign-out are in the account menu (the top-bar avatar, or ⋯ in the quick actions). Above the
 * bar, at the bottom right, one round up-arrow button opens the quick actions (owner, 2026-11-22: "by default just show
 * one up arrow kind of icon, on click open up these icons in animated way, also wrap up the icons again if not used"):
 * the +, Network (it opens network mode, where the bar steps away and the way back takes its place) and ⋯. */
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
  // Network has its own round button, so the bar holds the other four.
  const places = nav.filter((item) => item.href !== NETWORK_HREF);
  // The + (owner, 2026-11-21: "use the + icon to create new post"): a post to the member's network from any module,
  // about the listing on screen if there is one. Where the module also has its own new entry (owner, 2026-11-02: post a
  // job, host an event…), the + asks which. On Network's own pages it opens the post straight away.
  const slots = useChromeSlots();
  const selected = useSelectedModule();
  const entry = slots.postFor?.(selected) ?? null;
  const onNetwork = useNetworkMode();
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
  const away = useLeaveNetwork();
  // The second UI's bar floats: a pill off the screen's edge (domain/platform/ui.ts). Same places, same links.
  const floating = useUi() === 2;
  // The quick actions are open on the page they were opened on; going to another page folds them away.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const fold = () => setOpenOn(null);
  const dial = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Left alone for a few seconds, or tapped away from, they fold away again.
    const idle = setTimeout(() => setOpenOn(null), 6000);
    const outside = (e: PointerEvent) => {
      if (!dial.current?.contains(e.target as Node)) setOpenOn(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenOn(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      clearTimeout(idle);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const round = "grid size-12 shrink-0 place-items-center rounded-full shadow-lg active:scale-95";
  const actions: { key: string; label: string; node: React.ReactNode }[] = [
    ...(signedIn
      ? [
          {
            key: "create",
            label: choose ? "Create" : "New post",
            node: (
              <button
                type="button"
                aria-label={choose ? "Create" : "New post"}
                onClick={() => {
                  fold();
                  setCreate(choose ? "choose" : "post");
                }}
                className={cn("wj-gradient-bg text-white", round)}
              >
                <Plus className="size-6" aria-hidden />
              </button>
            ),
          },
        ]
      : []),
    onNetwork
      ? {
          key: "back",
          label: away.label,
          node: (
            <button type="button" aria-label={away.label} onClick={away.leave} className={cn("border border-line bg-surface text-ink", round)}>
              <Undo2 className="size-6" strokeWidth={2.2} aria-hidden />
            </button>
          ),
        }
      : {
          key: "network",
          label: NETWORK_TAB.label,
          node: (
            <Link href={NETWORK_HREF} aria-label={NETWORK_TAB.label} className={cn("border border-line bg-surface text-brand-600", round)}>
              <NetworkMark className="size-8" />
            </Link>
          ),
        },
    {
      key: "menu",
      label: "Menu",
      node: (
        <button
          type="button"
          data-menu-trigger
          aria-label="Menu"
          aria-expanded={menu !== null}
          onClick={() => {
            fold();
            setMenu(menu ? null : "fab");
          }}
          className={cn("border border-line bg-surface text-ink", round)}
        >
          <MoreHorizontal className="size-6" aria-hidden />
        </button>
      ),
    },
  ];
  return (
    <>
      {/* The quick actions: one small, plain round up arrow (owner, 2026-11-22: "should not have any colour to it, should
          be smaller"); pressed, the actions rise from it one after another, each with its name. */}
      {!barShown && (
        <div ref={dial} className="pointer-events-none fixed bottom-[calc(var(--wj-mobile-nav-h)+1rem)] right-4 z-40 flex flex-col items-end gap-3 md:hidden">
          <div inert={!open} aria-hidden={!open} className="flex flex-col items-end gap-3">
            {actions.map((a, i) => (
              <div
                key={a.key}
                style={{ transitionDelay: `${(open ? actions.length - 1 - i : i) * 45}ms` }}
                className={cn("flex items-center gap-2.5 transition-all duration-200 ease-out motion-reduce:transition-none", open ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-75 opacity-0")}
              >
                <span aria-hidden className="rounded-full bg-surface/95 px-2.5 py-1 text-[12.5px] font-semibold text-ink shadow-md ring-1 ring-line/70 backdrop-blur">
                  {a.label}
                </span>
                {a.node}
              </div>
            ))}
          </div>
          <button
            type="button"
            aria-label="Quick actions"
            aria-expanded={open}
            onClick={() => setOpenOn(open ? null : pathname)}
            className="pointer-events-auto mr-0.5 grid size-11 place-items-center rounded-full border border-line bg-surface/95 text-ink-2 shadow-md backdrop-blur transition-transform active:scale-95"
          >
            <ChevronUp className={cn("size-6 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} strokeWidth={2.4} aria-hidden />
          </button>
        </div>
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
      {/* The bottom bar (owner, 2026-11-22: "make the bottom bar little more modern"): the four places share one look, a
          soft pill behind the current one's icon. In network mode it isn't there at all. */}
      {!onNetwork && floating && (
        <nav aria-label="Primary" data-bottom-bar style={{ transform: "translateY(calc(var(--wj-bottom-hidden, 0px) * 2))", bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }} className="fixed inset-x-3 z-40 mx-auto max-w-md rounded-full border border-line/80 bg-surface/85 shadow-lg backdrop-blur-xl transition-transform duration-200 ease-out motion-reduce:transition-none md:hidden">
          <ul className="grid grid-flow-col auto-cols-fr items-center p-1.5">
            {places.map((item, i) => {
              const active = isActivePath(pathname, item);
              const Icon = item.icon;
              return (
                <li key={item.href} className="min-w-0">
                  <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("flex h-12 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[11px] leading-none transition-colors duration-150", active ? "bg-brand-50 font-semibold text-brand-700" : "font-medium text-ink-3")}>
                    {/* Active is the filled icon, not only a colour; a magnifier has nothing to fill, so Find's gets a heavier line. */}
                    <Icon aria-hidden className={cn("size-6", active && "text-brand-600")} strokeWidth={active && i === 0 ? 2.6 : 1.8} fill={active && i > 0 ? "currentColor" : "none"} />
                    <span className="max-w-full truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      {!onNetwork && !floating && (
        <nav aria-label="Primary" data-bottom-bar style={{ transform: "translateY(var(--wj-bottom-hidden, 0px))" }} className="wj-ui1 fixed inset-x-0 bottom-0 z-40 rounded-t-[22px] border-t border-line/70 bg-surface/95 shadow-[0_-6px_24px_-12px_rgba(40,20,90,0.18)] backdrop-blur-xl transition-transform duration-300 ease-out motion-reduce:transition-none md:hidden wj-safe-bottom">
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
