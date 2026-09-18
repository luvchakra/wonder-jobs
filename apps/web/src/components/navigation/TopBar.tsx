"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown, FlaskConical, LogIn, LogOut, Search, Settings, Sparkles, User, UserPlus } from "lucide-react";
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
import { CommandPalette } from "./CommandPalette";

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
  const unread = hydrated ? notifications.filter((n) => !n.read).length : 0;
  // Career status is derived from real application state (spec §3 "Career status").
  const apps = Object.values(applications);
  const careerStatus = !hydrated ? "Career Explorer" : apps.some((a) => a.status === "offer") ? "Deciding on an offer" : apps.some((a) => a.status === "interview") ? "Interviewing" : apps.some((a) => a.status === "submitted" || a.status === "under_review") ? "Actively applying" : "Career Explorer";
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
      <div className="md:hidden">
        <WonderLogo href="/app" compact />
      </div>
      <button
        type="button"
        onClick={() => setCmd(true)}
        className="mx-auto flex h-10 w-full max-w-xl items-center gap-2 rounded-full border border-line bg-surface-2 px-4 text-left text-sm text-ink-4 transition-colors hover:border-line-strong"
        aria-label="Ask Wonder anything (Command+K)"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">Ask Wonder anything…</span>
        <kbd className="hidden rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-3 sm:inline-block">⌘ K</kbd>
      </button>

      <div className="relative" ref={notifRef}>
        <button type="button" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={notifOpen} onClick={() => setNotifOpen((v) => !v)} className="relative flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-bg-soft">
          <Bell className="size-5" aria-hidden />
          {unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-danger-600 ring-2 ring-surface" aria-hidden />}
        </button>
        {notifOpen && (
          <div role="dialog" aria-label="Notifications" className="absolute right-0 top-12 w-[340px] max-w-[calc(100vw-2rem)] rounded-[20px] border border-line bg-surface p-2 shadow-lg wj-animate-fade-up">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-sm font-semibold">Notifications</p>
              {unread > 0 && (
                <button type="button" onClick={() => markRead()} className="text-xs font-medium text-brand-600 hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {notifications.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-3">You&apos;re all caught up.</li>}
              {notifications.slice(0, 8).map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={() => {
                      markRead(n.id);
                      setNotifOpen(false);
                    }}
                    className={cn("flex gap-3 rounded-[12px] px-3 py-2.5 hover:bg-bg-soft", !n.read && "bg-brand-50/60")}
                  >
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand-500")} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{n.title}</span>
                      <span className="block text-xs text-ink-3">{n.body}</span>
                      <span className="mt-0.5 block text-[11px] text-ink-4">{relativeTime(n.at)}</span>
                    </span>
                  </Link>
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
              { href: "/app/profile", label: "Profile", icon: User },
              { href: "/app/settings/ai", label: "AI provider", icon: Sparkles },
              { href: "/app/automation/settings", label: "Automation settings", icon: Settings },
            ].map((m) => (
              <Link key={m.href} role="menuitem" href={m.href} onClick={() => setProfileOpen(false)} className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-ink-2 hover:bg-bg-soft hover:text-ink">
                <m.icon className="size-4" aria-hidden /> {m.label}
              </Link>
            ))}
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
                <a role="menuitem" href="/demo" className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-ink-2 hover:bg-bg-soft hover:text-ink">
                  <FlaskConical className="size-4" aria-hidden /> Demo
                </a>
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setProfileOpen(false);
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
