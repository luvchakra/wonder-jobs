"use client";
/**
 * Community moderation, as on Reddit (owner, 2026-11-23): adding members from your connections, the mod team and its
 * permissions, removing with a reason, bans for a time, and the Mod tools tab (the queue, the log, AutoMod).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bot, Check, Search, ShieldCheck, X } from "lucide-react";
import { BAN_DAYS, MOD_PERMS, type AutoMod, type Community, type ModLogEntry, type ModPerm, type QueueItem } from "@/domain/network/communities";
import type { MemberView } from "@/domain/network/network";
import { communityApi } from "@/services/network/client";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "@/components/common/Button";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { MemberAvatar } from "./parts";

const fail = (e: unknown) => toast.error("That didn't go through", (e as Error).message);

/** The words for a set of permissions. */
export const permWords = (perms: ModPerm[] | undefined) => (perms ?? []).map((p) => MOD_PERMS.find((m) => m.key === p)?.label ?? p).join(", ");

/* ---- adding members ------------------------------------------------------------------------------------------- */

/** Invite connections: a search over the moderator's connections who aren't in it, tick, Invite. */
export function AddMembersSheet({ community, onClose, onDone }: { community: Community; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<MemberView[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      communityApi
        .candidates(community.id, q.trim())
        .then((d) => setPeople(d.people))
        .catch((e) => {
          setPeople([]);
          fail(e);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [community.id, q]);
  const flip = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));
  return (
    <Modal
      open
      onClose={onClose}
      title="Add members"
      description={`Invite your connections to ${community.name}. They join with one tap, or decline.`}
      size="md"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!picked.size}
            onClick={async () => {
              setBusy(true);
              try {
                const { invited } = await communityApi.invite(community.id, [...picked]);
                toast.success(invited ? `Invited ${invited} ${invited === 1 ? "person" : "people"}` : "Nobody new to invite");
                onDone();
              } catch (e) {
                fail(e);
                setBusy(false);
              }
            }}
          >
            Invite{picked.size ? ` ${picked.size}` : ""}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 rounded-[12px] border border-line bg-surface px-3">
          <Search className="size-4 text-ink-4" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your connections" aria-label="Search your connections" className="min-h-11 flex-1 bg-transparent text-[14px] outline-none" />
        </label>
        {people === null ? (
          <PageLoading rows={2} />
        ) : people.length === 0 ? (
          <p className="rounded-[12px] bg-surface-2 p-3 text-[13px] text-ink-3">{q.trim() ? "None of your connections match." : "All your connections are already in, invited, or asking to join. Only your connections can be invited."}</p>
        ) : (
          <ul className="max-h-[50vh] overflow-y-auto rounded-[14px] border border-line">
            {people.map((p) => (
              <li key={p.id} className="border-b border-line last:border-0">
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-bg-soft">
                  <MemberAvatar m={p} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">{p.name}</span>
                    {p.headline && <span className="block truncate text-[12px] text-ink-3">{p.headline}</span>}
                  </span>
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => flip(p.id)} className="size-5 accent-brand-600" aria-label={`Invite ${p.name}`} />
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/* ---- the mod team --------------------------------------------------------------------------------------------- */

/** Choose a moderator's permissions: invite a member to moderate, or change a moderator's. */
export function PermsSheet({ who, start, inviting, onClose, save }: { who: string; start?: ModPerm[]; inviting: boolean; onClose: () => void; save: (perms: ModPerm[]) => Promise<void> }) {
  const [perms, setPerms] = useState<Set<ModPerm>>(new Set(start ?? ["everything"]));
  const [busy, setBusy] = useState(false);
  const flip = (k: ModPerm) =>
    setPerms((p) => {
      if (k === "everything") return p.has("everything") ? new Set() : new Set(["everything"]);
      const n = new Set([...p].filter((x) => x !== "everything"));
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  return (
    <Modal
      open
      onClose={onClose}
      title={inviting ? `Invite ${who} to moderate` : `${who}'s permissions`}
      description={inviting ? "They become a moderator once they accept." : undefined}
      size="sm"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!perms.size}
            onClick={async () => {
              setBusy(true);
              try {
                await save([...perms]);
              } catch (e) {
                fail(e);
                setBusy(false);
              }
            }}
          >
            {inviting ? "Send invitation" : "Save"}
          </Button>
        </div>
      }
    >
      <ul className="flex flex-col gap-1.5">
        {MOD_PERMS.map((m) => {
          const on = perms.has(m.key) || (m.key !== "everything" && perms.has("everything"));
          return (
            <li key={m.key}>
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-[12px] border px-3 py-2.5", on ? "border-brand-300 bg-brand-50" : "border-line bg-surface")}>
                <input type="checkbox" checked={on} disabled={m.key !== "everything" && perms.has("everything")} onChange={() => flip(m.key)} className="mt-0.5 size-4 accent-brand-600" />
                <span>
                  <span className="block text-[14px] font-semibold text-ink">{m.label}</span>
                  <span className="block text-[12px] text-ink-3">{m.detail}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/** Ban someone for a time or for good, with a reason they're told. */
export function BanSheet({ who, onClose, ban }: { who: string; onClose: () => void; ban: (days: number, reason: string) => Promise<void> }) {
  const [days, setDays] = useState<number>(7);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Ban ${who}`}
      description="They're taken out and can't see or join it until the ban ends. They're told, with your reason."
      size="sm"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await ban(days, reason.trim());
              } catch (e) {
                fail(e);
                setBusy(false);
              }
            }}
          >
            Ban
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="How long">
          {BAN_DAYS.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)} className={cn("min-h-9 rounded-full px-3.5 text-[13px] font-semibold ring-1", days === d ? "bg-ink text-white ring-ink" : "bg-surface text-ink-2 ring-line hover:bg-bg-soft")}>
              {d ? `${d} day${d === 1 ? "" : "s"}` : "Permanent"}
            </button>
          ))}
        </div>
        <Field label="Reason (they see it)" htmlFor="ban-reason">
          <Input id="ban-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Repeated spam" />
        </Field>
      </div>
    </Modal>
  );
}

/** Remove a post with a reason its author is told: one of the community's rules, or your own words. */
export function RemoveSheet({ rules, what, onClose, remove }: { rules: string; what: "discussion" | "reply"; onClose: () => void; remove: (reason: string) => Promise<void> }) {
  const lines = rules
    .split("\n")
    .map((l) => l.replace(/^\s*(\d+[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
  const [pick, setPick] = useState<string>(lines.length ? "rule:0" : "other");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const reason = pick === "other" ? other.trim() : `Rule ${Number(pick.slice(5)) + 1}: ${lines[Number(pick.slice(5))]}`;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Remove this ${what}`}
      description="It's kept for the moderators and its author, who's told why. Everyone else stops seeing it."
      size="sm"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await remove(reason);
              } catch (e) {
                fail(e);
                setBusy(false);
              }
            }}
          >
            Remove
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        {lines.map((l, i) => (
          <label key={i} className={cn("flex cursor-pointer items-start gap-2.5 rounded-[12px] border px-3 py-2", pick === `rule:${i}` ? "border-brand-300 bg-brand-50" : "border-line")}>
            <input type="radio" name="why" checked={pick === `rule:${i}`} onChange={() => setPick(`rule:${i}`)} className="mt-1 accent-brand-600" />
            <span className="text-[13.5px] text-ink">
              Rule {i + 1}: {l}
            </span>
          </label>
        ))}
        <label className={cn("flex cursor-pointer items-start gap-2.5 rounded-[12px] border px-3 py-2", pick === "other" ? "border-brand-300 bg-brand-50" : "border-line")}>
          <input type="radio" name="why" checked={pick === "other"} onChange={() => setPick("other")} className="mt-1 accent-brand-600" />
          <span className="text-[13.5px] text-ink">{lines.length ? "Another reason" : "Reason"}</span>
        </label>
        {pick === "other" && <Textarea rows={2} maxLength={300} value={other} onChange={(e) => setOther(e.target.value)} placeholder="Tell them why (optional)" aria-label="Reason" />}
      </div>
    </Modal>
  );
}

/** A small mark on a post that waits for review or was removed, with why for those who may see it. */
export function StateNote({ state, why }: { state?: "live" | "held" | "removed"; why?: string }) {
  if (!state || state === "live") return null;
  return (
    <p className={cn("mt-2 rounded-[10px] px-2.5 py-1.5 text-[12px]", state === "held" ? "bg-warning-100 text-warning-600" : "bg-danger-100 text-danger-600")}>
      <span className="font-semibold">{state === "held" ? "Waiting for a moderator's review" : "Removed by the moderators"}</span>
      {why ? ` · ${why}` : ""}
    </p>
  );
}

/* ---- Mod tools ------------------------------------------------------------------------------------------------ */

type View = "queue" | "log" | "automod";

/** The Mod tools tab: the queue (held and reported), the log, and AutoMod's rules. */
export function ModTools({ c, canReview, canSettings, onChanged }: { c: Community; canReview: boolean; canSettings: boolean; onChanged: () => void }) {
  const views: { id: View; label: string }[] = [...(canReview ? [{ id: "queue" as View, label: `Queue${c.queue ? ` · ${c.queue}` : ""}` }] : []), { id: "log", label: "Log" }, ...(canSettings ? [{ id: "automod" as View, label: "AutoMod" }] : [])];
  const [view, setView] = useState<View>(views[0].id);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {views.map((v) => (
          <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)} className={cn("min-h-8 rounded-full px-3 text-[12.5px] font-semibold", view === v.id ? "bg-ink text-white" : "bg-surface text-ink-2 ring-1 ring-line hover:bg-bg-soft")}>
            {v.label}
          </button>
        ))}
      </div>
      {view === "queue" && <Queue c={c} onChanged={onChanged} />}
      {view === "log" && <Log c={c} />}
      {view === "automod" && c.automod && <AutoModForm c={c} start={c.automod} />}
    </div>
  );
}

function Queue({ c, onChanged }: { c: Community; onChanged: () => void }) {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [removing, setRemoving] = useState<QueueItem | null>(null);
  const load = useCallback(() => {
    communityApi
      .queue(c.id)
      .then((d) => setItems(d.queue))
      .catch((e) => {
        setItems([]);
        fail(e);
      });
  }, [c.id]);
  useEffect(load, [load]);
  if (!items) return <PageLoading rows={2} />;
  const done = () => {
    load();
    onChanged();
  };
  if (!items.length)
    return (
      <p className="flex items-center gap-2 rounded-[16px] border border-line bg-surface p-4 text-[13.5px] text-ink-3">
        <Check className="size-4 text-success-600" aria-hidden /> Nothing waiting. Held and reported posts show here.
      </p>
    );
  return (
    <>
      <ul className="flex flex-col gap-2">
        {items.map((q) => (
          <li key={q.id} className="rounded-[16px] border border-line bg-surface p-3.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
              <span className={cn("rounded-full px-2 py-0.5 font-semibold", q.state === "held" ? "bg-warning-100 text-warning-600" : "bg-surface-2 text-ink-2")}>{q.state === "held" ? "Held" : `Reported${q.reports > 1 ? ` · ${q.reports}` : ""}`}</span>
              <span>{q.kind === "discussion" ? "Discussion" : "Reply"}</span>
              <span>· {q.author?.name ?? "Former member"}</span>
              <span>· {relativeTime(q.at)}</span>
            </div>
            <Link href={`/app/network/communities/${c.id}/${q.threadId}${q.kind === "reply" ? `#${q.id}` : ""}`} className="mt-1.5 block hover:underline">
              <span className="block text-[14px] font-semibold text-ink">{q.title}</span>
              {q.body && <span className="mt-0.5 line-clamp-3 block whitespace-pre-line text-[13px] text-ink-2">{q.body}</span>}
            </Link>
            {(q.why || q.reasons.length > 0) && <p className="mt-1.5 text-[12px] text-ink-3">{[q.why, ...q.reasons.map((r) => `“${r}”`)].filter(Boolean).join(" · ")}</p>}
            <div className="mt-2.5 flex gap-2">
              <Button size="sm" icon={<Check className="size-4" aria-hidden />} onClick={() => communityApi.review(q.threadId, q.id, "approve").then(() => (toast.success("Approved"), done()), fail)}>
                Approve
              </Button>
              <Button size="sm" variant="outline" icon={<X className="size-4" aria-hidden />} onClick={() => setRemoving(q)}>
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {removing && (
        <RemoveSheet
          rules={c.rules}
          what={removing.kind}
          onClose={() => setRemoving(null)}
          remove={async (reason) => {
            await communityApi.review(removing.threadId, removing.id, "remove", reason);
            setRemoving(null);
            toast.success("Removed");
            done();
          }}
        />
      )}
    </>
  );
}

function Log({ c }: { c: Community }) {
  const [rows, setRows] = useState<ModLogEntry[] | null>(null);
  useEffect(() => {
    communityApi
      .log(c.id)
      .then((d) => setRows(d.log))
      .catch((e) => {
        setRows([]);
        fail(e);
      });
  }, [c.id]);
  if (!rows) return <PageLoading rows={3} />;
  if (!rows.length) return <p className="rounded-[16px] border border-line bg-surface p-4 text-[13.5px] text-ink-3">Nothing yet. What moderators and AutoMod do shows here.</p>;
  return (
    <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
      {rows.map((r) => (
        <li key={r.id} className="flex items-start gap-3 border-b border-line px-3.5 py-2.5 last:border-0">
          {r.automod ? (
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600" aria-hidden>
              <Bot className="size-4" />
            </span>
          ) : r.by ? (
            <MemberAvatar m={r.by} size={32} />
          ) : (
            <span className="size-8 shrink-0 rounded-full bg-surface-2" aria-hidden />
          )}
          <span className="min-w-0 flex-1 text-[13px]">
            <span className="font-semibold text-ink">{r.automod ? "AutoMod" : (r.by?.name ?? "Former member")}</span> <span className="text-ink-2">{r.action.toLowerCase()}</span>
            {r.about && <span className="text-ink-2"> · {r.about.name}</span>}
            {r.target && <span className="block truncate text-ink-3">“{r.target}”</span>}
            {r.note && <span className="block text-[12px] text-ink-3">{r.note}</span>}
          </span>
          <span className="shrink-0 text-[11.5px] text-ink-4">{relativeTime(r.at)}</span>
        </li>
      ))}
    </ul>
  );
}

function AutoModForm({ c, start }: { c: Community; start: AutoMod }) {
  const [r, setR] = useState<AutoMod>(start);
  const [words, setWords] = useState(start.blockedWords.join(", "));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof AutoMod>(k: K, v: AutoMod[K]) => setR((x) => ({ ...x, [k]: v }));
  const num = (v: string) => Number.parseInt(v, 10) || 0;
  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-4">
      <label className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600" aria-hidden>
          <Bot className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold text-ink">AutoMod</span>
          <span className="block text-[12.5px] text-ink-3">An automatic moderator that checks every new discussion and reply by these rules. Moderators&apos; own posts pass.</span>
        </span>
        <input type="checkbox" checked={r.on} onChange={(e) => set("on", e.target.checked)} className="mt-1 size-5 accent-brand-600" aria-label="AutoMod on" />
      </label>
      <fieldset disabled={!r.on} className="flex flex-col gap-3 disabled:opacity-50">
        <Field label="Watched words or phrases (commas between)" htmlFor="am-words">
          <Textarea id="am-words" rows={2} value={words} onChange={(e) => setWords(e.target.value)} placeholder="e.g. casino, crypto pump, buy followers" />
        </Field>
        <Field label="A post with one of them" htmlFor="am-action">
          <Select id="am-action" value={r.blockedAction} onChange={(e) => set("blockedAction", e.target.value === "remove" ? "remove" : "hold")}>
            <option value="hold">Goes to the queue for review</option>
            <option value="remove">Is removed at once</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2.5 text-[13.5px] text-ink">
          <input type="checkbox" checked={r.holdLinksFromNew} onChange={(e) => set("holdLinksFromNew", e.target.checked)} className="size-4 accent-brand-600" /> Hold web links from new members
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="New member: joined in the last (days)" htmlFor="am-days">
            <Input id="am-days" type="number" min={0} max={30} value={r.newMemberDays} onChange={(e) => set("newMemberDays", num(e.target.value))} />
          </Field>
          <Field label="New member's posts a day before holding" htmlFor="am-daily">
            <Input id="am-daily" type="number" min={1} max={50} value={r.newMemberDailyPosts} onChange={(e) => set("newMemberDailyPosts", num(e.target.value))} />
          </Field>
        </div>
        <Field label="Hold a post once this many members report it" htmlFor="am-reports">
          <Input id="am-reports" type="number" min={1} max={20} value={r.reportsToHold} onChange={(e) => set("reportsToHold", num(e.target.value))} />
        </Field>
      </fieldset>
      <div className="flex justify-end">
        <Button
          loading={busy}
          icon={<ShieldCheck className="size-4" aria-hidden />}
          onClick={async () => {
            setBusy(true);
            try {
              const { automod } = await communityApi.setAutoMod(c.id, { ...r, blockedWords: words.split(/[,\n]/) });
              setR(automod);
              setWords(automod.blockedWords.join(", "));
              toast.success("AutoMod saved");
            } catch (e) {
              fail(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save AutoMod
        </Button>
      </div>
    </div>
  );
}

/** A note to show the author of a new post AutoMod held or removed. */
export const heldToast = (state?: string, why?: string) => {
  if (state === "held") toast.info("Waiting for review", `This community's AutoMod sent it to the moderators${why ? `: ${why}` : ""}. You can see it meanwhile.`);
  else if (state === "removed") toast.error("Removed by AutoMod", why ?? "It breaks this community's rules.");
};
