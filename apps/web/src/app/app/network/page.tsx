"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Settings2, Users } from "lucide-react";
import type { MemberView, NetworkProfile } from "@/domain/network/network";
import { networkApi, type MyNetwork, type Suggested } from "@/services/network/client";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { EmptyState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { ConnectSheet, PersonCard, PersonRow, mutualLine } from "@/components/network/parts";

/**
 * My network (owner, 2026-11-20): the middle tab of every module. People to connect with, the requests waiting, and
 * the member's connections. Off until they set up their network profile; nothing is searched until they type.
 */
type Tab = "people" | "invitations" | "connections";
const TABS: Tab[] = ["people", "invitations", "connections"];

function NetworkPage() {
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab = TABS.includes(params.get("tab") as Tab) ? (params.get("tab") as Tab) : "people";
  const [me, setMe] = useState<NetworkProfile | null | undefined>(undefined);
  const [failed, setFailed] = useState<string | null>(null);
  const [mine, setMine] = useState<MyNetwork | null>(null);
  const [list, setList] = useState<Suggested[] | null>(null);
  const [q, setQ] = useState("");
  const [searched, setSearched] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<MemberView | null>(null);

  const load = useCallback(() => {
    networkApi
      .me()
      .then(({ profile }) => {
        setMe(profile);
        if (!profile) return;
        return Promise.all([networkApi.mine(), networkApi.people("")]).then(([m, p]) => {
          setMine(m);
          setList(p.people);
        });
      })
      .catch((e) => setFailed((e as Error).message));
  }, []);
  useEffect(load, [load]);

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
      setMine(await networkApi.mine());
    } catch (e) {
      toast.error("That didn't go through", (e as Error).message);
    }
  };

  if (failed) return <EmptyState icon={<Users className="size-6" aria-hidden />} title="Network is unavailable" body={failed} />;
  if (me === undefined) return <PageLoading />;
  if (me === null)
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="My network" description="Connect with other people on WonderWorks, across every module." />
        <EmptyState
          icon={<Users className="size-6" aria-hidden />}
          title="Join the network"
          body="Your network profile comes from your Career Profile. You choose who can find you and what each part shows, and you can leave any time. Only people on the network can see each other."
          action={{ label: "Set up my network profile", href: "/app/network/profile" }}
        />
      </div>
    );

  const counts = { people: 0, invitations: mine?.invitations.length ?? 0, connections: mine?.connections.length ?? 0 };
  const label = (t: Tab) => (t === "people" ? "People" : t === "invitations" ? `Invitations${counts.invitations ? ` · ${counts.invitations}` : ""}` : `Connections${counts.connections ? ` · ${counts.connections}` : ""}`);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="My network"
        actions={
          <Link href="/app/network/profile" className="inline-flex min-h-10 items-center gap-1.5 text-[13px] font-semibold text-brand-600 hover:underline">
            <Settings2 className="size-4" aria-hidden /> My network profile
          </Link>
        }
      />
      <div role="tablist" aria-label="My network" className="mb-4 grid grid-cols-3 border-b border-line">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => router.replace(t === "people" ? "/app/network" : `/app/network?tab=${t}`)} className={cn("-mb-px min-h-11 border-b-2 px-1 text-[13.5px]", tab === t ? "border-brand-600 font-semibold text-brand-600" : "border-transparent text-ink-3")}>
            {label(t)}
          </button>
        ))}
      </div>

      {tab === "people" && (
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
          <h2 className="mb-2 text-[15px] font-semibold text-ink">{searched ? `People matching “${searched}”` : "People you may know"}</h2>
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

      {tab === "invitations" &&
        (!mine ? (
          <PageLoading rows={2} />
        ) : (
          <>
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

      {tab === "connections" &&
        (!mine ? (
          <PageLoading rows={2} />
        ) : mine.connections.length === 0 ? (
          <p className="rounded-[16px] border border-line bg-surface p-4 text-[13px] text-ink-3">No connections yet. Find people under People and press Connect.</p>
        ) : (
          <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
            {mine.connections.map((m) => (
              <PersonRow key={m.id} m={m} sub={m.location} />
            ))}
          </ul>
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
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NetworkPage />
    </Suspense>
  );
}
