"use client";
import Link from "next/link";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowBigUp, Lock, MessageCircle, MoreHorizontal, Pin, Plus, UsersRound } from "lucide-react";
import { can, LIMITS, type Community, type CommunityMember, type CommunityRole, type Discussion, type ThreadSort } from "@/domain/network/communities";
import { communityApi, type MemberAction } from "@/services/network/client";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Button } from "@/components/common/Button";
import { Field, Input, Textarea } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { EmptyState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { Menu, type MenuItem } from "@/components/network/FeedCard";
import { BackButton, CommunityAvatar, CommunitySheet, ModuleChip, PrivacyChip } from "@/components/network/community";
import { MemberAvatar, memberHref } from "@/components/network/parts";

type Tab = "discussions" | "members" | "about";
const SORTS: { id: ThreadSort; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "new", label: "New" },
  { id: "top", label: "Top" },
];

/** One community: its discussions (Active, New, Top), its members, and what it's about. */
function CommunityPage({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (["members", "about"].includes(params.get("tab") ?? "") ? params.get("tab") : "discussions") as Tab;
  const [sort, setSort] = useState<ThreadSort>("active");
  const [c, setC] = useState<Community | null>(null);
  const [list, setList] = useState<Discussion[] | null>(null);
  const [failed, setFailed] = useState("");
  const [editing, setEditing] = useState(false);
  const [writing, setWriting] = useState(false);
  const load = useCallback(() => {
    communityApi
      .get(id, sort)
      .then((d) => {
        setC(d.community);
        setList(d.discussions);
      })
      .catch((e) => setFailed((e as Error).message));
  }, [id, sort]);
  useEffect(load, [load]);

  if (failed) return <EmptyState icon={<UsersRound className="size-6" aria-hidden />} title="Community not available" body={failed} action={{ label: "Communities", href: "/app/network/communities" }} />;
  if (!c || !list) return <PageLoading />;
  const role = c.me?.status === "member" ? c.me.role : undefined;
  const go = (t: Tab) => router.replace(t === "discussions" ? `/app/network/communities/${id}` : `/app/network/communities/${id}?tab=${t}`);
  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast.success(done);
      load();
    } catch (e) {
      toast.error("That didn't go through", (e as Error).message);
    }
  };
  const menu: MenuItem[] = [
    ...(can.manage(role) ? [{ label: "Edit community", onPick: () => setEditing(true) }] : []),
    ...(c.me && c.me.role !== "owner" ? [{ label: c.me.status === "pending" ? "Cancel request" : "Leave community", onPick: () => act(() => communityApi.leave(id), "Done") }] : []),
    ...(can.manage(role)
      ? [
          {
            label: "Delete community",
            onPick: () => {
              if (window.confirm(`Delete ${c.name} and all its discussions? This can't be undone.`)) void communityApi.remove(id).then(() => router.push("/app/network/communities"), (e) => toast.error("Couldn't delete it", (e as Error).message));
            },
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={c.name} back={{ href: "/app/network/communities", label: "Communities" }} className="max-lg:hidden" />
      <BackButton fallback="/app/network/communities" label="Back" className="mb-3 lg:hidden" />
      <header className="mb-3 overflow-hidden rounded-[18px] border border-line bg-surface">
        <div className="h-16 bg-gradient-to-r from-brand-500/90 via-brand-400/80 to-pink-400/80" aria-hidden />
        <div className="-mt-7 flex items-end gap-3 px-4">
          <CommunityAvatar c={c} size={60} className="ring-4 ring-surface" />
          <div className="ml-auto flex items-center gap-1.5 pb-1">
            {!c.me ? (
              <Button size="sm" onClick={() => act(() => communityApi.join(id), c.joinPolicy === "approval" ? "Request sent" : `You joined ${c.name}`)}>
                {c.joinPolicy === "approval" ? "Ask to join" : "Join"}
              </Button>
            ) : c.me.status === "pending" ? (
              <span className="rounded-full bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium text-ink-2">Request sent</span>
            ) : (
              <span className="rounded-full bg-brand-50 px-3 py-1.5 text-[12.5px] font-semibold text-brand-700">{role === "owner" ? "Owner" : role === "moderator" ? "Moderator" : "Joined"}</span>
            )}
            {menu.length > 0 && (
              <Menu label="Community options" items={menu} trigger={() => <span className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-bg-soft hover:text-ink"><MoreHorizontal className="size-5" aria-hidden /></span>} />
            )}
          </div>
        </div>
        <div className="px-4 pb-3 pt-2">
          <h1 className="text-[19px] font-semibold leading-tight text-ink lg:hidden">{c.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-3">
            <PrivacyChip c={c} />
            <span>· {c.members} member{c.members === 1 ? "" : "s"}</span>
            <ModuleChip module={c.module} />
          </p>
          {c.about && <p className="mt-1.5 line-clamp-3 text-[13.5px] text-ink-2">{c.about}</p>}
        </div>
        <nav aria-label="Community" className="grid grid-cols-3 border-t border-line">
          {(["discussions", "members", "about"] as Tab[]).map((t) => (
            <button key={t} type="button" aria-pressed={tab === t} onClick={() => go(t)} className={cn("min-h-11 border-b-2 text-[13.5px] capitalize", tab === t ? "border-brand-600 font-semibold text-brand-700" : "border-transparent text-ink-3 hover:text-ink")}>
              {t}
            </button>
          ))}
        </nav>
      </header>

      {tab === "discussions" &&
        (!c.canRead ? (
          <p className="rounded-[16px] border border-line bg-surface p-4 text-[13.5px] text-ink-2">
            <Lock className="mr-1.5 inline size-4 text-ink-3" aria-hidden />
            This community is private. {c.me?.status === "pending" ? "Its moderators will look at your request." : "Ask to join to read and take part."}
          </p>
        ) : (
          <>
            <div className="mb-2.5 flex items-center gap-1.5">
              {SORTS.map((s) => (
                <button key={s.id} type="button" aria-pressed={sort === s.id} onClick={() => setSort(s.id)} className={cn("min-h-8 rounded-full px-3 text-[12.5px] font-semibold", sort === s.id ? "bg-ink text-white" : "bg-surface text-ink-2 ring-1 ring-line hover:bg-bg-soft")}>
                  {s.label}
                </button>
              ))}
              {role && (
                <Button size="sm" className="ml-auto" onClick={() => setWriting(true)} icon={<Plus className="size-4" aria-hidden />}>
                  New discussion
                </Button>
              )}
            </div>
            {list.length === 0 ? (
              <p className="rounded-[16px] border border-dashed border-line p-6 text-center text-[13.5px] text-ink-3">{role ? "No discussions yet. Start the first one." : "No discussions yet."}</p>
            ) : (
              <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
                {list.map((d) => (
                  <li key={d.id} className="border-b border-line last:border-0">
                    <Link href={`/app/network/communities/${id}/${d.id}`} className="flex gap-3 px-3.5 py-3 hover:bg-bg-soft">
                      {d.author ? <MemberAvatar m={d.author} size={32} className="mt-0.5" /> : <span className="mt-0.5 size-8 shrink-0 rounded-full bg-surface-2" aria-hidden />}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-1.5">
                          {d.pinned && <Pin className="mt-1 size-3.5 shrink-0 text-brand-600" aria-label="Pinned" />}
                          {d.locked && <Lock className="mt-1 size-3.5 shrink-0 text-ink-3" aria-label="Locked" />}
                          <span className={cn("line-clamp-2 text-[14.5px] leading-snug text-ink", d.unread ? "font-semibold" : "font-medium")}>{d.title}</span>
                          {!!d.unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" aria-label="New" />}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-ink-3">
                          <span className="truncate">{d.author?.name ?? "Former member"}</span>
                          <span className="inline-flex items-center gap-1">
                            <MessageCircle className="size-3.5" aria-hidden /> {d.replies}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <ArrowBigUp className="size-3.5" aria-hidden /> {d.score}
                          </span>
                          <span>{relativeTime(d.lastActivityAt)}</span>
                          {d.about && <ModuleChip module={d.about.module} />}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        ))}

      {tab === "members" && <Members c={c} role={role} />}

      {tab === "about" && (
        <div className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-4">
          <section>
            <h2 className="mb-1 text-[14px] font-semibold text-ink">About</h2>
            <p className="whitespace-pre-line text-[13.5px] text-ink-2">{c.about || "No description yet."}</p>
          </section>
          {c.rules && (
            <section>
              <h2 className="mb-1 text-[14px] font-semibold text-ink">Rules</h2>
              <ol className="list-decimal space-y-0.5 pl-5 text-[13.5px] text-ink-2">
                {c.rules.split("\n").filter((l) => l.trim()).map((l, i) => (
                  <li key={i}>{l.replace(/^\s*(\d+[.)]|[-•*])\s*/, "")}</li>
                ))}
              </ol>
            </section>
          )}
          <p className="text-[12px] text-ink-3">Started {relativeTime(c.createdAt)}</p>
        </div>
      )}

      {editing && (
        <CommunitySheet
          start={c}
          onClose={() => setEditing(false)}
          save={async (input) => {
            setC((await communityApi.update(id, input)).community);
            setEditing(false);
            toast.success("Saved");
          }}
        />
      )}
      {writing && (
        <NewDiscussion
          community={c.name}
          onClose={() => setWriting(false)}
          send={async (title, body) => {
            const { discussion } = await communityApi.discuss(id, title, body);
            router.push(`/app/network/communities/${id}/${discussion.id}`);
          }}
        />
      )}
    </div>
  );
}

function Members({ c, role }: { c: Community; role: CommunityRole | undefined }) {
  const [data, setData] = useState<{ members: CommunityMember[]; requests: CommunityMember[] } | null>(null);
  const [failed, setFailed] = useState("");
  const load = useCallback(() => {
    communityApi
      .members(c.id)
      .then(setData)
      .catch((e) => setFailed((e as Error).message));
  }, [c.id]);
  useEffect(load, [load]);
  if (failed) return <p className="rounded-[16px] border border-line bg-surface p-4 text-[13.5px] text-ink-3">{failed}</p>;
  if (!data) return <PageLoading rows={3} />;
  const act = async (m: CommunityMember, a: MemberAction, done: string) => {
    try {
      await communityApi.act(c.id, m.member.id, a);
      toast.success(done);
      load();
    } catch (e) {
      toast.error("That didn't go through", (e as Error).message);
    }
  };
  const actions = (m: CommunityMember): MenuItem[] => {
    if (!can.moderate(role) || m.role === "owner" || (m.role === "moderator" && !can.manage(role))) return [];
    return [
      ...(can.manage(role) ? (m.role === "moderator" ? [{ label: "Make member", onPick: () => act(m, "make_member", "Now a member") }, { label: "Make owner", onPick: () => act(m, "make_owner", "Now an owner") }] : [{ label: "Make moderator", onPick: () => act(m, "make_moderator", "Now a moderator") }]) : []),
      { label: "Remove from community", onPick: () => act(m, "remove", "Removed") },
      { label: "Ban", onPick: () => act(m, "ban", "Banned") },
    ];
  };
  return (
    <div className="flex flex-col gap-4">
      {data.requests.length > 0 && (
        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">Asking to join · {data.requests.length}</h2>
          <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
            {data.requests.map((m) => (
              <li key={m.member.id} className="flex items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-0">
                <Link href={memberHref(m.member.id)} className="flex min-w-0 flex-1 items-center gap-3">
                  <MemberAvatar m={m.member} size={36} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-ink">{m.member.name}</span>
                    {m.member.headline && <span className="block truncate text-[12px] text-ink-3">{m.member.headline}</span>}
                  </span>
                </Link>
                <Button size="sm" onClick={() => act(m, "approve", "Approved")}>
                  Approve
                </Button>
                <Button size="sm" variant="ghost" onClick={() => act(m, "decline", "Declined")}>
                  Decline
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">Members · {data.members.length}</h2>
        <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
          {data.members.map((m) => {
            const items = actions(m);
            return (
              <li key={m.member.id} className="flex items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-0">
                <Link href={memberHref(m.member.id)} className="flex min-w-0 flex-1 items-center gap-3">
                  <MemberAvatar m={m.member} size={36} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-ink">{m.member.name}</span>
                    {m.member.headline && <span className="block truncate text-[12px] text-ink-3">{m.member.headline}</span>}
                  </span>
                </Link>
                {m.role !== "member" && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-brand-700">{m.role}</span>}
                {items.length > 0 && <Menu label={`Options for ${m.member.name}`} items={items} trigger={() => <span className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-bg-soft"><MoreHorizontal className="size-4" aria-hidden /></span>} />}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function NewDiscussion({ community, onClose, send }: { community: string; onClose: () => void; send: (title: string, body: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="New discussion"
      description={`In ${community}`}
      size="md"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={title.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                await send(title, body);
              } catch (e) {
                toast.error("Couldn't start it", (e as Error).message);
                setBusy(false);
              }
            }}
          >
            Post
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Title" htmlFor="dz-title">
          <Input id="dz-title" autoFocus maxLength={LIMITS.title} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ask a question or start a topic" />
        </Field>
        <Field label="Details (optional)" htmlFor="dz-body">
          <Textarea id="dz-body" rows={6} maxLength={LIMITS.body} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add context so people can answer well" />
        </Field>
      </div>
    </Modal>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<PageLoading />}>
      <CommunityPage id={id} />
    </Suspense>
  );
}
