"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessagesSquare, Search, Settings2, UserCheck, UserPlus, Users, type LucideIcon } from "lucide-react";
import type { MemberView, NetworkProfile } from "@/domain/network/network";
import { networkApi, type MyNetwork, type NetUpdate, type Suggested } from "@/services/network/client";
import { relativeTime } from "@/lib/format";
import { moduleById } from "@/modules/registry";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Avatar } from "@/components/common/Avatar";
import { Button } from "@/components/common/Button";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { EmptyState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { ConnectSheet, MemberAvatar, PersonCard, PersonRow, memberHref, mutualLine } from "@/components/network/parts";

/**
 * My network (owner, 2026-11-20): the middle tab of every module. It opens on the feed (owner, 2026-11-21): what the
 * member's connections post and do, and posts addressed to everyone on the network, with a box to post. People,
 * Invitations, Connections, Messages and My profile are the icons above it. Off until the member sets up their
 * network profile; nothing is searched until they type.
 */
type View = "feed" | "people" | "invitations" | "connections";
const VIEWS: View[] = ["people", "invitations", "connections"];

function NetworkPage() {
  const params = useSearchParams();
  const router = useRouter();
  const view: View = VIEWS.includes(params.get("tab") as View) ? (params.get("tab") as View) : "feed";
  const [me, setMe] = useState<NetworkProfile | null | undefined>(undefined);
  const [failed, setFailed] = useState<string | null>(null);
  const [mine, setMine] = useState<MyNetwork | null>(null);
  const [list, setList] = useState<Suggested[] | null>(null);
  const [feed, setFeed] = useState<NetUpdate[] | null>(null);
  const [q, setQ] = useState("");
  const [searched, setSearched] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<MemberView | null>(null);
  const [reporting, setReporting] = useState<NetUpdate | null>(null);

  const loadFeed = useCallback(() => {
    networkApi
      .updates()
      .then((d) => setFeed(d.updates))
      .catch(() => setFeed([]));
  }, []);
  // On open: the profile, then the counts for the icons. The feed and the people list load with their own view.
  const load = useCallback(() => {
    networkApi
      .me()
      .then(({ profile }) => {
        setMe(profile);
        if (profile) return networkApi.mine().then(setMine);
      })
      .catch((e) => setFailed((e as Error).message));
  }, []);
  useEffect(load, [load]);
  const on = !!me;
  const wantFeed = on && view === "feed" && feed === null;
  const wantPeople = on && view === "people" && list === null;
  useEffect(() => {
    if (wantFeed) loadFeed();
  }, [wantFeed, loadFeed]);
  useEffect(() => {
    if (!wantPeople) return;
    networkApi
      .people("")
      .then((d) => setList(d.people))
      .catch(() => setList([]));
  }, [wantPeople]);

  const search = async (text: string) => {
    setBusy(true);
    try {
      setList((await networkApi.people(text)).people);
      setSearched(text.trim());
    } catch (e) {
      toast.error("Couldn't search", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const act = async (m: MemberView, action: "accept" | "ignore" | "withdraw", done: string) => {
    if (!m.connectionId) return;
    try {
      await networkApi.act(m.connectionId, action);
      toast.success(done);
      // Every list shows where each person stands, so they are read again.
      const [net, found] = await Promise.all([networkApi.mine(), networkApi.people(searched)]);
      setMine(net);
      setList(found.people);
      setFeed(null);
    } catch (e) {
      toast.error("That didn't go through", (e as Error).message);
    }
  };

  if (failed) return <EmptyState icon={<Users className="size-6" aria-hidden />} title="Network is unavailable" body={failed} />;
  if (me === undefined) return <PageLoading />;
  if (me === null)
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="My network" description="Connect with other people on WonderWorks, across every module." className="max-lg:hidden" />
        <EmptyState
          icon={<Users className="size-6" aria-hidden />}
          title="Join the network"
          body="Your network profile comes from your Career Profile. You choose who can find you and what each part shows, and you can leave any time. Only people on the network can see each other."
          action={{ label: "Set up my network profile", href: "/app/network/profile" }}
        />
      </div>
    );

  const go = (v: View) => router.replace(v === "feed" || v === view ? "/app/network" : `/app/network?tab=${v}`);
  return (
    <div className="mx-auto max-w-3xl">
      {/* Below 1024px the top bar carries the title; from there the page does. */}
      <PageHeader title="My network" className="max-lg:hidden" />
      <nav aria-label="My network" className="mb-4 grid grid-cols-5 gap-1">
        <Shortcut icon={Users} label="People" active={view === "people"} onClick={() => go("people")} />
        <Shortcut icon={UserPlus} label="Invitations" badge={mine?.invitations.length} active={view === "invitations"} onClick={() => go("invitations")} />
        <Shortcut icon={UserCheck} label="Connections" badge={mine?.connections.length} quiet active={view === "connections"} onClick={() => go("connections")} />
        <Shortcut icon={MessagesSquare} label="Messages" href="/app/network/messages" />
        <Shortcut icon={Settings2} label="My profile" href="/app/network/profile" />
      </nav>

      {view === "feed" && (
        <>
          <Composer name={me.name} onPosted={() => setFeed(null)} />
          {feed === null ? (
            <PageLoading rows={2} />
          ) : feed.length === 0 ? (
            <p className="rounded-[16px] border border-line bg-surface p-4 text-[13px] text-ink-3">Nothing here yet. Post something, or find people under People: what your connections post, their new roles and the listings they share show here.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {feed.map((u) => (
                <FeedCard
                  key={u.id}
                  u={u}
                  onReport={() => setReporting(u)}
                  onDelete={async () => {
                    try {
                      await networkApi.deleteUpdate(u.id);
                      setFeed((f) => f?.filter((x) => x.id !== u.id) ?? f);
                    } catch (e) {
                      toast.error("Couldn't remove it", (e as Error).message);
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {view === "people" && (
        <>
          <form
            className="mb-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void search(q);
            }}
          >
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people by name, skill or company" aria-label="Search people" className="min-w-0 flex-1" />
            <Button type="submit" loading={busy} icon={<Search className="size-4" aria-hidden />}>
              Search
            </Button>
          </form>
          <h2 className="mb-2 text-[15px] font-semibold text-ink">{searched ? `People matching “${searched}”` : list?.some((m) => m.relation !== "none") ? "People" : "People you may know"}</h2>
          {list === null ? (
            <PageLoading rows={2} />
          ) : list.length === 0 ? (
            <p className="rounded-[16px] border border-line bg-surface p-4 text-[13px] text-ink-3">{searched ? "No one on the network matches every word. Try fewer words." : "No suggestions yet. They come from shared skills and mutual connections, as more people join. You can search by name."}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
              {list.map((m) => (
                <PersonCard key={m.id} m={m} onConnect={setAsking} />
              ))}
            </ul>
          )}
        </>
      )}

      {view === "invitations" &&
        (!mine ? (
          <PageLoading rows={2} />
        ) : (
          <>
            <h2 className="mb-2 text-[15px] font-semibold text-ink">Invitations</h2>
            {mine.invitations.length === 0 ? (
              <p className="rounded-[16px] border border-line bg-surface p-4 text-[13px] text-ink-3">No invitations waiting. When someone asks to connect, it shows here and you get a notification.</p>
            ) : (
              <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
                {mine.invitations.map((m) => (
                  <PersonRow key={m.id} m={m} sub={[m.how, m.note ? `“${m.note}”` : "", mutualLine(m)].filter(Boolean).join(" · ")}>
                    <Button size="sm" onClick={() => act(m, "accept", `You and ${m.name} are connected`)}>
                      Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act(m, "ignore", "Ignored. They aren't told.")}>
                      Ignore
                    </Button>
                  </PersonRow>
                ))}
              </ul>
            )}
            {mine.sent.length > 0 && (
              <>
                <h2 className="mb-2 mt-5 text-[15px] font-semibold text-ink">Sent · {mine.sent.length}</h2>
                <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
                  {mine.sent.map((m) => (
                    <PersonRow key={m.id} m={m} sub="Waiting for their answer">
                      <button type="button" onClick={() => act(m, "withdraw", "Request withdrawn")} className="min-h-10 text-[13px] font-medium text-ink-3 hover:text-ink">
                        Withdraw
                      </button>
                    </PersonRow>
                  ))}
                </ul>
              </>
            )}
          </>
        ))}

      {view === "connections" &&
        (!mine ? (
          <PageLoading rows={2} />
        ) : (
          <>
            <h2 className="mb-2 text-[15px] font-semibold text-ink">Connections{mine.connections.length ? ` · ${mine.connections.length}` : ""}</h2>
            {mine.connections.length === 0 ? (
              <p className="rounded-[16px] border border-line bg-surface p-4 text-[13px] text-ink-3">No connections yet. Find people under People and press Connect.</p>
            ) : (
              <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
                {mine.connections.map((m) => (
                  <PersonRow key={m.id} m={m} sub={m.location} />
                ))}
              </ul>
            )}
          </>
        ))}

      {asking && (
        <ConnectSheet
          m={asking}
          onClose={() => setAsking(null)}
          onSent={(sent) => {
            toast.success(`Request sent to ${sent.name}`, "They can accept or ignore it.");
            setList((l) => l?.map((x) => (x.id === sent.id ? { ...x, ...sent } : x)) ?? l);
            void networkApi.mine().then(setMine).catch(() => undefined);
          }}
        />
      )}
      {reporting && (
        <ReportPost
          u={reporting}
          onClose={() => setReporting(null)}
          onDone={() => {
            // The reporter stops seeing it at once.
            setFeed((f) => f?.filter((x) => x.id !== reporting.id) ?? f);
            setReporting(null);
          }}
        />
      )}
    </div>
  );
}

/** One of the icons above the feed: a view of this page (pressed again, it goes back to the feed) or a page of its own. */
function Shortcut({ icon: Icon, label, badge, quiet, active, href, onClick }: { icon: LucideIcon; label: string; badge?: number; /** A plain count, not something waiting. */ quiet?: boolean; active?: boolean; href?: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className={cn("relative grid size-11 place-items-center rounded-full border transition-colors", active ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-brand-600")}>
        <Icon className="size-5" aria-hidden />
        {!!badge && <span className={cn("absolute -right-1.5 -top-1 grid min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-semibold leading-[18px]", quiet ? "bg-surface-2 text-ink-2 ring-1 ring-line" : "bg-danger-600 text-white")}>{badge > 99 ? "99+" : badge}</span>}
      </span>
      <span className={cn("max-w-full truncate text-[11px] leading-tight", active ? "font-semibold text-brand-600" : "font-medium text-ink-2")}>{label}</span>
    </>
  );
  const cls = "flex min-w-0 flex-col items-center gap-1 rounded-[12px] py-1";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" aria-pressed={active} aria-label={badge ? `${label} · ${badge}` : label} onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** The box to post from. It shows what goes and to whom, so Post is the confirmation. */
function Composer({ name, onPosted }: { name: string; onPosted: () => void }) {
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<"connections" | "everyone">("connections");
  const [busy, setBusy] = useState(false);
  const post = async () => {
    setBusy(true);
    try {
      await networkApi.post(text.trim(), audience);
      setText("");
      toast.success("Posted", audience === "everyone" ? "Everyone on the network can see it." : "Your connections can see it.");
      onPosted();
    } catch (e) {
      toast.error("Couldn't post", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="mb-3 rounded-[16px] border border-line bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) void post();
      }}
    >
      <div className="flex items-start gap-3">
        <Avatar name={name} size={40} self />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={text ? 3 : 1} maxLength={1500} placeholder="Share something with your network" aria-label="Write a post" className="min-h-10 flex-1 resize-none bg-transparent py-2 text-[14px] text-ink outline-none placeholder:text-ink-4" />
      </div>
      {text.trim() && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-2">
          <Select value={audience} onChange={(e) => setAudience(e.target.value as "connections" | "everyone")} aria-label="Who sees this post" className="h-9 w-auto min-w-0">
            <option value="connections">My connections</option>
            <option value="everyone">Everyone on the network</option>
          </Select>
          <Button type="submit" size="sm" loading={busy}>
            Post
          </Button>
        </div>
      )}
    </form>
  );
}

/** One thing in the feed: a post in its author's words, or something a connection did, with one way on. */
function FeedCard({ u, onDelete, onReport }: { u: NetUpdate; onDelete: () => void; onReport: () => void }) {
  const post = u.kind === "post" || u.kind === "post:everyone";
  const shared = u.kind === "shared";
  const moduleLabel = moduleById(u.module)?.label ?? "";
  const quiet = "min-h-9 text-[12.5px] font-medium text-ink-3 hover:text-ink";
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
            {post && <span>· {u.kind === "post:everyone" ? "Everyone on the network" : "Connections"}</span>}
            {moduleLabel && <span className="rounded-full bg-brand-50 px-2 py-px text-[10.5px] font-semibold text-brand-700">{moduleLabel}</span>}
          </p>
        </div>
      </div>
      <p className="mt-2 whitespace-pre-line break-words text-[14px] leading-relaxed text-ink [overflow-wrap:anywhere]">{post ? u.text : `${u.member.name.split(" ")[0]} ${u.text}`}</p>
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
        {u.mine ? (
          <button type="button" onClick={onDelete} className={cn(quiet, "ml-auto")}>
            Delete
          </button>
        ) : (
          post && (
            <button type="button" onClick={onReport} className={cn(quiet, "ml-auto")}>
              Report
            </button>
          )
        )}
      </div>
    </li>
  );
}

function ReportPost({ u, onClose, onDone }: { u: NetUpdate; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Report this post"
      description={`${u.member.name} isn't told who reported it. You stop seeing it at once.`}
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
                await networkApi.reportUpdate(u.id, reason.trim());
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
      <Field label="What's wrong?" htmlFor="post-report">
        <Textarea id="post-report" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NetworkPage />
    </Suspense>
  );
}
