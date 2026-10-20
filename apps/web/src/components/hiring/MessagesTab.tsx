"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { hiringApi, type ConversationView } from "@/services/hiring/client";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { toast } from "@/components/feedback/Toast";
import { Thread } from "./Thread";

/** The workspace's conversations with candidates; one opens in place. */
export function MessagesTab({ orgId, openId, onOpen, refresh }: { orgId: string; openId: string | null; onOpen: (id: string | null) => void; refresh: number }) {
  const [list, setList] = useState<ConversationView[] | null>(null);
  const load = useCallback(() => {
    hiringApi
      .orgConversations(orgId)
      .then((d) => setList(d.conversations))
      .catch((e: Error) => toast.error("Couldn't load messages", e.message));
  }, [orgId]);
  useEffect(load, [load, refresh]);

  if (list === null) return <p className="text-[13px] text-ink-3">Loading…</p>;
  if (!list.length) return <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">No conversations yet. Write to a candidate from Talent.</p>;
  return (
    <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
      {list.map((c) => (
        <li key={c.id} className="border-b border-line last:border-b-0">
          <button type="button" onClick={() => onOpen(openId === c.id ? null : c.id)} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2", openId === c.id && "bg-surface-2")}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-ink">
                {c.candidateName}
                {c.jobTitle ? <span className="font-normal text-ink-3"> · {c.jobTitle}</span> : null}
              </span>
              <span className="block truncate text-[12px] text-ink-3">{c.last ? `${c.last.side === "org" ? "You: " : ""}${c.last.body}` : "No messages"}</span>
            </span>
            <span className="shrink-0 text-[11px] text-ink-4">{c.status !== "open" ? (c.status === "blocked" ? "Blocked" : "Declined") : c.last ? relativeTime(c.last.createdAt) : ""}</span>
            <ChevronRight className={cn("size-4 shrink-0 text-ink-4 transition-transform", openId === c.id && "rotate-90")} aria-hidden />
          </button>
          {openId === c.id && (
            <div className="border-t border-line px-4 py-3">
              <Thread id={c.id} as="org" onChange={load} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
