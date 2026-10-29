"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { NOTIFICATION_ACTION, visibleNotifications } from "@/domain/career/notifications";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Chip } from "@/components/common/Input";
import { NOTIFY_TOPICS, topicOf, type NotifyTopic } from "@/domain/notifications/prefs";

/** Each kind's chip, short. */
const TOPIC_CHIP: Record<NotifyTopic, string> = { messages: "Messages", interviews: "Interviews", follow_ups: "Follow-ups", matches: "Matches", searches: "Searches", applications: "Applications", saved_jobs: "Saved jobs" };
import { EmptyState, PageLoading } from "@/components/common/States";
import { NeedsAttention, useAttentionRows } from "./NeedsAttention";

type Tab = "notifications" | "attention";

/**
 * Notifications (owner, 2026-10-29): the bell opens this page. Two tabs — Notifications (everything that happened) and
 * Needs attention (what needs you, `?tab=attention`). Notifications & email (/app/settings/notifications) is where you
 * choose what you're told, and how.
 */
function NotificationsPage() {
  const router = useRouter();
  const tab: Tab = useSearchParams().get("tab") === "attention" ? "attention" : "notifications";
  const setTab = (t: Tab) => router.replace(t === "attention" ? "/app/notifications?tab=attention" : "/app/notifications", { scroll: false });
  const rows = useAttentionRows();
  const notifications = useCareerStore((s) => s.notifications);
  const markRead = useCareerStore((s) => s.markRead);
  // All, Unread, or one kind (Messages, Interviews…) — the kinds Notifications & email lists, those present here.
  const [show, setShow] = useState<"all" | "unread" | NotifyTopic>("all");
  const all = visibleNotifications(notifications);
  const unread = all.filter((n) => !n.read).length;
  const kinds = NOTIFY_TOPICS.map((t) => ({ id: t.id, label: TOPIC_CHIP[t.id], n: all.filter((n) => topicOf(n.category) === t.id).length })).filter((k) => k.n > 0);
  const unreadOnly = show === "unread";
  const list = show === "all" ? all : unreadOnly ? all.filter((n) => !n.read) : all.filter((n) => topicOf(n.category) === show);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-[20px] font-semibold text-ink">Notifications</h1>
        {tab === "notifications" && unread > 0 && (
          <button type="button" onClick={() => markRead()} className="text-[13px] font-medium text-brand-600 hover:underline">
            Mark all read
          </button>
        )}
      </div>
      <div role="tablist" aria-label="Notifications" className="-mx-4 mb-4 flex overflow-x-auto border-b border-line px-4 [scrollbar-width:none] md:mx-0 md:px-0">
        {(
          [
            { id: "notifications", label: "Notifications", n: unread },
            { id: "attention", label: "Needs attention", n: rows.length },
          ] as const
        ).map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn("inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[14px] font-medium transition-colors", tab === t.id ? "border-brand-500 text-brand-700" : "border-transparent text-ink-3 hover:text-ink")}>
            {t.label}
            {t.n > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold leading-5 text-white">{t.n > 99 ? "99+" : t.n}</span>}
          </button>
        ))}
      </div>
      {tab === "attention" ? (
        <NeedsAttention rows={rows} />
      ) : (
        <>
      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Show">
        <Chip active={show === "all"} onClick={() => setShow("all")} className="h-8 shrink-0 px-3 text-[12.5px]">
          All · {all.length}
        </Chip>
        <Chip active={unreadOnly} onClick={() => setShow("unread")} className="h-8 shrink-0 px-3 text-[12.5px]">
          Unread{unread ? ` · ${unread}` : ""}
        </Chip>
        {kinds.map((k) => (
          <Chip key={k.id} active={show === k.id} onClick={() => setShow(show === k.id ? "all" : k.id)} className="h-8 shrink-0 px-3 text-[12.5px]">
            {k.label} · {k.n}
          </Chip>
        ))}
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
        </>
      )}
      <Link href="/app/settings/notifications" className="mt-4 flex items-center justify-between gap-3 rounded-[16px] border border-line bg-surface px-4 py-3.5 text-[14px] text-ink hover:bg-surface-2">
        <span>
          Notification settings
          <span className="block text-[12px] text-ink-3">Choose what you&apos;re told, and how</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-4" aria-hidden />
      </Link>
    </div>
  );
}

export default function NotificationsRoute() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NotificationsPage />
    </Suspense>
  );
}
