"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell, Bot, ChartNoAxesColumn, Database, Download, KeyRound, LifeBuoy, LogOut, Puzzle, Sparkles, User } from "lucide-react";
import { EXTENSION_STORE_URL } from "@/content/extensionRelease";
import { useExtensionInstalled } from "@/lib/useExtensionInstalled";
import { cn } from "@/lib/cn";
import { FlipAvatar } from "./FlipAvatar";
import { useCareerStore } from "@/store/career";
import { useUIStore } from "@/store/ui";
import { useHydration } from "@/store/hydration";
import { useAuthStore } from "@/store/auth";
import { signOutEverywhere } from "@/lib/auth/browser";
import { flushRemote } from "@/store/remoteStorage";
import { useInstallPrompt } from "@/lib/pwa";
import { toast } from "@/components/feedback/Toast";
import dynamic from "next/dynamic";
// Ask Wonder's palette (and the intent parser behind it) loads the first time it's opened, not with every page.
const CommandPalette = dynamic(() => import("./CommandPalette").then((m) => m.CommandPalette), { ssr: false });
import { useSelectedModule } from "./useModuleNav";
import { useChromeSlots } from "./slots";
import { useNetworkMode } from "./networkMode";
import { NETWORK_HREF } from "./nav";
import { NetworkMark } from "@/wonderworks/brand/NetworkMark";
import { LeaveNetwork } from "./LeaveNetwork";
import { CreateButton } from "./CreateButton";
import { NotificationBell } from "./NotificationBell";
import { MessagesLink, NetworkBar } from "@/components/network/NetworkBell";
import { useMediaQuery } from "@/lib/motion";
import { arrangeMenu } from "@/domain/navigation/menus";
import { useMenu } from "@/lib/menus";
import { usePathname } from "next/navigation";
import { useUi } from "@/lib/ui";
import { isActivePath } from "./nav";
import { useModuleNav } from "./useModuleNav";

function useOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      // The phone's floating menu button and the sidebar's menu (both portalled over the page) handle their own clicks.
      if ((e.target as Element | null)?.closest?.("[data-menu-trigger]")) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, onOut]);
}

/**
 * The account controls: the avatar (the account menu) and, on phones and tablets, the bell (NotificationBell), plus ⌘K. Phones and tablets: a
 * bar across the top, with the module menu. From 1024px there is no top bar (owner, 2026-11-06: "remove the concept of
 * top navbar completely, bring the avatar and notifications in sidebar bottom left"): the sidebar lists the modules,
 * its foot holds the avatar and the name (`place="side"`), and the bell sits beside the logo at its top. Only one of the two renders at a time.
 */
export function TopBar({ place = "top" }: { place?: "top" | "side" }) {
  const wide = useMediaQuery("(min-width: 1024px)");
  const cmd = useUIStore((s) => s.commandOpen);
  const setCmd = useUIStore((s) => s.setCommandOpen);
  const slots = useChromeSlots();
  const onNetwork = useNetworkMode();
  const dna = useCareerStore((s) => s.dna);
  const menu = useUIStore((s) => s.menu);
  const setMenu = useUIStore((s) => s.setMenu);
  const profileOpen = menu !== null;
  const setProfileOpen = (v: boolean | ((open: boolean) => boolean)) => setMenu((typeof v === "function" ? v(profileOpen) : v) ? "top" : null);
  const hydrated = useHydration((s) => s.hydrated);
  const mode = useAuthStore((s) => s.mode);
  const userId = useAuthStore((s) => s.userId);
  const email = useAuthStore((s) => s.email);
  const displayName = dna.name || email?.split("@")[0] || "You";
  const selected = useSelectedModule();
  // The bell's Needs attention count and the career status come from the modules (WonderJobs: its applications), through the chrome's slots.
  const { careerStatus } = slots.useStatus(hydrated, selected);
  const { available: canInstall, promptInstall } = useInstallPrompt();
  const profileRef = useRef<HTMLDivElement>(null);
  useOutside(profileRef, () => setProfileOpen(false));

  // The second UI's header (domain/platform/ui.ts): the place's name as the title, the module as its context line.
  const second = useUi() === 2;
  const pathname = usePathname();
  const place2 = useModuleNav().find((item) => isActivePath(pathname, item));

  const menuConfig = useMenu("account");
  // Platform admins get an Admin link (the WorksLake portal); everyone else never sees it.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (mode !== "user") return;
    let alive = true;
    fetch("/api/admin/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { admin?: boolean } | null) => alive && setIsAdmin(!!d?.admin))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mode, userId]);

  useEffect(() => {
    // The app mounts this twice (the top bar, and the sidebar's foot): only one listens, or each press would open
    // Ask Wonder and close it again.
    if (place !== "top") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmd(!useUIStore.getState().commandOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCmd, place]);

  // One menu, opened from the avatar or the phone's floating button (then on the page itself, by the button).
  const accountMenu = (
    <div role="menu" className={cn("w-60 rounded-[16px] border border-line bg-surface p-1.5 shadow-lg wj-animate-fade-up", menu === "fab" ? "fixed bottom-[calc(var(--wj-mobile-nav-h)+4rem)] right-4 z-50" : place === "side" ? "fixed bottom-20 left-4 z-50" : second ? "absolute right-0 top-12" : "absolute left-0 top-12 md:left-auto md:right-0")}>
      {/* Who's signed in, and their career status (from their applications). */}
      <div className="px-3 pb-2 pt-1.5">
        <p className="truncate text-[13px] font-semibold leading-tight text-ink">{displayName}</p>
        <p className="truncate text-[11px] leading-tight text-ink-3">{careerStatus}</p>
        {mode === "user" && email && <p className="mt-0.5 truncate text-[11px] text-ink-3">{email}</p>}
      </div>
      {[
        ...arrangeMenu(
          [
            // The account holder's own things; what Wonder works from is under You, the week's activity under Pipeline.
            { id: "account", href: "/app/profile", label: "Account", icon: User },
            // One tap from anywhere (signed-in accounts only); Plan & billing and Your data are on Account itself.
            ...(mode === "user"
              ? ([
                  { id: "api_keys", href: "/app/profile#jobslake-api", label: "API keys", icon: KeyRound },
                  { id: "notifications", href: "/app/settings/notifications", label: "Notifications", icon: Bell },
                ] as const)
              : []),
            // Which AI writes Wonder's drafts (WonderJobs AI or the candidate's own key).
            { id: "ai_provider", href: "/app/settings/ai", label: "AI provider", icon: Sparkles },
            // How much Wonder does on its own: the level, a rule per action, schedules.
            { id: "automation", href: "/app/automation/settings", label: "Automation", icon: Bot },
            // The sidebar's Analytics, for phones (no sidebar there).
            { id: "analytics", href: "/app/analytics", label: "Analytics", icon: ChartNoAxesColumn },
            // The WonderWorks helper (owner, 2026-11-28: "for the extension, create quick link to install in menu").
            { id: "helper", href: "/extension", label: "Install browser helper", icon: Puzzle },
            { id: "help", href: "/help", label: "Get Help", icon: LifeBuoy },
          ],
          // The order and hidden items a platform admin set for everyone (Admin → Settings → App menus).
          menuConfig,
        ),
        // Platform admins only, after the rest; never hidden from them.
        ...(isAdmin ? [{ id: "admin", href: "/platform/jobs-lake", label: "Admin", icon: Database }] : []),
      ].map((m) =>
        m.id === "helper" ? (
          <HelperLink key={m.id} onPick={() => setProfileOpen(false)} />
        ) : (
          <Link key={m.href} role="menuitem" href={m.href} onClick={() => setProfileOpen(false)} className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-ink-2 hover:bg-bg-soft hover:text-ink">
            <m.icon className="size-4" aria-hidden /> {m.label}
          </Link>
        ),
      )}
      {canInstall && (
        <button
          type="button"
          role="menuitem"
          onClick={async () => {
            setProfileOpen(false);
            const outcome = await promptInstall();
            if (outcome === "accepted") toast.success("Installing WonderWorks", "Find it on your home screen or app launcher.");
          }}
          className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm text-ink-2 hover:bg-bg-soft hover:text-ink"
        >
          <Download className="size-4" aria-hidden /> Install app
        </button>
      )}
      <div className="my-1 border-t border-line" />
      <button
        type="button"
        role="menuitem"
        onClick={async () => {
          setProfileOpen(false);
          // Send any still-debounced write (e.g. just-completed onboarding) while the session
          // is still valid — signOutEverywhere wipes this account's local copy immediately
          // after, so anything not yet on the server by then never arrives.
          await flushRemote(false);
          await signOutEverywhere(userId);
          // Full reload on purpose: drops every in-memory store before another account can sign in.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/";
        }}
        className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm text-ink-2 hover:bg-bg-soft hover:text-ink"
      >
        <LogOut className="size-4" aria-hidden /> Sign out
      </button>
    </div>
  );

  // Pinned to the sidebar's bottom left (owner, 2026-11-06: "fix the avatar to bottom left, so rest of menus can go
  // behind it and scroll"): the sidebar's lists scroll under it.
  if (place === "side") {
    if (!wide) return null;
    return (
      <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex shrink-0 items-center gap-1 border-t border-line bg-surface px-4 py-2" ref={profileRef}>
        <button type="button" aria-expanded={profileOpen} aria-label="Profile menu" onClick={() => setProfileOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[12px] p-1.5 text-left hover:bg-bg-soft">
          <FlipAvatar name={displayName} />
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold leading-tight text-ink">{displayName}</span>
            <span className="block truncate text-[11.5px] leading-tight text-ink-3">{careerStatus}</span>
          </span>
        </button>
        {/* Over the page, not inside the sidebar (whose scroll would clip it); data-menu-trigger keeps clicks in it from closing it first. */}
        {profileOpen && createPortal(<div data-menu-trigger>{accountMenu}</div>, document.body)}
        {cmd && <CommandPalette open onClose={() => setCmd(false)} />}
      </div>
    );
  }
  if (wide) return null;
  // The second UI (owner's mock, 2026-11-28: "use this for top portion"): the place's name large on the left with the
  // bar's icons, plain, on its right and the avatar in a thin ring; under them the module (the same module menu) in
  // bold with its one-line description. Network's pages have the first row only.
  if (second) {
    return (
      <header data-top-bar style={{ transform: "translateY(calc(var(--wj-top-hidden, 0px) * -1))" }} className={cn("sticky top-0 z-30 border-b border-line bg-surface/90 px-4 pt-2 backdrop-blur transition-transform duration-200 ease-out motion-reduce:transition-none md:px-6 lg:hidden", onNetwork ? "h-[3.75rem]" : "h-[var(--wj-top-h)]")}>
       <div className="flex h-11 items-center gap-0.5">
        <div className="min-w-0 flex-1">
          {onNetwork ? (
            <h1 className="wj-top-title wj-top-title-long truncate text-ink">
              <Link href={NETWORK_HREF} className="rounded-md hover:text-brand-700">
                My network
              </Link>
            </h1>
          ) : (
            // The page keeps its own <h1>; this names the place it belongs to.
            // A long name ("Applications", "Connections") is set smaller, so it fits beside the icons on a phone.
            <p className={cn("wj-top-title truncate text-ink", (place2?.label ?? "WonderWorks").length > 9 && "wj-top-title-long")}>{place2?.label ?? "WonderWorks"}</p>
          )}
        </div>
        {/* The + (CreateButton), then Network. Wrapped: both network buttons carry the first UI's own flex order. */}
        <CreateButton />
        <div className="flex shrink-0">{onNetwork ? <LeaveNetwork /> : <OpenNetwork second />}</div>
        {onNetwork ? (
          <NetworkBar />
        ) : (
          <div className="wj-top-icons flex items-center gap-0.5">
            <MessagesLink />
            <NotificationBell />
          </div>
        )}
        <div className="relative ml-1.5" ref={profileRef}>
          {/* The avatar in a thin ring of its own, set off from the bar; an accent ring while its menu is open. */}
          <button type="button" aria-expanded={profileOpen} aria-label="Profile menu" onClick={() => setProfileOpen((v) => !v)} className="wj-top-avatar grid size-10 place-items-center rounded-full">
            <FlipAvatar name={displayName} />
          </button>
          {profileOpen && (menu === "fab" ? createPortal(<div data-menu-trigger>{accountMenu}</div>, document.body) : accountMenu)}
        </div>
       </div>
        {/* The module and its line. */}
        {!onNetwork && hydrated && slots.FindMenu && <slots.FindMenu />}
        {cmd && <CommandPalette open onClose={() => setCmd(false)} />}
      </header>
    );
  }
  return (
    <header data-top-bar style={{ transform: "translateY(calc(var(--wj-top-hidden, 0px) * -1))" }} className="wj-ui1 sticky top-0 z-30 flex h-16 lg:hidden items-center gap-1 border-b md:gap-3 border-line bg-surface/85 px-3 md:px-6 backdrop-blur transition-transform duration-300 ease-out motion-reduce:transition-none">
      {/* Phones (owner, 2026-10-29): the avatar on the left (it turns over to the WonderWorks mark now and then; there's no
          separate logo), the kind menu in the centre, the bell on the right. Tablet and desktop (owner, 2026-11-06: "design
          the tablet and desktop ui"): the sidebar already carries the logo, so the kind menu starts at the content's left
          edge and the bell and avatar sit together on the right, as desktop apps do. */}
      {/* From 1024px the sidebar lists the modules, so the menu leaves the top bar (its space stays, keeping the bell and
          avatar on the right). */}
      {/* Network is the same page in every module, so there the bar names it and the module menu steps aside (owner,
          2026-11-21: "move my network to top navbar"). */}
      <div className="order-[-1] flex min-w-0 flex-1 justify-center md:justify-start lg:hidden">
        {onNetwork ? (
          <h1 className="min-w-0 truncate text-[18px] font-bold text-ink">
            <Link href={NETWORK_HREF} className="rounded-md hover:text-brand-700">
              My network
            </Link>
          </h1>
        ) : hydrated && slots.FindMenu && <slots.FindMenu />}
      </div>

      {/* The bell opens Notifications, a page with two tabs: what happened, and what needs you (Needs attention, counted
          on the badge). Ask Wonder is under You, and ⌘K on a computer. */}
      {/* On My network the bar carries the network's own icons (owner, 2026-11-22): Messages, then a bell for invitations. */}
      {onNetwork ? (
        <NetworkBar />
      ) : (
        <div className="flex items-center gap-0.5">
          <MessagesLink />
          <NotificationBell />
        </div>
      )}

      <div className="relative order-[-3] md:order-none" ref={profileRef}>
        <button type="button" aria-expanded={profileOpen} aria-label="Profile menu" onClick={() => setProfileOpen((v) => !v)} className="flex items-center rounded-full p-1 hover:bg-bg-soft">
          <FlipAvatar name={displayName} />
        </button>
        {profileOpen && (menu === "fab" ? createPortal(<div data-menu-trigger>{accountMenu}</div>, document.body) : accountMenu)}
      </div>
      {/* Network mode's way out (owner, 2026-11-22): right of the avatar, the module the member came from, back to the
          page they left. */}
      {/* Outside network mode the same spot opens it (owner, 2026-11-22: "add network icon on the right of avatar icon
          when not in network mode"). */}
      {onNetwork ? <LeaveNetwork /> : <OpenNetwork />}
      {cmd && <CommandPalette open onClose={() => setCmd(false)} />}
    </header>
  );
}


/**
 * The account menu's link to the WonderWorks helper (the browser extension that fills employers' forms on a computer).
 * Not installed in this browser: "Install browser helper", straight to its Chrome Web Store listing once it has one,
 * else to /extension (the download and its steps). Installed: it says so, and opens /extension (its version and
 * updates). It asks the helper only while the menu is open.
 */
function HelperLink({ onPick }: { onPick: () => void }) {
  const installed = useExtensionInstalled(800);
  const row = "flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-ink-2 hover:bg-bg-soft hover:text-ink";
  if (installed !== true && EXTENSION_STORE_URL)
    return (
      <a role="menuitem" href={EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer" onClick={onPick} className={row}>
        <Puzzle className="size-4" aria-hidden /> Install browser helper
      </a>
    );
  return (
    <Link role="menuitem" href="/extension" onClick={onPick} className={row}>
      <Puzzle className="size-4" aria-hidden />
      {installed === true ? (
        <>
          Browser helper <span className="ml-auto text-[11px] font-medium text-success-600">Installed</span>
        </>
      ) : (
        "Install browser helper"
      )}
    </Link>
  );
}

/** Opens network mode from the top bar, right of the avatar. Phones only; from 768px the sidebar lists Network. */
function OpenNetwork({ second = false }: { /** The second UI: one of the bar's round grey buttons, the mark in the accent. */ second?: boolean }) {
  if (second)
    return (
      <Link href={NETWORK_HREF} aria-label="Open my network" title="My network" className="wj-top-icon grid size-10 shrink-0 place-items-center rounded-full md:hidden">
        <NetworkMark className="size-6 text-brand-600" />
      </Link>
    );
  return (
    <Link href={NETWORK_HREF} aria-label="Open my network" title="My network" className="order-[-2] grid size-10 shrink-0 place-items-center rounded-full hover:bg-bg-soft md:hidden">
      <span aria-hidden className="grid size-8 place-items-center rounded-full border border-line bg-surface text-brand-600 shadow-sm">
        <NetworkMark className="size-[22px]" />
      </span>
    </Link>
  );
}
