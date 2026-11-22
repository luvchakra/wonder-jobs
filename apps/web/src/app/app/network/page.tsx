"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, Settings2, UserCheck, Users, UsersRound, type LucideIcon } from "lucide-react";
import type { MemberView, NetworkProfile } from "@/domain/network/network";
import { networkApi, type MyNetwork, type NetUpdate, type Suggested } from "@/services/network/client";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { EmptyState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { ConnectSheet, PersonCard, PersonRow, mutualLine } from "@/components/network/parts";
import { FeedCard, ReportSheet } from "@/components/network/FeedCard";
import { NetworkBar } from "@/components/network/NetworkBell";
import { useNetworkInbox } from "@/components/network/inbox";
import { usePostTarget } from "@/wonderworks/chrome/postTarget";
import dynamic from "next/dynamic";

const PostSheet = dynamic(() => import("@/components/network/PostSheet").then((m) => m.PostSheet), { ssr: false });

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
  const [posting, setPosting] = useState(false);

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
  // Answering an invitation from the bell changes the Connections count here too: read it again when that count drops.
  const invites = useNetworkInbox((st) => st.invitations?.length);
  const lastInvites = useRef(invites);
  useEffect(() => {
    const before = lastInvites.current;
    lastInvites.current = invites;
    if (on && before !== undefined && invites !== undefined && invites < before) void networkApi.mine().then(setMine, () => {});
  }, [invites, on]);
  // A post made from the + (here or in any module) shows at once: the feed is read again.
  const posted = usePostTarget((st) => st.posted);
  const [seenPosted, setSeenPosted] = useState(posted);
  if (posted !== seenPosted) {
    setSeenPosted(posted);
    setFeed(null);
  }
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
      // The bell's invitation count follows.
      void useNetworkInbox.getState().load();
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
      {/* Below 1024px the top bar carries the title; phones post with the floating +, which tablets and desktops don't
          have, so from 768px the + is here. */}
      <PageHeader
        title="My network"
        className="max-lg:hidden"
        actions={
          <div className="flex items-center gap-2">
            {/* From 1024px there's no top bar: the network's Messages and invitations bell sit here. */}
            <NetworkBar compact />
            <Button onClick={() => setPosting(true)} icon={<Plus className="size-4" aria-hidden />}>
              New post
            </Button>
          </div>
        }
      />
      <div className="mb-3 hidden justify-end md:flex lg:hidden">
        <Button onClick={() => setPosting(true)} icon={<Plus className="size-4" aria-hidden />}>
          New post
        </Button>
      </div>
      {posting && <PostSheet onClose={() => setPosting(false)} />}
      {/* Invitations are on the bell and Messages beside it, in the top bar (owner, 2026-11-22); Communities comes first. */}
      <nav aria-label="My network" className="mb-4 grid grid-cols-4 gap-1">
        <Shortcut icon={UsersRound} label="Communities" href="/app/network/communities" />
        <Shortcut icon={Users} label="People" active={view === "people"} onClick={() => go("people")} />
        <Shortcut icon={UserCheck} label="Connections" badge={mine?.connections.length} quiet active={view === "connections"} onClick={() => go("connections")} />
        <Shortcut icon={Settings2} label="My profile" href="/app/network/profile" />
      </nav>

      {view === "feed" && (
        <>
          {feed === null ? (
            <PageLoading rows={2} />
          ) : feed.length === 0 ? (
            <p className="rounded-[16px] border border-line bg-surface p-4 text-[13px] text-ink-3">Nothing here yet. Press + to post, or find people under People: what your connections post, their new roles and the listings they share show here.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {feed.map((u) => (
                <FeedCard
                  key={u.id}
                  u={u}
                  onReport={() => setReporting(u)}
                  onReshared={() => setFeed(null)}
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
        <ReportSheet
          title="Report this post"
          who={reporting.member.name}
          send={(reason) => networkApi.reportUpdate(reporting.id, reason)}
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

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NetworkPage />
    </Suspense>
  );
}
