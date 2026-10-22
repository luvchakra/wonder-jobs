"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useCareerStore } from "@/store/career";
import { NOTIFICATION_ACTION, visibleNotifications } from "@/domain/career/notifications";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Chip } from "@/components/common/Input";
import { EmptyState } from "@/components/common/States";
import { NotifyPrefsCard } from "@/components/account/NotifyPrefsCard";
import { PushNotifications } from "@/components/pwa/PushNotifications";
import { DigestEmailCard } from "@/components/account/DigestEmailCard";

/**
 * Notification center (owner, 2026-10-22): everything the bell holds, and every choice about what you're told —
 * Notify me about, notifications on this device, and the activity email — in one place.
 */
export default function NotificationsPage() {
  const notifications = useCareerStore((s) => s.notifications);
  const markRead = useCareerStore((s) => s.markRead);
  const signedIn = useAuthStore((s) => s.mode) === "user";
  const [unreadOnly, setUnreadOnly] = useState(false);
  const all = visibleNotifications(notifications);
  const unread = all.filter((n) => !n.read).length;
  const list = unreadOnly ? all.filter((n) => !n.read) : all;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-[20px] font-semibold text-ink">Notifications</h1>
        {unread > 0 && (
          <button type="button" onClick={() => markRead()} className="text-[13px] font-medium text-brand-600 hover:underline">
            Mark all read
          </button>
        )}
      </div>
      <div className="mb-3 flex gap-1.5" role="group" aria-label="Show">
        <Chip active={!unreadOnly} onClick={() => setUnreadOnly(false)} className="h-9 px-3">
          All
        </Chip>
        <Chip active={unreadOnly} onClick={() => setUnreadOnly(true)} className="h-9 px-3">
          Unread{unread ? ` · ${unread}` : ""}
        </Chip>
      </div>
      {list.length === 0 ? (
        <EmptyState title={unreadOnly ? "Nothing unread" : "You're all caught up"} body="Messages, reminders and how your searches went appear here." />
      ) : (
        <ul aria-label="Notifications" className="divide-y divide-line overflow-hidden rounded-[16px] border border-line bg-surface">
          {list.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3", !n.read && "bg-brand-50/50")}>
              <span className={cn("mt-[7px] size-2 shrink-0 rounded-full", n.read ? "bg-line-strong" : "bg-brand-500")} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold leading-snug text-ink">{n.title}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-ink-3">{n.body}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[12px] text-ink-4">{relativeTime(n.at)}</span>
                  <Link href={n.href} onClick={() => markRead(n.id)} className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full bg-brand-600 pl-3 pr-2 text-[13px] font-semibold text-white hover:bg-brand-700">
                    {n.action ?? NOTIFICATION_ACTION[n.category] ?? "Open"} <ChevronRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <h2 id="choices" className="mb-1 mt-6 scroll-mt-20 text-[15px] font-semibold text-ink">
        Your choices
      </h2>
      {signedIn ? (
        <>
          <NotifyPrefsCard />
          <PushNotifications />
          <DigestEmailCard />
        </>
      ) : (
        // Choices are kept with an account; demo and local mode have none to keep them in.
        <p className="text-[13px] text-ink-3">Sign in to choose what WonderJobs sends you by push and email.</p>
      )}
    </div>
  );
}
