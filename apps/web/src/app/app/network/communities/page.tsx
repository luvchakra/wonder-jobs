"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, UsersRound } from "lucide-react";
import type { Community } from "@/domain/network/communities";
import { communityApi } from "@/services/network/client";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { EmptyState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { CommunityAvatar, CommunitySheet, ModuleChip, PrivacyChip } from "@/components/network/community";
import { useSelectedModule } from "@/wonderworks/chrome/useModuleNav";

/**
 * Communities (owner, 2026-11-22): the member's own first, with what's new in each, then public ones to discover.
 * One search box, one New community button.
 */
export default function CommunitiesPage() {
  const router = useRouter();
  // Browsing from a module, communities about it come first in Discover.
  const selected = useSelectedModule();
  const [data, setData] = useState<{ mine: Community[]; discover: Community[] } | null>(null);
  const [failed, setFailed] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const load = useCallback((words = "") => {
    communityApi
      .list(words, selected)
      .then(setData)
      .catch((e) => setFailed((e as Error).message));
  }, [selected]);
  useEffect(() => load(), [load]);

  if (failed) return <EmptyState icon={<UsersRound className="size-6" aria-hidden />} title="Communities are unavailable" body={failed} action={{ label: "My network", href: "/app/network" }} />;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Communities"
        back={{ href: "/app/network", label: "My network" }}
        actions={
          <Button onClick={() => setCreating(true)} icon={<Plus className="size-4" aria-hidden />}>
            New community
          </Button>
        }
      />
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load(q.trim());
        }}
      >
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search communities" aria-label="Search communities" className="min-w-0 flex-1" />
        <Button type="submit" variant="outline" icon={<Search className="size-4" aria-hidden />}>
          Search
        </Button>
      </form>
      {data === null ? (
        <PageLoading rows={3} />
      ) : (
        <>
          {data.mine.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">Yours</h2>
              <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
                {data.mine.map((c) => (
                  <Row key={c.id} c={c} />
                ))}
              </ul>
            </section>
          )}
          <section>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-3">{q.trim() ? "Found" : "Discover"}</h2>
            {data.discover.length ? (
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {data.discover.map((c) => (
                  <li key={c.id}>
                    <Link href={`/app/network/communities/${c.id}`} className="flex h-full flex-col gap-2 rounded-[16px] border border-line bg-surface p-3.5 transition-colors hover:border-brand-200 hover:bg-bg-soft">
                      <span className="flex items-center gap-3">
                        <CommunityAvatar c={c} size={40} />
                        <span className="min-w-0">
                          <span className="block truncate text-[14.5px] font-semibold text-ink">{c.name}</span>
                          <span className="block text-[12px] text-ink-3">
                            {c.members} member{c.members === 1 ? "" : "s"} · {c.discussions} discussion{c.discussions === 1 ? "" : "s"}
                          </span>
                        </span>
                      </span>
                      {c.about && <span className="line-clamp-2 text-[13px] text-ink-2">{c.about}</span>}
                      <span className="flex flex-wrap items-center gap-2">
                        <PrivacyChip c={c} />
                        <ModuleChip module={c.module} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-[16px] border border-line bg-surface p-4 text-[13px] text-ink-3">{q.trim() ? `No community matches “${q.trim()}”. Start one with New community.` : "No other communities yet. Start the first with New community."}</p>
            )}
          </section>
        </>
      )}
      {creating && (
        <CommunitySheet
          onClose={() => setCreating(false)}
          save={async (input) => {
            const { community } = await communityApi.create(input);
            toast.success("Community created", "Invite people by sharing it, or start the first discussion.");
            router.push(`/app/network/communities/${community.id}`);
          }}
        />
      )}
    </div>
  );
}

function Row({ c }: { c: Community }) {
  return (
    <li className="border-b border-line last:border-0">
      <Link href={`/app/network/communities/${c.id}`} className="flex items-center gap-3 px-3.5 py-3 hover:bg-bg-soft">
        <CommunityAvatar c={c} size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[14.5px] font-semibold text-ink">{c.name}</span>
            <ModuleChip module={c.module} className="shrink-0" />
          </span>
          <span className="block truncate text-[12px] text-ink-3">
            {c.me?.status === "pending" ? "Request sent" : c.me?.role === "owner" ? "Owner" : c.me?.role === "moderator" ? "Moderator" : "Member"} · {c.members} member{c.members === 1 ? "" : "s"}
          </span>
        </span>
        {!!c.unread && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">{c.unread} new</span>}
      </Link>
    </li>
  );
}
