"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { networkApi, type NetMessage } from "@/services/network/client";
import type { MemberView } from "@/domain/network/network";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Button } from "@/components/common/Button";
import { EmptyState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { MemberAvatar, memberHref } from "@/components/network/parts";

/** A conversation with one connection. Loaded when opened; nothing polls in the background. */
export default function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [who, setWho] = useState<MemberView | null>(null);
  const [list, setList] = useState<NetMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    networkApi
      .thread(id)
      .then((d) => {
        setWho(d.member);
        setList(d.messages);
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [list?.length]);

  if (error) return <EmptyState title="Conversation not available" body={error} action={{ label: "Messages", href: "/app/network/messages" }} />;
  if (!who || !list) return <PageLoading />;

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const { message } = await networkApi.send(id, body);
      setList((l) => [...(l ?? []), message]);
      setText("");
    } catch (e) {
      toast.error("Couldn't send", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={who.name} back={{ href: "/app/network/messages", label: "Messages" }} />
      <Link href={memberHref(who.id)} className="mb-3 flex items-center gap-3 rounded-[16px] border border-line bg-surface p-3 hover:bg-surface-2">
        <MemberAvatar m={who} size={44} />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold text-ink">{who.name}</span>
          {who.headline && <span className="block truncate text-[12px] text-ink-3">{who.headline}</span>}
        </span>
      </Link>
      <div className="flex flex-col gap-2 pb-2">
        {list.length === 0 && <p className="py-6 text-center text-[13px] text-ink-3">No messages yet. Say hello.</p>}
        {list.map((m) => (
          <div key={m.id} className={cn("max-w-[85%] rounded-[16px] px-3.5 py-2 text-[14px] [overflow-wrap:anywhere]", m.mine ? "self-end bg-brand-600 text-white" : "self-start border border-line bg-surface text-ink")}>
            <p className="whitespace-pre-line">{m.body}</p>
            <p className={cn("mt-0.5 text-[10.5px]", m.mine ? "text-white/80" : "text-ink-3")}>{relativeTime(m.at)}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="sticky bottom-[calc(var(--wj-mobile-nav-h,0px)+0.5rem)] flex items-end gap-2 rounded-[18px] border border-line bg-surface p-2 md:bottom-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={4000} placeholder={`Message ${who.name.split(" ")[0]}`} aria-label="Message" className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[14px] text-ink outline-none" />
        <Button type="submit" size="sm" loading={busy} disabled={!text.trim()} icon={<Send className="size-4" aria-hidden />}>
          Send
        </Button>
      </form>
    </div>
  );
}
