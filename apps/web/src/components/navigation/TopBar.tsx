"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Bot, ChartNoAxesColumn, ChevronDown, ChevronRight, Database, Download, KeyRound, LifeBuoy, ListChecks, LogOut, Sparkles, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";
import { Avatar } from "@/components/common/Avatar";
import { WonderLogo } from "@/components/brand/WonderLogo";
import { useCareerStore } from "@/store/career";
import { useApplicationsStore } from "@/store/applications";
import { computeApplicationAttention } from "@/domain/career/attention";
import { actionsRequired } from "@/domain/digest/build";
import { useNow } from "@/lib/motion";
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
import { NOTIFICATION_ACTION, visibleNotifications } from "@/domain/career/notifications";
import { RunningIndicator } from "./RunningIndicator";
import { FindModeMenu } from "./FindModeMenu";
import { isLive, MODULES } from "@/modules/registry";
import { arrangeMenu } from "@/domain/navigation/menus";
import { useMenu } from "@/lib/menus";

function useOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      // The phone's floating menu button, and the menu it opens, handle their own clicks.
      if ((e.target as Element | null)?.closest?.("[data-menu-trigger]")) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, onOut]);
}

export function TopBar() {
  const cmd = useUIStore((s) => s.commandOpen);
  const setCmd = useUIStore((s) => s.setCommandOpen);
  const applications = useApplicationsStore((s) => s.applications);
  // How many things need the candidate (Tasks' badge) — the same list the Tasks page shows; the clock coarsened to the hour.
  const hour = Math.floor(useNow() / 3_600_000);
  const dna = useCareerStore((s) => s.dna);
  const learnedSignals = useCareerStore((s) => s.learnedSignals);
  const tasks = useMemo(
    () => computeApplicationAttention(applications, hour * 3_600_000).length + actionsRequired({ dna, learnedSignals: learnedSignals ?? [], applications: Object.values(applications) }).filter((a) => a.href !== "/app/applications").length,
    [applications, hour, dna, learnedSignals],
  );
  // Full Time / Part Time is a choice on Find only: its menu sits beside the avatar there.
  // Find's menu (Full Time, Part Time and the live WonderStar modules) shows on Jobs' Find and on each live module's.
  const path = usePathname();
  const onFind = path === "/app/jobs" || MODULES.some((m) => m.id !== "jobs" && isLive(m) && m.routes.find === path);
  const [notifOpen, setNotifOpen] = useState(false);
  const menu = useUIStore((s) => s.menu);
  const setMenu = useUIStore((s) => s.setMenu);
  const profileOpen = menu !== null;
  const setProfileOpen = (v: boolean | ((open: boolean) => boolean)) => setMenu((typeof v === "function" ? v(profileOpen) : v) ? "top" : null);
  const hydrated = useHydration((s) => s.hydrated);
  const mode = useAuthStore((s) => s.mode);
  const userId = useAuthStore((s) => s.userId);
  const email = useAuthStore((s) => s.email);
  const displayName = dna.name || email?.split("@")[0] || "You";
  const notifications = useCareerStore((s) => s.notifications);
  const markRead = useCareerStore((s) => s.markRead);
  const shown = hydrated ? visibleNotifications(notifications) : [];
  const unread = shown.filter((n) => !n.read).length;
  // Career status is derived from real application state (spec §3 "Career status").
  const apps = Object.values(applications);
  const careerStatus = !hydrated ? "Career Explorer" : apps.some((a) => a.status === "offer") ? "Deciding on an offer" : apps.some((a) => a.status === "interview") ? "Interviewing" : apps.some((a) => a.status === "submitted" || a.status === "under_review") ? "Actively applying" : "Career Explorer";
  const { available: canInstall, promptInstall } = useInstallPrompt();
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  useOutside(notifRef, () => setNotifOpen(false));
  useOutside(profileRef, () => setProfileOpen(false));

  const menuConfig = useMenu("account");
  // Platform admins get an Admin link (the JobsLake portal); everyone else never sees it.
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
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmd(!useUIStore.getState().commandOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCmd]);

  // One menu, opened from the avatar or the phone's floating button (then on the page itself, by the button).
  const accountMenu = (
    <div role="menu" className={cn("w-60 rounded-[16px] border border-line bg-surface p-1.5 shadow-lg wj-animate-fade-up", menu === "fab" ? "fixed bottom-[calc(var(--wj-mobile-nav-h)+4.75rem)] right-4 z-50" : "absolute left-0 top-12 md:left-auto md:right-0")}>
      {mode === "user" && email && <p className="truncate px-3 pb-2 pt-1.5 text-[11px] text-ink-3">{email}</p>}
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
            { id: "help", href: "/help", label: "Get Help", icon: LifeBuoy },
          ],
          // The order and hidden items a platform admin set for everyone (Admin → Settings → Menus).
          menuConfig,
        ),
        // Platform admins only, after the rest; never hidden from them.
        ...(isAdmin ? [{ id: "admin", href: "/platform/jobs-lake", label: "Admin", icon: Database }] : []),
      ].map((m) => (
        <Link key={m.href} role="menuitem" href={m.href} onClick={() => setProfileOpen(false)} className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-ink-2 hover:bg-bg-soft hover:text-ink">
          <m.icon className="size-4" aria-hidden /> {m.label}
        </Link>
      ))}
      {canInstall && (
        <button
          type="button"
          role="menuitem"
          onClick={async () => {
            setProfileOpen(false);
            const outcome = await promptInstall();
            if (outcome === "accepted") toast.success("Installing WonderJobs", "Find it on your home screen or app launcher.");
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

  return (
    <header data-top-bar style={{ transform: "translateY(calc(var(--wj-top-hidden, 0px) * -1))" }} className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur transition-transform duration-300 ease-out motion-reduce:transition-none md:px-6">
      {/* Phones: avatar left, brand centred, Tasks and bell right. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center md:hidden">
        <span className="pointer-events-auto">
          <WonderLogo href="/app" size={26} />
        </span>
      </div>
      <div className="flex-1" />

      <RunningIndicator />
      {/* Tasks: what needs you (Needs attention). Ask Wonder is under You, and ⌘K on a computer. */}
      <Link href="/app/tasks" aria-label={`Tasks${tasks ? `, ${tasks} need attention` : ""}`} title="Tasks" className="relative flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-bg-soft">
        <ListChecks className="size-5" aria-hidden />
        {tasks > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-4 text-white">{tasks > 9 ? "9+" : tasks}</span>}
      </Link>

      {/* On phones the panel is placed against the header (not the bell) so it spans the screen with a margin. */}
      <div className="md:relative" ref={notifRef}>
        <button type="button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={notifOpen} onClick={() => setNotifOpen((v) => !v)} className="relative flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-bg-soft">
          <Bell className="size-5" aria-hidden />
          {unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-danger-600 ring-2 ring-surface" aria-hidden />}
        </button>
        {notifOpen && (
          <div role="dialog" aria-label="Notifications" className="absolute inset-x-3 top-[calc(100%+0.25rem)] flex max-h-[min(70dvh,32rem)] flex-col rounded-[20px] border border-line bg-surface p-2 shadow-lg wj-animate-fade-up md:inset-x-auto md:right-0 md:top-12 md:w-[380px]">
            <div className="flex shrink-0 items-center justify-between px-3 py-2">
              <p className="text-[15px] font-semibold text-ink">Notifications</p>
              {unread > 0 && (
                <button type="button" onClick={() => markRead()} className="text-xs font-medium text-brand-600 hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto overscroll-contain">
              {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-3">You&apos;re all caught up.</li>}
              {shown.slice(0, 10).map((n) => (
                <li key={n.id} className={cn("flex items-start gap-3 px-3 py-3", !n.read && "bg-brand-50/50 first:rounded-t-[12px] last:rounded-b-[12px]")}>
                  <span className={cn("mt-[7px] size-2 shrink-0 rounded-full", n.read ? "bg-line-strong" : "bg-brand-500")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold leading-snug text-ink">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-3">{n.body}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[12px] text-ink-4">{relativeTime(n.at)}</span>
                      <Link
                        href={n.href}
                        onClick={() => {
                          markRead(n.id);
                          setNotifOpen(false);
                        }}
                        className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full bg-brand-600 pl-3 pr-2 text-[13px] font-semibold text-white hover:bg-brand-700"
                      >
                        {n.action ?? NOTIFICATION_ACTION[n.category] ?? "Open"} <ChevronRight className="size-3.5" aria-hidden />
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {/* Everything, and the choices about what you're told. */}
            <Link href="/app/notifications" onClick={() => setNotifOpen(false)} className="mt-1 shrink-0 rounded-[12px] px-3 py-2.5 text-center text-[13px] font-medium text-brand-600 hover:bg-bg-soft">
              Notification center
            </Link>
          </div>
        )}
      </div>

      <div className="relative order-first md:order-none" ref={profileRef}>
        <button type="button" aria-expanded={profileOpen} aria-label="Profile menu" onClick={() => setProfileOpen((v) => !v)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-bg-soft">
          <Avatar name={displayName} size={34} self />
          <span className="hidden text-left lg:block">
            <span className="block text-[13px] font-semibold leading-tight text-ink">{displayName}</span>
            <span className="block text-[11px] leading-tight text-ink-3">{careerStatus}</span>
          </span>
          <ChevronDown className="hidden size-4 text-ink-4 lg:block" aria-hidden />
        </button>
        {profileOpen && (menu === "fab" ? createPortal(<div data-menu-trigger>{accountMenu}</div>, document.body) : accountMenu)}
      </div>
      {/* Phones: centred exactly between the avatar's right edge (16px gutter + the 46px avatar button) and the logo's
          left edge (half of the centred logo, 26px high × 527/96 wide). From md up it sits at the start of the bar. */}
      {onFind && hydrated && (
        <div className="absolute inset-y-0 left-[62px] right-[calc(50%+71.35px)] flex items-center justify-center md:static md:order-first md:block">
          <FindModeMenu />
        </div>
      )}
      {cmd && <CommandPalette open onClose={() => setCmd(false)} />}
    </header>
  );
}
