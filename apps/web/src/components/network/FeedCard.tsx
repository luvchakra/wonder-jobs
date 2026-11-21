"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Link2, MessageCircle, MoreHorizontal, Repeat2, SendHorizontal, ThumbsUp } from "lucide-react";
import { REACTIONS, type Reaction } from "@/domain/network/network";
import { networkApi, type NetComment, type NetQuoted, type NetUpdate } from "@/services/network/client";
import { relativeTime } from "@/lib/format";
import { moduleById } from "@/modules/registry";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/common/Avatar";
import { Button } from "@/components/common/Button";
import { Field, Select, Textarea } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import { MemberAvatar, memberHref } from "./parts";

/**
 * One thing in the network feed (owner, 2026-11-21: "give option to react, comment and reshare"): a post in its author's
 * words, or something a connection did, with Like (four reactions), Comment and (for a post addressed to everyone) Reshare. Delete or
 * Report sit under the ⋯.
 */
const isPost = (kind: string) => kind === "post" || kind === "post:everyone";
const emoji = (r: Reaction) => REACTIONS.find((x) => x.id === r)?.emoji ?? "👍";
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function Body({ u, quoted }: { u: Pick<NetQuoted, "kind" | "text" | "href" | "about" | "module" | "member">; quoted?: boolean }) {
  const post = isPost(u.kind);
  const moduleLabel = moduleById(u.module)?.label ?? "";
  if (!u.text && !(post && u.href)) return null;
  return (
    <>
      {u.text && <p className={cn("mt-2 whitespace-pre-line break-words leading-relaxed text-ink [overflow-wrap:anywhere]", quoted ? "text-[13.5px]" : "text-[14px]")}>{post ? u.text : `${u.member.name.split(" ")[0]} ${u.text}`}</p>}
      {post && u.href && (
        <Link href={u.href} className="mt-2 flex items-center gap-3 rounded-[14px] border border-line bg-surface-2 p-3 hover:bg-bg-soft">
          <Link2 className="size-4 shrink-0 text-brand-600" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium text-ink">{u.about || "See the listing"}</span>
            {moduleLabel && <span className="block text-[11.5px] text-ink-3">{moduleLabel}</span>}
          </span>
        </Link>
      )}
    </>
  );
}

function Quoted({ q }: { q: NetQuoted | null }) {
  if (!q) return <p className="mt-2 rounded-[14px] border border-dashed border-line p-3 text-[13px] text-ink-3">This post is no longer available.</p>;
  return (
    <div className="mt-2 rounded-[14px] border border-line p-3">
      <Link href={memberHref(q.member.id)} className="flex items-center gap-2">
        <MemberAvatar m={q.member} size={28} />
        <span className="min-w-0 truncate text-[13px] font-semibold text-ink hover:underline">{q.member.name}</span>
        <span className="shrink-0 text-[11.5px] text-ink-3">· {relativeTime(q.at)}</span>
      </Link>
      <Body u={q} quoted />
    </div>
  );
}

/** Tap Like for the four reactions; tap the one you chose again to take it back. */
function ReactButton({ mine, onPick }: { mine?: Reaction; onPick: (r: Reaction | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const chosen = REACTIONS.find((r) => r.id === mine);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)} className={cn(ACTION, chosen && "text-brand-600")}>
        {chosen ? <span aria-hidden>{chosen.emoji}</span> : <ThumbsUp className="size-4" aria-hidden />}
        {chosen?.label ?? "Like"}
      </button>
      {open && (
        <div role="menu" aria-label="Reactions" className="absolute bottom-full left-0 z-20 mb-1 flex gap-1 rounded-full border border-line bg-surface p-1 shadow-lg">
          {REACTIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              role="menuitemradio"
              aria-checked={mine === r.id}
              aria-label={r.label}
              title={r.label}
              onClick={() => {
                setOpen(false);
                onPick(mine === r.id ? null : r.id);
              }}
              className={cn("grid size-10 place-items-center rounded-full text-[20px] hover:bg-bg-soft", mine === r.id && "bg-brand-50")}
            >
              {r.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ACTION = "inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-2 text-[13px] font-semibold text-ink-2 hover:bg-bg-soft";

function Comments({ u, onCount }: { u: NetUpdate; onCount: (n: number) => void }) {
  const [list, setList] = useState<NetComment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState<NetComment | null>(null);
  useEffect(() => {
    networkApi
      .comments(u.id)
      .then((d) => setList(d.comments))
      .catch(() => setList([]));
  }, [u.id]);
  const send = async () => {
    setBusy(true);
    try {
      const { comment } = await networkApi.comment(u.id, text.trim());
      const next = [...(list ?? []), comment];
      setList(next);
      onCount(next.length);
      setText("");
    } catch (e) {
      toast.error("Couldn't comment", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c: NetComment) => {
    try {
      await networkApi.deleteComment(u.id, c.id);
      const next = (list ?? []).filter((x) => x.id !== c.id);
      setList(next);
      onCount(next.length);
    } catch (e) {
      toast.error("Couldn't remove it", (e as Error).message);
    }
  };
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
      {list === null ? (
        <p className="text-[12.5px] text-ink-3">Loading comments…</p>
      ) : (
        list.map((c) => (
          <div key={c.id} className="flex gap-2">
            <Link href={memberHref(c.member.id)} aria-label={c.member.name}>
              <MemberAvatar m={c.member} size={32} />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="rounded-[12px] bg-surface-2 px-3 py-2">
                <Link href={memberHref(c.member.id)} className="block truncate text-[12.5px] font-semibold text-ink hover:underline">
                  {c.member.name}
                </Link>
                <p className="whitespace-pre-line break-words text-[13px] text-ink [overflow-wrap:anywhere]">{c.body}</p>
              </div>
              <p className="flex gap-3 px-1 text-[11.5px] text-ink-3">
                {relativeTime(c.at)}
                {c.canDelete ? (
                  <button type="button" onClick={() => remove(c)} className="font-medium hover:text-ink">
                    Delete
                  </button>
                ) : (
                  <button type="button" onClick={() => setReporting(c)} className="font-medium hover:text-ink">
                    Report
                  </button>
                )}
              </p>
            </div>
          </div>
        ))
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void send();
        }}
      >
        <Avatar name="You" size={32} self />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={1000} placeholder="Add a comment" aria-label="Add a comment" className="min-h-10 flex-1 resize-none rounded-[12px] border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none placeholder:text-ink-4 focus:border-brand-400" />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Send comment" className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white disabled:opacity-40">
          <SendHorizontal className="size-4" aria-hidden />
        </button>
      </form>
      {reporting && (
        <ReportSheet
          title="Report this comment"
          who={reporting.member.name}
          onClose={() => setReporting(null)}
          send={(reason) => networkApi.reportComment(u.id, reporting.id, reason)}
          onDone={() => {
            setList((l) => l?.filter((x) => x.id !== reporting.id) ?? l);
            setReporting(null);
          }}
        />
      )}
    </div>
  );
}

/** Reshare a post for everyone: the member's own words on top (or none), and who sees it. Reshare is the confirmation. */
function ReshareSheet({ u, onClose, onDone }: { u: NetUpdate; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<"connections" | "everyone">("connections");
  const [busy, setBusy] = useState(false);
  const q: NetQuoted = u.reshared ?? u;
  return (
    <Modal
      open
      onClose={onClose}
      title="Reshare"
      description="To your network"
      size="md"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Select value={audience} onChange={(e) => setAudience(e.target.value as "connections" | "everyone")} aria-label="Who sees this reshare" className="mr-auto h-10 w-auto min-w-0">
            <option value="connections">My connections</option>
            <option value="everyone">Everyone on the network</option>
          </Select>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await networkApi.reshare(u.id, text.trim(), audience);
                toast.success("Reshared", audience === "everyone" ? "Everyone on the network can see it." : "Your connections can see it.");
                onDone();
              } catch (e) {
                toast.error("Couldn't reshare", (e as Error).message);
                setBusy(false);
              }
            }}
          >
            Reshare
          </Button>
        </div>
      }
    >
      <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1500} placeholder="Add your thoughts (optional)" aria-label="Your words on top" className="w-full resize-none bg-transparent py-1 text-[15px] text-ink outline-none placeholder:text-ink-4" />
      <Quoted q={q} />
    </Modal>
  );
}

export function ReportSheet({ title, who, send, onClose, onDone }: { title: string; who: string; send: (reason: string) => Promise<unknown>; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={`${who} isn't told who reported it. You stop seeing it at once.`}
      size="sm"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                await send(reason.trim());
                toast.success("Reported", "Our team reviews reports.");
                onDone();
              } catch (e) {
                toast.error("Couldn't report", (e as Error).message);
                setBusy(false);
              }
            }}
          >
            Send report
          </Button>
        </div>
      }
    >
      <Field label="What's wrong?" htmlFor="feed-report">
        <Textarea id="feed-report" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  );
}

function More({ label, onPick }: { label: string; onPick: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative -mr-1 -mt-1 shrink-0">
      <button type="button" aria-label="More" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-bg-soft hover:text-ink">
        <MoreHorizontal className="size-5" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 min-w-32 rounded-[12px] border border-line bg-surface p-1 shadow-lg">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onPick();
            }}
            className="block w-full rounded-[8px] px-3 py-2 text-left text-[13.5px] text-ink hover:bg-bg-soft"
          >
            {label}
          </button>
        </div>
      )}
    </div>
  );
}

export function FeedCard({ u: initial, onDelete, onReport, onReshared }: { u: NetUpdate; onDelete: () => void; onReport: () => void; onReshared: () => void }) {
  const [u, setU] = useState(initial);
  const [open, setOpen] = useState(false);
  const [resharing, setResharing] = useState(false);
  const post = isPost(u.kind);
  const shared = u.kind === "shared";
  const moduleLabel = moduleById(u.module)?.label ?? "";
  const pick = async (r: Reaction | null) => {
    const before = u;
    const had = !!u.myReaction;
    const total = u.reactions.total + (r && !had ? 1 : !r && had ? -1 : 0);
    const top = r && !u.reactions.top.includes(r) ? [r, ...u.reactions.top].slice(0, 3) : u.reactions.top;
    setU({ ...u, myReaction: r ?? undefined, reactions: { total, top: total ? top : [] } });
    try {
      await networkApi.react(u.id, r);
    } catch (e) {
      setU(before);
      toast.error("Couldn't react", (e as Error).message);
    }
  };
  const counts = [u.comments ? plural(u.comments, "comment") : "", u.reshares ? plural(u.reshares, "reshare") : ""].filter(Boolean).join(" · ");
  return (
    <li className="rounded-[16px] border border-line bg-surface p-3">
      <div className="flex gap-3">
        <Link href={memberHref(u.member.id)} aria-label={u.member.name}>
          <MemberAvatar m={u.member} size={44} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={memberHref(u.member.id)} className="block truncate text-[14px] font-semibold text-ink hover:underline">
            {u.member.name}
          </Link>
          {u.member.headline && <p className="truncate text-[12px] text-ink-3">{u.member.headline}</p>}
          <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-3">
            {relativeTime(u.at)}
            {post && <span>· {u.reshared !== undefined ? "Reshared · " : ""}{u.kind === "post:everyone" ? "Everyone on the network" : "Connections"}</span>}
            {moduleLabel && <span className="rounded-full bg-brand-50 px-2 py-px text-[10.5px] font-semibold text-brand-700">{moduleLabel}</span>}
          </p>
        </div>
        {(u.mine || post) && <More label={u.mine ? "Delete" : "Report"} onPick={u.mine ? onDelete : onReport} />}
      </div>
      <Body u={u} />
      {u.reshared !== undefined && <Quoted q={u.reshared} />}
      {(shared || (!u.mine && u.connectionId)) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-4">
          {shared && (
            <Link href={u.href} className="inline-flex min-h-9 items-center text-[13px] font-semibold text-brand-600 hover:underline">
              See the listing
            </Link>
          )}
          {!u.mine && u.connectionId && (
            <Link href={`/app/network/messages/${encodeURIComponent(u.connectionId)}`} className="inline-flex min-h-9 items-center text-[13px] font-semibold text-brand-600 hover:underline">
              {u.kind === "role" ? "Say congrats" : "Message"}
            </Link>
          )}
        </div>
      )}
      {(u.reactions.total > 0 || counts) && (
        <p className="mt-2 flex items-center gap-2 text-[12px] text-ink-3">
          {u.reactions.total > 0 && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden>{u.reactions.top.map(emoji).join("")}</span>
              {u.reactions.total}
            </span>
          )}
          {counts && (
            <button type="button" onClick={() => setOpen(true)} className="ml-auto hover:text-ink hover:underline">
              {counts}
            </button>
          )}
        </p>
      )}
      <div className="mt-1 flex items-center gap-1 border-t border-line pt-1">
        <ReactButton mine={u.myReaction} onPick={pick} />
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={ACTION}>
          <MessageCircle className="size-4" aria-hidden /> Comment
        </button>
        {u.canReshare && (
          <button type="button" onClick={() => setResharing(true)} className={ACTION}>
            <Repeat2 className="size-4" aria-hidden /> Reshare
          </button>
        )}
      </div>
      {open && <Comments u={u} onCount={(n) => setU((x) => ({ ...x, comments: n }))} />}
      {resharing && (
        <ReshareSheet
          u={u}
          onClose={() => setResharing(false)}
          onDone={() => {
            setResharing(false);
            setU((x) => ({ ...x, reshares: x.reshares + 1 }));
            onReshared();
          }}
        />
      )}
    </li>
  );
}
