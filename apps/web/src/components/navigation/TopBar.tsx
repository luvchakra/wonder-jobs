"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown, ChevronRight, Download, LifeBuoy, LogIn, LogOut, User, UserPlus } from "lucide-react";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";
import { Avatar } from "@/components/common/Avatar";
import { WonderLogo } from "@/components/brand/WonderLogo";
import { useCareerStore } from "@/store/career";
import { useApplicationsStore } from "@/store/applications";
import { useUIStore } from "@/store/ui";
import { useHydration } from "@/store/hydration";
import { useAuthStore } from "@/store/auth";
import { signOutEverywhere } from "@/lib/auth/browser";
import { flushRemote } from "@/store/remoteStorage";
import { useInstallPrompt } from "@/lib/pwa";
import { toast } from "@/components/feedback/Toast";
import { CommandPalette } from "./CommandPalette";
import { NOTIFICATION_ACTION, visibleNotifications } from "@/domain/career/notifications";

function useOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
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
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const hydrated = useHydration((s) => s.hydrated);
  const mode = useAuthStore((s) => s.mode);
  const userId = useAuthStore((s) => s.userId);
  const email = useAuthStore((s) => s.email);
  const dna = useCareerStore((s) => s.dna);
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

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur md:px-6">
      {/* The brand, not a search box: Find has its own search, and Ask Wonder stays on ⌘K. */}
      <div className="mr-auto flex min-w-0 items-center md:hidden">
        <WonderLogo href="/app" size={26} />
      </div>
      <div className="hidden flex-1 md:block" />

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
                        {NOTIFICATION_ACTION[n.category] ?? "Open"} <ChevronRight className="size-3.5" aria-hidden />
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="relative" ref={profileRef}>
        <button type="button" aria-expanded={profileOpen} aria-label="Profile menu" onClick={() => setProfileOpen((v) => !v)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-bg-soft">
          <Avatar name={displayName} size={34} />
          <span className="hidden text-left lg:block">
            <span className="block text-[13px] font-semibold leading-tight text-ink">{displayName}</span>
            <span className="block text-[11px] leading-tight text-ink-3">{mode === "demo" ? "Demo mode" : careerStatus}</span>
          </span>
          <ChevronDown className="hidden size-4 text-ink-4 lg:block" aria-hidden />
        </button>
        {profileOpen && (
          <div role="menu" className="absolute right-0 top-12 w-60 rounded-[16px] border border-line bg-surface p-1.5 shadow-lg wj-animate-fade-up">
            {mode === "demo" && (
              <p className="px-3 pb-2 pt-1.5 text-[11px] leading-snug text-ink-3">
                You&apos;re exploring sample data. Nothing here is saved to an account.
              </p>
            )}
            {mode === "user" && email && <p className="truncate px-3 pb-2 pt-1.5 text-[11px] text-ink-3">{email}</p>}
            {[
              { href: "/app/profile", label: "Account", icon: User },
              { href: "/help", label: "Get Help", icon: LifeBuoy },
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
            {mode === "demo" ? (
              <>
                <a role="menuitem" href="/sign-up" className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-ink-2 hover:bg-bg-soft hover:text-ink">
                  <UserPlus className="size-4" aria-hidden /> Create your account
                </a>
                <a role="menuitem" href="/demo/exit?next=/sign-in" className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-ink-2 hover:bg-bg-soft hover:text-ink">
                  <LogIn className="size-4" aria-hidden /> Exit demo &amp; sign in
                </a>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}
      </div>
      <CommandPalette open={cmd} onClose={() => setCmd(false)} />
    </header>
  );
}
