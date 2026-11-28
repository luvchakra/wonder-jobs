"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/cn";
import { toast } from "@/components/feedback/Toast";
import { useNetworkInbox } from "./inbox";
import { MemberAvatar, memberHref, mutualLine } from "./parts";

/**
 * My network's own top-bar icons (owner, 2026-11-22: "customize the notification icon, put the invitations on the
 * notifications, move the messages on left to notification icon"): Messages, then a bell whose badge counts connection
 * invitations and which opens them, to accept or ignore in place. All notifications are one link away.
 */
export function NetworkBar({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      <MessagesLink compact={compact} />
      <NetworkBell compact={compact} />
    </div>
  );
}

/** Messages, in the same spot on the top bar in and out of network mode (owner, 2026-11-23: "messages icon should also
 * appear at same place in non network mode"). */
export function MessagesLink({ compact }: { compact?: boolean }) {
  return (
    <Link href="/app/network/messages" aria-label="Messages" title="Messages" className={cn("flex shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-bg-soft", compact ? "size-9" : "size-10")}>
      <MessagesSquare className="size-5" aria-hidden />
    </Link>
  );
}

function NetworkBell({ compact }: { compact?: boolean }) {
  const { invitations, load, answer } = useNetworkInbox();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (invitations === null) void load();
  }, [invitations, load]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const n = invitations?.length ?? 0;
  const reply = async (m: NonNullable<typeof invitations>[number], action: "accept" | "ignore") => {
    try {
      await answer(m, action);
      toast.success(action === "accept" ? `You're connected with ${m.name.split(" ")[0]}` : "Ignored", action === "ignore" ? "They aren't told." : undefined);
    } catch (e) {
      toast.error("That didn't go through", (e as Error).message);
    }
  };
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="dialog" aria-label={`Network notifications${n ? `, ${n} invitation${n === 1 ? "" : "s"}` : ""}`} title="Invitations" onClick={() => setOpen((o) => !o)} className={cn("relative flex shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-bg-soft", compact ? "size-9" : "size-10")}>
        <Bell className="size-5" aria-hidden />
        {n > 0 && <span className="wj-count absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-4 text-white" aria-hidden>{n > 9 ? "9+" : n}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Invitations" className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-[16px] border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-[14px] font-semibold text-ink">Invitations{n ? ` · ${n}` : ""}</p>
            <Link href="/app/notifications" onClick={() => setOpen(false)} className="text-[12.5px] font-semibold text-brand-600 hover:underline">
              All notifications
            </Link>
          </div>
          {invitations === null ? (
            <p className="px-4 py-5 text-[13px] text-ink-3">Loading…</p>
          ) : n === 0 ? (
            <p className="px-4 py-5 text-[13px] text-ink-3">No invitations right now. When someone asks to connect, it shows here.</p>
          ) : (
            <ul className="max-h-[60dvh] overflow-y-auto">
              {invitations.slice(0, 8).map((m) => (
                <li key={m.id} className="border-b border-line px-4 py-3 last:border-0">
                  <Link href={memberHref(m.id)} onClick={() => setOpen(false)} className="flex items-center gap-3">
                    <MemberAvatar m={m} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-ink">{m.name}</span>
                      {m.headline && <span className="block truncate text-[12px] text-ink-3">{m.headline}</span>}
                      {m.mutual > 0 && <span className="block truncate text-[11.5px] text-ink-3">{mutualLine(m)}</span>}
                    </span>
                  </Link>
                  {m.note && <p className="mt-2 line-clamp-2 rounded-[10px] bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink-2">“{m.note}”</p>}
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" onClick={() => void reply(m, "ignore")} className="min-h-8 rounded-full px-3 text-[12.5px] font-semibold text-ink-3 hover:bg-bg-soft">
                      Ignore
                    </button>
                    <button type="button" onClick={() => void reply(m, "accept")} className="min-h-8 rounded-full bg-brand-600 px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-700">
                      Accept
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {n > 8 && (
            <Link href="/app/network?tab=invitations" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-[13px] font-semibold text-brand-600 hover:bg-bg-soft">
              See all {n} invitations
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
