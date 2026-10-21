"use client";
import { useCallback, useEffect, useState } from "react";
import { Ban, Send } from "lucide-react";
import { hiringApi } from "@/services/hiring/client";
import type { Message } from "@/domain/org/types";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/common/Button";
import { toast } from "@/components/feedback/Toast";

type ThreadData = Awaited<ReturnType<typeof hiringApi.thread>>;

/** One conversation between a company and a job seeker: the messages, a reply box when the reader may write, and — for the job seeker — Decline, Block or Open again. */
export function Thread({ id, as = "candidate", onChange }: { id: string; as?: "org" | "candidate"; onChange?: () => void }) {
  const [data, setData] = useState<ThreadData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    hiringApi
      .thread(id, as)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [id, as]);
  useEffect(load, [load]);

  if (error) return <p className="text-[13px] text-danger-600">{error}</p>;
  if (!data) return <p className="text-[13px] text-ink-3">Loading…</p>;
  const { conversation: c, messages, side, canSend, candidateOpen } = data;
  const mine = (m: Message) => m.side === side;

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await hiringApi.send(id, text, as);
      setText("");
      load();
      onChange?.();
    } catch (e) {
      toast.error("Couldn't send", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const setStatus = async (status: "open" | "declined" | "blocked") => {
    try {
      await hiringApi.setConversationStatus(id, status);
      toast.success(status === "blocked" ? `${c.orgName} is blocked` : status === "declined" ? "Declined" : "Open again");
      load();
      onChange?.();
    } catch (e) {
      toast.error("Couldn't change it", (e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[15px] font-semibold text-ink">{side === "candidate" ? c.orgName : c.candidateName}</p>
        <p className="text-[12px] text-ink-3">
          {c.jobTitle ? `About ${c.jobTitle} · ` : ""}
          {c.status === "open" ? "Open" : c.status === "declined" ? (side === "candidate" ? "You declined" : "Declined by the candidate") : side === "candidate" ? "You blocked this company" : "The candidate blocked your company"}
        </p>
      </div>
      <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
        {messages.map((m) => (
          <li key={m.id} className={cn("max-w-[85%] rounded-[14px] px-3 py-2 text-[14px]", mine(m) ? "self-end bg-brand-600 text-white" : "self-start bg-surface-2 text-ink")}>
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className={cn("mt-0.5 text-[10px]", mine(m) ? "text-white/70" : "text-ink-4")}>{relativeTime(m.createdAt)}</p>
          </li>
        ))}
      </ul>
      {canSend && (
        <div className="flex items-end gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={4000} placeholder="Write a message" aria-label="Message" className="min-h-11 flex-1 resize-y rounded-[12px] border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-brand-500" />
          <Button size="md" onClick={send} loading={busy} disabled={!text.trim()} icon={<Send className="size-4" aria-hidden />} aria-label="Send">
            Send
          </Button>
        </div>
      )}
      {side === "org" && !canSend && c.status === "open" && <p className="text-[12px] text-ink-3">{candidateOpen ? "Your role can read this conversation; recruiters and owners write in it." : "They're no longer open to recruiters, so your company can't write to them."}</p>}
      {side === "candidate" && (
        <div className="flex flex-wrap gap-x-4 text-[13px]">
          {c.status !== "open" && (
            <button type="button" onClick={() => setStatus("open")} className="min-h-10 font-medium text-brand-600 hover:underline">
              Open again
            </button>
          )}
          {c.status === "open" && (
            <button type="button" onClick={() => setStatus("declined")} className="min-h-10 font-medium text-ink-3 hover:text-ink">
              Not interested
            </button>
          )}
          {c.status !== "blocked" && (
            <button type="button" onClick={() => setStatus("blocked")} className="inline-flex min-h-10 items-center gap-1 font-medium text-ink-3 hover:text-danger-600">
              <Ban className="size-4" aria-hidden /> Block {c.orgName}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
