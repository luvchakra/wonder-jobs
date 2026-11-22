"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowBigDown, ArrowBigUp, ArrowDown, Bell, ChevronRight, Lock, MessageCircle, MoreHorizontal, Pin, Plus } from "lucide-react";
import { can, layOut, LIMITS, type Community, type Discussion, type Reply, type ReplySort, type Vote } from "@/domain/network/communities";
import { useBottomBar } from "@/wonderworks/chrome/MobileNav";
import { communityApi } from "@/services/network/client";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/common/Button";
import { EmptyState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { Menu, ReportSheet, type MenuItem } from "@/components/network/FeedCard";
import { BackButton, CommunityAvatar } from "@/components/network/community";
import { ListingCard } from "@/components/network/ListingCard";
import { moduleById } from "@/modules/registry";
import { MemberAvatar, memberHref } from "@/components/network/parts";

/**
 * A discussion (owner, 2026-11-22: "discussion threads should be easy to follow even when the discussions are long and
 * complicated"). Replies nest under what they answer, with a guide line per level; any branch folds to one line that
 * says how many replies it hides; long discussions open with their big side branches folded. "OP" marks the person who
 * started it, "New" what arrived since the last visit, and "Next new" jumps between them. Past four levels replies stop
 * indenting and say who they answer, so nothing gets squeezed on a phone.
 */
const AUTO_FOLD_OVER = 40;

export default function DiscussionPage({ params }: { params: Promise<{ id: string; thread: string }> }) {
  const { id, thread } = use(params);
  const router = useRouter();
  const [community, setCommunity] = useState<Community | null>(null);
  const [d, setD] = useState<Discussion | null>(null);
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [failed, setFailed] = useState("");
  const [sort, setSort] = useState<ReplySort>("oldest");
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [answering, setAnswering] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [reporting, setReporting] = useState<{ id: string; who: string } | null>(null);
  const newSeen = useRef(0);

  const load = useCallback(() => {
    communityApi
      .read(thread)
      .then((x) => {
        setCommunity(x.community);
        setD(x.discussion);
        setReplies(x.replies);
        // A long discussion opens with its big side branches folded, never a branch holding something new.
        if (x.replies.length > AUTO_FOLD_OVER) {
          const laid = layOut(x.replies, (a, b) => a.at.localeCompare(b.at));
          const hasNew = new Set<string>();
          const parentOf = new Map(x.replies.map((r) => [r.id, r.parentId]));
          for (const r of x.replies.filter((r) => r.isNew)) for (let p = r.parentId; p; p = parentOf.get(p) ?? null) hasNew.add(p);
          setFolded(new Set(laid.filter((l) => l.depth === 1 && l.descendants >= 4 && !hasNew.has(l.reply.id)).map((l) => l.reply.id)));
        }
      })
      .catch((e) => setFailed((e as Error).message));
  }, [thread]);
  useEffect(load, [load]);

  // A link to one reply (from a notification) opens on it.
  useEffect(() => {
    if (!replies) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) return;
    const el = document.getElementById(hash);
    el?.scrollIntoView({ block: "center" });
    el?.classList.add("ring-2", "ring-brand-300");
    const t = setTimeout(() => el?.classList.remove("ring-2", "ring-brand-300"), 2500);
    return () => clearTimeout(t);
  }, [replies]);

  const order = useCallback((a: Reply, b: Reply) => (sort === "top" ? b.score - a.score || a.at.localeCompare(b.at) : a.at.localeCompare(b.at)), [sort]);
  const laid = useMemo(() => (replies ? layOut(replies, order) : []), [replies, order]);
  const byId = useMemo(() => new Map((replies ?? []).map((r) => [r.id, r])), [replies]);
  // What shows: everything not inside a folded branch.
  const shown = useMemo(() => {
    const parentOf = new Map((replies ?? []).map((r) => [r.id, r.parentId]));
    const inFolded = (r: Reply) => {
      for (let p = r.parentId; p; p = parentOf.get(p) ?? null) if (folded.has(p)) return true;
      return false;
    };
    return laid.filter((l) => !inFolded(l.reply));
  }, [laid, folded, replies]);
  const newIds = useMemo(() => laid.filter((l) => l.reply.isNew).map((l) => l.reply.id), [laid]);

  if (failed) return <EmptyState icon={<MessageCircle className="size-6" aria-hidden />} title="Discussion not available" body={failed} action={{ label: "Communities", href: "/app/network/communities" }} />;
  if (!community || !d || !replies) return <PageLoading />;
  const role = community.me?.status === "member" ? community.me.role : undefined;
  const member = !!role;
  const canReply = member && (!d.locked || can.moderate(role));

  const toggle = (rid: string) => setFolded((f) => (f.has(rid) ? new Set([...f].filter((x) => x !== rid)) : new Set([...f, rid])));
  const nextNew = () => {
    if (!newIds.length) return;
    const target = newIds[newSeen.current % newIds.length];
    newSeen.current += 1;
    // Unfold whatever hides it.
    const parentOf = new Map(replies.map((r) => [r.id, r.parentId]));
    setFolded((f) => {
      const n = new Set(f);
      for (let p = parentOf.get(target) ?? null; p; p = parentOf.get(p) ?? null) n.delete(p);
      return n;
    });
    setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
  };
  // Upvote / downvote (owner, 2026-11-22): pressing your own vote again takes it back.
  const castVote = async (target: string, before: Vote, pressed: 1 | -1) => {
    const next: Vote = before === pressed ? 0 : pressed;
    const apply = <T extends { score: number; myVote: Vote }>(x: T): T => ({ ...x, myVote: next, score: x.score - before + next });
    if (target === d.id) setD(apply(d));
    else setReplies((rs) => rs?.map((r) => (r.id === target ? apply(r) : r)) ?? rs);
    try {
      await communityApi.vote(d.id, target, next);
    } catch (e) {
      toast.error("Couldn't vote", (e as Error).message);
      load();
    }
  };
  const send = async (body: string, parentId: string | null) => {
    const { reply } = await communityApi.reply(d.id, body, parentId);
    setReplies((rs) => [...(rs ?? []), reply]);
    setD((x) => (x ? { ...x, replies: x.replies + 1, following: true } : x));
    setAnswering(null);
    setTimeout(() => document.getElementById(reply.id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
  };
  const remove = async (target: string) => {
    if (!window.confirm(target === d.id ? "Delete this discussion and all its replies?" : "Delete this reply? Replies to it stay.")) return;
    try {
      await communityApi.removePost(d.id, target);
      if (target === d.id) router.push(`/app/network/communities/${id}`);
      else setReplies((rs) => rs?.map((r) => (r.id === target ? { ...r, deleted: true, body: "", author: null, score: 0 } : r)) ?? rs);
    } catch (e) {
      toast.error("Couldn't delete it", (e as Error).message);
    }
  };
  const save = async (target: string, body: string, title?: string) => {
    await communityApi.edit(d.id, target, body, title);
    if (target === d.id) setD({ ...d, body, title: title ?? d.title, editedAt: new Date().toISOString() });
    else setReplies((rs) => rs?.map((r) => (r.id === target ? { ...r, body, editedAt: new Date().toISOString() } : r)) ?? rs);
    setEditing(null);
  };
  const opMenu: MenuItem[] = [
    ...(d.mine ? [{ label: "Edit", onPick: () => setEditing(d.id) }] : []),
    ...(can.moderate(role) ? [{ label: d.pinned ? "Unpin" : "Pin to top", onPick: () => void communityApi.moderate(d.id, { pinned: !d.pinned }).then(() => setD({ ...d, pinned: !d.pinned })) }, { label: d.locked ? "Unlock replies" : "Lock replies", onPick: () => void communityApi.moderate(d.id, { locked: !d.locked }).then(() => setD({ ...d, locked: !d.locked })) }] : []),
    ...(d.mine || can.moderate(role) ? [{ label: "Delete", onPick: () => void remove(d.id) }] : []),
    ...(!d.mine && d.author ? [{ label: "Report", onPick: () => setReporting({ id: d.id, who: d.author!.name }) }] : []),
  ];

  return (
    <div className="mx-auto max-w-3xl pb-36">
      <div className="mb-3 flex items-center gap-2.5">
        <BackButton fallback={`/app/network/communities/${id}`} label="Back" />
        <Link href={`/app/network/communities/${id}`} className="inline-flex min-w-0 items-center gap-2 rounded-full py-1 pr-3 text-[13px] font-medium text-ink-2 hover:text-ink">
          <CommunityAvatar c={community} size={24} />
          <span className="truncate">{community.name}</span>
          <ChevronRight className="size-3.5 shrink-0 text-ink-4" aria-hidden />
        </Link>
      </div>

      <article className="rounded-[18px] border border-line bg-surface p-4">
        <div className="flex items-start gap-2">
          <h1 className="flex-1 text-[19px] font-semibold leading-snug text-ink">
            {d.pinned && <Pin className="mr-1.5 inline size-4 text-brand-600" aria-label="Pinned" />}
            {d.title}
          </h1>
          {opMenu.length > 0 && <Menu label="Discussion options" items={opMenu} trigger={() => <span className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-bg-soft"><MoreHorizontal className="size-5" aria-hidden /></span>} />}
        </div>
        <Byline author={d.author} at={d.at} editedAt={d.editedAt} op />
        {editing === d.id ? (
          <Editor start={d.body} title={d.title} onCancel={() => setEditing(null)} onSave={(b, t) => save(d.id, b, t)} max={LIMITS.body} />
        ) : (
          d.body && <p className="mt-3 whitespace-pre-line break-words text-[14.5px] leading-relaxed text-ink [overflow-wrap:anywhere]">{d.body}</p>
        )}
        {/* The listing it's about, from any module, as rich as in the feed. */}
        {d.about && <ListingCard page={d.about.page} fallback={d.about.title} moduleLabel={moduleById(d.about.module)?.label ?? ""} />}
        <div className="mt-3 flex items-center gap-1 border-t border-line pt-1.5">
          <Votes score={d.score} mine={d.myVote} disabled={!member} onVote={(v) => castVote(d.id, d.myVote, v)} />
          <span className="inline-flex min-h-9 items-center gap-1.5 px-2 text-[13px] text-ink-3">
            <MessageCircle className="size-4" aria-hidden /> {d.replies}
          </span>
          {member && (
            <button
              type="button"
              onClick={() => void communityApi.follow(d.id, !d.following).then(() => setD({ ...d, following: !d.following }), (e) => toast.error("Couldn't change it", (e as Error).message))}
              aria-pressed={d.following}
              title={d.following ? "You're told about new replies. Tap to stop." : "Get told about new replies"}
              className={cn("ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-2 text-[13px] font-semibold hover:bg-bg-soft", d.following ? "text-brand-600" : "text-ink-2")}
            >
              <Bell className="size-4" fill={d.following ? "currentColor" : "none"} aria-hidden />
              {d.following ? "Following" : "Follow"}
            </button>
          )}
        </div>
      </article>

      {d.locked && (
        <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ink-3">
          <Lock className="size-3.5" aria-hidden /> Locked: new replies are closed.
        </p>
      )}

      <div className="mb-2 mt-5 flex flex-wrap items-center gap-2">
        <h2 className="text-[14px] font-semibold text-ink">
          {d.replies} repl{d.replies === 1 ? "y" : "ies"}
        </h2>
        {replies.length > 1 && (
          <div className="ml-auto flex items-center gap-1.5">
            {(["oldest", "top"] as ReplySort[]).map((s) => (
              <button key={s} type="button" aria-pressed={sort === s} onClick={() => setSort(s)} className={cn("min-h-8 rounded-full px-3 text-[12.5px] font-semibold capitalize", sort === s ? "bg-ink text-white" : "bg-surface text-ink-2 ring-1 ring-line")}>
                {s}
              </button>
            ))}
            <button type="button" onClick={() => setFolded(folded.size ? new Set() : new Set(laid.filter((l) => l.depth === 0 && l.descendants > 0).map((l) => l.reply.id)))} className="min-h-8 rounded-full px-3 text-[12.5px] font-semibold text-brand-600 hover:bg-bg-soft">
              {folded.size ? "Expand all" : "Collapse all"}
            </button>
          </div>
        )}
      </div>

      <ol className="flex flex-col">
        {shown.map(({ reply: r, depth, replyingTo, descendants }) => {
          const isFolded = folded.has(r.id);
          const to = replyingTo ? byId.get(replyingTo) : undefined;
          const menu: MenuItem[] = [
            ...(r.mine && !r.deleted ? [{ label: "Edit", onPick: () => setEditing(r.id) }] : []),
            ...((r.mine || can.moderate(role)) && !r.deleted ? [{ label: "Delete", onPick: () => void remove(r.id) }] : []),
            ...(!r.mine && r.author && !r.deleted ? [{ label: "Report", onPick: () => setReporting({ id: r.id, who: r.author!.name }) }] : []),
          ];
          return (
            <li key={r.id} id={r.id} className="relative scroll-mt-24 rounded-[12px] transition-shadow" style={{ paddingLeft: depth * 16 }}>
              {/* One guide line per level, so it's clear what each reply answers. */}
              {Array.from({ length: depth }, (_, i) => (
                <span key={i} aria-hidden className="absolute bottom-0 top-0 w-px bg-line" style={{ left: i * 16 + 13 }} />
              ))}
              <div className={cn("relative py-2", r.isNew && "before:absolute before:-left-1 before:bottom-2 before:top-2 before:w-[3px] before:rounded-full before:bg-brand-500")}>
                <div className="flex items-center gap-2">
                  {descendants > 0 ? (
                    <button type="button" onClick={() => toggle(r.id)} aria-expanded={!isFolded} aria-label={isFolded ? `Show ${descendants} more` : "Collapse"} className="grid size-7 shrink-0 place-items-center rounded-full">
                      {r.author ? <MemberAvatar m={r.author} size={26} /> : <span className="size-[26px] rounded-full bg-surface-2" />}
                    </button>
                  ) : r.author ? (
                    <Link href={memberHref(r.author.id)} aria-label={r.author.name} className="shrink-0">
                      <MemberAvatar m={r.author} size={26} />
                    </Link>
                  ) : (
                    <span className="size-[26px] shrink-0 rounded-full bg-surface-2" aria-hidden />
                  )}
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 text-[12.5px]">
                    {r.author ? (
                      <Link href={memberHref(r.author.id)} className="truncate font-semibold text-ink hover:underline">
                        {r.author.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink-3">{r.hidden ? "Someone you blocked" : r.deleted ? "Deleted" : "Former member"}</span>
                    )}
                    {r.byOp && <span className="rounded bg-brand-50 px-1 text-[10.5px] font-bold text-brand-700">OP</span>}
                    {to && <span className="text-ink-3">↪ {to.author?.name ?? "a reply"}</span>}
                    <span className="text-ink-4">· {relativeTime(r.at)}</span>
                    {r.editedAt && <span className="text-ink-4">· edited</span>}
                    {r.isNew && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold uppercase text-white">New</span>}
                  </span>
                  {menu.length > 0 && !isFolded && <Menu label="Reply options" items={menu} trigger={() => <span className="grid size-8 place-items-center rounded-full text-ink-4 hover:bg-bg-soft hover:text-ink"><MoreHorizontal className="size-4" aria-hidden /></span>} />}
                </div>
                {isFolded ? (
                  <button type="button" onClick={() => toggle(r.id)} className="ml-9 mt-0.5 text-[12.5px] font-semibold text-brand-600 hover:underline">
                    + {descendants} more repl{descendants === 1 ? "y" : "ies"}
                  </button>
                ) : (
                  <div className="ml-9">
                    {editing === r.id ? (
                      <Editor start={r.body} onCancel={() => setEditing(null)} onSave={(b) => save(r.id, b)} max={LIMITS.reply} />
                    ) : r.deleted || r.hidden ? (
                      <p className="text-[13px] italic text-ink-3">{r.hidden ? "Hidden: you or they blocked the other." : "This reply was deleted."}</p>
                    ) : (
                      <p className="whitespace-pre-line break-words text-[14px] leading-relaxed text-ink [overflow-wrap:anywhere]">{r.body}</p>
                    )}
                    {!r.deleted && !r.hidden && (
                      <div className="-ml-2 mt-0.5 flex items-center gap-0.5">
                        <Votes small score={r.score} mine={r.myVote} disabled={!member} onVote={(v) => castVote(r.id, r.myVote, v)} />
                        {canReply && (
                          <button type="button" onClick={() => setAnswering(answering === r.id ? null : r.id)} className="inline-flex min-h-8 items-center gap-1 rounded-[8px] px-2 text-[12.5px] font-semibold text-ink-3 hover:bg-bg-soft hover:text-ink">
                            <MessageCircle className="size-3.5" aria-hidden /> Reply
                          </button>
                        )}
                      </div>
                    )}
                    {answering === r.id && <Composer autoFocus placeholder={`Reply to ${r.author?.name.split(" ")[0] ?? "this"}`} onSend={(b) => send(b, r.id)} onCancel={() => setAnswering(null)} className="mb-1 mt-1" />}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {replies.length === 0 && <p className="rounded-[16px] border border-dashed border-line p-6 text-center text-[13.5px] text-ink-3">No replies yet.</p>}

      {newIds.length > 0 && (
        <button type="button" onClick={nextNew} className="fixed bottom-[calc(var(--wj-mobile-nav-h,0px)+6.5rem)] left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white shadow-lg md:bottom-24">
          <ArrowDown className="size-4" aria-hidden /> Next new · {newIds.length}
        </button>
      )}
      {/* Join the conversation (owner, 2026-11-22): one bar at the bottom that opens the reply box, instead of a box
          under the post. */}
      <JoinBar canReply={canReply} member={member} locked={d.locked} community={community} onSend={(b) => send(b, null)} />
      {reporting && (
        <ReportSheet
          title="Report this"
          who={reporting.who}
          send={(reason) => communityApi.report(d.id, reporting.id, reason)}
          onClose={() => setReporting(null)}
          onDone={() => setReporting(null)}
        />
      )}
    </div>
  );
}

function Byline({ author, at, editedAt, op }: { author: Discussion["author"]; at: string; editedAt?: string; op?: boolean }) {
  return (
    <div className="mt-2 flex items-center gap-2.5">
      {author ? (
        <Link href={memberHref(author.id)} aria-label={author.name}>
          <MemberAvatar m={author} size={36} />
        </Link>
      ) : (
        <span className="size-9 rounded-full bg-surface-2" aria-hidden />
      )}
      <span className="min-w-0 text-[12.5px]">
        <span className="flex items-center gap-1.5">
          {author ? (
            <Link href={memberHref(author.id)} className="truncate font-semibold text-ink hover:underline">
              {author.name}
            </Link>
          ) : (
            <span className="font-medium text-ink-3">Former member</span>
          )}
          {op && author && <span className="rounded bg-brand-50 px-1 text-[10.5px] font-bold text-brand-700">OP</span>}
        </span>
        <span className="block text-ink-3">
          {relativeTime(at)}
          {editedAt ? " · edited" : ""}
          {author?.headline ? ` · ${author.headline}` : ""}
        </span>
      </span>
    </div>
  );
}

/** Up and down arrows with the score between them; pressing your own vote again takes it back. */
function Votes({ score, mine, disabled, onVote, small }: { score: number; mine: Vote; disabled?: boolean; onVote: (v: 1 | -1) => void; small?: boolean }) {
  const icon = small ? "size-4" : "size-5";
  const btn = cn("grid place-items-center rounded-full disabled:opacity-50", small ? "size-8" : "size-9");
  return (
    <span className={cn("inline-flex items-center rounded-full", mine === 1 ? "bg-brand-50" : mine === -1 ? "bg-danger-100" : "bg-surface-2")}>
      <button type="button" disabled={disabled} aria-pressed={mine === 1} aria-label="Upvote" onClick={() => onVote(1)} className={cn(btn, mine === 1 ? "text-brand-600" : "text-ink-3 hover:text-brand-600")}>
        <ArrowBigUp className={icon} fill={mine === 1 ? "currentColor" : "none"} aria-hidden />
      </button>
      <span className={cn("min-w-[1.5ch] text-center font-semibold tabular-nums", small ? "text-[12.5px]" : "text-[13px]", mine === 1 ? "text-brand-700" : mine === -1 ? "text-danger-600" : "text-ink-2")} aria-label={`Score ${score}`}>
        {score}
      </span>
      <button type="button" disabled={disabled} aria-pressed={mine === -1} aria-label="Downvote" onClick={() => onVote(-1)} className={cn(btn, mine === -1 ? "text-danger-600" : "text-ink-3 hover:text-danger-600")}>
        <ArrowBigDown className={icon} fill={mine === -1 ? "currentColor" : "none"} aria-hidden />
      </button>
    </span>
  );
}

/** The bar at the bottom: "+ Join the conversation", opening the reply box in place; the round + and ⋯ step aside. */
function JoinBar({ canReply, member, locked, community, onSend }: { canReply: boolean; member: boolean; locked: boolean; community: Community; onSend: (body: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  useBottomBar(true);
  // Floats just above the bottom bar, clear of its raised Network button.
  const where = "fixed inset-x-0 bottom-[calc(var(--wj-mobile-nav-h,0px)+1.75rem)] z-30 px-4 md:bottom-4 lg:left-[var(--wj-sidebar-w,0px)]";
  if (!member)
    return (
      <div className={where}>
        <Link href={`/app/network/communities/${community.id}`} className="mx-auto flex h-12 max-w-3xl items-center gap-2 rounded-full border border-line bg-surface px-4 text-[14px] text-ink-3 shadow-lg">
          <Plus className="size-5" aria-hidden /> Join {community.name} to take part
        </Link>
      </div>
    );
  if (!canReply)
    return (
      <div className={where}>
        <p className="mx-auto flex h-12 max-w-3xl items-center gap-2 rounded-full border border-line bg-surface px-4 text-[14px] text-ink-3 shadow-lg">
          <Lock className="size-4" aria-hidden /> {locked ? "Locked: new replies are closed" : "Replies are closed"}
        </p>
      </div>
    );
  return (
    <div className={where}>
      <div className="mx-auto max-w-3xl">
        {open ? (
          <Composer className="shadow-xl" autoFocus placeholder="Join the conversation" onSend={async (b) => {
            await onSend(b);
            setOpen(false);
          }} onCancel={() => setOpen(false)} />
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="flex h-12 w-full items-center gap-2 rounded-full border border-line bg-surface px-4 text-left text-[14px] text-ink-3 shadow-lg hover:border-brand-300">
            <Plus className="size-5" aria-hidden /> Join the conversation
          </button>
        )}
      </div>
    </div>
  );
}

function Composer({ placeholder, onSend, onCancel, autoFocus, className }: { placeholder: string; onSend: (body: string) => Promise<void>; onCancel?: () => void; autoFocus?: boolean; className?: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={cn("rounded-[14px] border border-line bg-surface p-2 focus-within:border-brand-300", className)}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        try {
          await onSend(text.trim());
          setText("");
        } catch (err) {
          toast.error("Couldn't reply", (err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <textarea autoFocus={autoFocus} value={text} onChange={(e) => setText(e.target.value)} rows={text.split("\n").length > 2 ? 4 : 2} maxLength={LIMITS.reply} placeholder={placeholder} aria-label={placeholder} className="w-full resize-none bg-transparent px-1.5 py-1 text-[14px] text-ink outline-none placeholder:text-ink-4" />
      <div className="flex justify-end gap-1.5">
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" loading={busy} disabled={!text.trim()}>
          Reply
        </Button>
      </div>
    </form>
  );
}

function Editor({ start, title, onSave, onCancel, max }: { start: string; title?: string; onSave: (body: string, title?: string) => Promise<void>; onCancel: () => void; max: number }) {
  const [body, setBody] = useState(start);
  const [t, setT] = useState(title ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-2 flex flex-col gap-2">
      {title !== undefined && <input value={t} onChange={(e) => setT(e.target.value)} maxLength={LIMITS.title} aria-label="Title" className="rounded-[10px] border border-line bg-surface px-3 py-2 text-[14.5px] font-semibold text-ink outline-none focus:border-brand-300" />}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={max} aria-label="Text" className="rounded-[10px] border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-brand-300" />
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(body, title !== undefined ? t : undefined);
            } catch (e) {
              toast.error("Couldn't save", (e as Error).message);
              setBusy(false);
            }
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
