"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/cn";
import { useCareerStore } from "@/store/career";
import { useHydration } from "@/store/hydration";
import { notificationsFor, visibleNotifications } from "@/domain/career/notifications";
import { useSelectedModule } from "./useModuleNav";
import { useChromeSlots } from "./slots";

/**
 * The bell: opens Notifications, with the count of what needs the person (Needs attention) or a dot for unread ones.
 * It follows the module selected: its own notifications (and the account's), and its own Needs attention. Phones and
 * tablets: in the top bar. From 1024px: beside the WonderWorks logo at the top of the sidebar (owner, 2026-11-06:
 * "move the bell to the right of WonderWorks at top of sidebar").
 */
export function NotificationBell({ compact }: { /** The sidebar's smaller bell, beside the logo. */ compact?: boolean }) {
  const slots = useChromeSlots();
  const hydrated = useHydration((s) => s.hydrated);
  const notifications = useCareerStore((s) => s.notifications);
  const selected = useSelectedModule();
  const shown = hydrated ? visibleNotifications(notificationsFor(notifications, selected)) : [];
  const unread = shown.filter((n) => !n.read).length;
  const { tasks } = slots.useStatus(hydrated, selected);
  return (
    <Link href="/app/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}${tasks ? `, ${tasks} need attention` : ""}`} title="Notifications" className={cn("relative flex shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-bg-soft", compact ? "size-8" : "size-10")}>
      <Bell className={compact ? "size-[18px]" : "size-5"} aria-hidden />
      {tasks > 0 ? (
        <span className={cn("absolute grid min-w-4", compact ? "-right-1 -top-1" : "right-1 top-1", "place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-4 text-white")} aria-hidden>
          {tasks > 9 ? "9+" : tasks}
        </span>
      ) : (
        unread > 0 && <span className={cn("absolute size-2 rounded-full", compact ? "right-1 top-1" : "right-2 top-2", "bg-danger-600 ring-2 ring-surface")} aria-hidden />
      )}
    </Link>
  );
}
