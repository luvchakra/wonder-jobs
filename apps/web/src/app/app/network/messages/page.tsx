"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, MessagesSquare } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/common/Button";
import { networkApi } from "@/services/network/client";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Avatar } from "@/components/common/Avatar";
import { EmptyState, PageLoading } from "@/components/common/States";

const NewMessageSheet = dynamic(() => import("@/components/network/NewMessageSheet").then((m) => m.NewMessageSheet), { ssr: false });

/**
 * One inbox (owner, 2026-11-20): every conversation the member has on WonderWorks in one list — connections, companies
 * (Recruiters), co-founders and buyers or sellers. Each row opens where that conversation lives; nothing is copied here.
 * It reads each module's own list once, in parallel, and a list that fails is simply left out.
 */
type Kind = "connection" | "recruiter" | "cofounder" | "market";
interface Row {
  key: string;
  kind: Kind;
  name: string;
  line: string;
  at: string;
  href: string;
  photo?: string;
  round: boolean;
}
const KINDS: { id: Kind; chip: string; tag: string; tone: string }[] = [
  { id: "connection", chip: "Connections", tag: "Connection", tone: "bg-brand-50 text-brand-700" },
  { id: "recruiter", chip: "Recruiters", tag: "Recruiter", tone: "bg-info-100 text-info-600" },
  { id: "cofounder", chip: "Co-founders", tag: "Co-founder", tone: "bg-success-100 text-success-600" },
  { id: "market", chip: "Buy & Sell", tag: "Buy & Sell", tone: "bg-warning-100 text-warning-600" },
];

const get = async <T,>(url: string): Promise<T | null> => {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
};

async function loadAll(): Promise<Row[]> {
  const [net, rec, cof, mkt] = await Promise.all([
    networkApi.threads().catch(() => null),
    get<{ conversations: { id: string; orgName: string; status: string; updatedAt: string; last?: { side: string; body: string; createdAt: string } }[] }>("/api/conversations"),
    get<{ connections: { id: string; canMessage: boolean; updatedAt: string; counterpart: { title: string; kind: string } }[] }>("/api/m/cofounders/connections"),
    get<{ threads: { id: string; title: string; side: string; updatedAt: string }[] }>("/api/m/marketplace/threads"),
  ]);
  const rows: Row[] = [];
  for (const t of net?.threads ?? []) rows.push({ key: `n:${t.id}`, kind: "connection", name: t.member.name, line: t.last ? `${t.last.mine ? "You: " : ""}${t.last.body}` : "", at: t.at, href: `/app/network/messages/${encodeURIComponent(t.id)}`, photo: t.member.photo ? networkApi.photoUrl(t.member.id) : undefined, round: true });
  for (const c of rec?.conversations ?? []) rows.push({ key: `r:${c.id}`, kind: "recruiter", name: c.orgName, line: c.last ? `${c.last.side === "candidate" ? "You: " : ""}${c.last.body}` : c.status === "open" ? "" : c.status === "blocked" ? "Blocked" : "Declined", at: c.last?.createdAt ?? c.updatedAt, href: `/app/recruiters?c=${encodeURIComponent(c.id)}`, round: false });
  for (const c of (cof?.connections ?? []).filter((x) => x.canMessage)) rows.push({ key: `c:${c.id}`, kind: "cofounder", name: c.counterpart.title, line: c.counterpart.kind === "team" ? "A team in Co-founders" : "A founder in Co-founders", at: c.updatedAt, href: `/app/m/cofounders/pipeline/${encodeURIComponent(c.id)}`, round: true });
  for (const t of mkt?.threads ?? []) rows.push({ key: `m:${t.id}`, kind: "market", name: t.title, line: t.side === "seller" ? "Someone asked about your listing" : "You asked about this listing", at: t.updatedAt, href: `/app/m/marketplace/pipeline/${encodeURIComponent(t.id)}`, round: false });
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export default function InboxPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [only, setOnly] = useState<Kind | null>(null);
  const [writing, setWriting] = useState(false);
  useEffect(() => {
    void loadAll().then(setRows);
  }, []);
  const shown = useMemo(() => (rows ?? []).filter((r) => !only || r.kind === only), [rows, only]);
  const have = useMemo(() => new Set((rows ?? []).map((r) => r.kind)), [rows]);
  const chip = (on: boolean) => cn("min-h-9 shrink-0 rounded-full border px-3 text-[12.5px] font-semibold", on ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-ink-2");

  return (
    <div className="mx-auto max-w-2xl">
      {/* Phones start a message from the + (New message); from 768px it is here. */}
      <PageHeader
        title="Messages"
        back={{ href: "/app/network", label: "My network" }}
        actions={
          <Button onClick={() => setWriting(true)} icon={<MessageSquarePlus className="size-4" aria-hidden />} className="max-md:hidden">
            New message
          </Button>
        }
      />
      {writing && <NewMessageSheet onClose={() => setWriting(false)} />}
      {rows === null ? (
        <PageLoading />
      ) : rows.length === 0 ? (
        <EmptyState icon={<MessagesSquare className="size-6" aria-hidden />} title="No conversations yet" body="Messages with your connections, companies, co-founders and buyers or sellers all show here. To write to a connection, press + and New message, or Message on their profile." action={{ label: "My network", href: "/app/network?tab=connections" }} />
      ) : (
        <>
          {have.size > 1 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              <button type="button" aria-pressed={!only} onClick={() => setOnly(null)} className={chip(!only)}>
                All
              </button>
              {KINDS.filter((k) => have.has(k.id)).map((k) => (
                <button key={k.id} type="button" aria-pressed={only === k.id} onClick={() => setOnly(only === k.id ? null : k.id)} className={chip(only === k.id)}>
                  {k.chip}
                </button>
              ))}
            </div>
          )}
          <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
            {shown.map((r) => {
              const k = KINDS.find((x) => x.id === r.kind)!;
              return (
                <li key={r.key} className="border-b border-line last:border-b-0">
                  <Link href={r.href} className="flex gap-3 px-4 py-3 hover:bg-surface-2">
                    <Avatar name={r.name} size={48} photo={r.photo} className={r.round ? undefined : "rounded-[12px]"} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{r.name}</span>
                        <span className="shrink-0 text-[11.5px] text-ink-3">{r.at ? relativeTime(r.at) : ""}</span>
                      </span>
                      <span className={cn("self-start rounded-full px-2 py-px text-[10.5px] font-semibold", k.tone)}>{k.tag}</span>
                      {r.line && <span className="truncate text-[12.5px] text-ink-3">{r.line}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-center text-[11.5px] text-ink-3">On the network, only your connections can message you.</p>
        </>
      )}
    </div>
  );
}
