"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, UserCheck, UserPlus, Users } from "lucide-react";
import type { MemberView } from "@/domain/network/network";
import { networkApi } from "@/services/network/client";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { EmptyState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { ConnectSheet, MemberAvatar, Place, StatusChips, mutualLine } from "@/components/network/parts";

/** A member's network profile, as this viewer may see it: only the parts their settings allow (the server decides). */
export default function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [m, setM] = useState<MemberView | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    networkApi
      .member(id)
      .then((d) => setM(d.member))
      .catch((e) => {
        setError((e as Error).message);
        setM(null);
      });
  }, [id]);
  useEffect(load, [load]);

  if (m === undefined) return <PageLoading />;
  if (m === null) {
    const join = /Turn on your network profile/.test(error);
    return <EmptyState icon={<Users className="size-6" aria-hidden />} title={join ? "Join the network to see people" : "Profile not available"} body={error} action={join ? { label: "Set up my network profile", href: "/app/network/profile" } : { label: "Back to My network", href: "/app/network" }} />;
  }

  const act = async (action: "accept" | "ignore" | "withdraw" | "remove", done: string) => {
    if (!m.connectionId) return;
    setBusy(true);
    try {
      await networkApi.act(m.connectionId, action);
      toast.success(done);
      load();
    } catch (e) {
      toast.error("That didn't go through", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const degree = m.relation === "connected" ? "1st" : m.relation !== "self" && m.mutual > 0 ? "2nd" : "";
  const first = m.name.split(" ")[0];
  const facts = [m.connections !== undefined ? `${m.connections} connection${m.connections === 1 ? "" : "s"}` : "", m.relation === "self" ? "" : mutualLine(m)].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={m.name} back={{ href: "/app/network", label: "My network" }} />
      <section className="overflow-hidden rounded-[16px] border border-line bg-surface pb-4">
        <div className="wj-gradient-bg h-24" aria-hidden />
        <div className="px-4">
          <MemberAvatar m={m} size={104} className="-mt-[52px] ring-4 ring-surface" />
          <p className="mt-2.5 text-[22px] font-bold leading-tight text-ink">
            {m.name} {degree && <span className="text-[13px] font-medium text-ink-3">· {degree}</span>}
          </p>
          {m.headline && <p className="mt-0.5 break-words text-[14px] text-ink-2">{m.headline}</p>}
          <Place m={m} />
          {facts && <p className="mt-1 text-[12.5px] text-ink-3">{facts}</p>}
          <StatusChips statuses={m.statuses} className="mt-2.5" />
          {m.relation === "pending_in" && (m.note || m.how) && <p className="mt-3 rounded-[12px] bg-surface-2 p-3 text-[13px] text-ink-2">{[m.how, m.note ? `“${m.note}”` : ""].filter(Boolean).join(" · ")}</p>}
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {m.relation === "self" && (
              <Button href="/app/network/profile" variant="outline">
                Edit my network profile
              </Button>
            )}
            {m.relation === "none" && m.canRequest && (
              <Button onClick={() => setAsking(true)} icon={<UserPlus className="size-4" aria-hidden />}>
                Connect
              </Button>
            )}
            {m.relation === "none" && !m.canRequest && <p className="text-[13px] text-ink-3">{first} isn&apos;t taking connection requests right now.</p>}
            {m.relation === "pending_out" && (
              <>
                <span className="inline-flex h-10 items-center rounded-full border border-line px-4 text-[14px] font-medium text-ink-3">Requested</span>
                <button type="button" disabled={busy} onClick={() => act("withdraw", "Request withdrawn")} className="min-h-10 text-[13px] font-medium text-ink-3 hover:text-ink">
                  Withdraw
                </button>
              </>
            )}
            {m.relation === "pending_in" && (
              <>
                <Button loading={busy} onClick={() => act("accept", `You and ${m.name} are connected`)}>
                  Accept
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => act("ignore", "Ignored. They aren't told.")}>
                  Ignore
                </Button>
              </>
            )}
            {m.relation === "connected" && (
              <span className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line px-4 text-[14px] font-medium text-ink-2">
                <UserCheck className="size-4 text-success-600" aria-hidden /> Connected
              </span>
            )}
          </div>
        </div>
      </section>

      {m.about && (
        <section className="mt-3 rounded-[16px] border border-line bg-surface p-4">
          <h2 className="mb-1.5 text-[16px] font-semibold text-ink">About</h2>
          <p className="whitespace-pre-line break-words text-[13px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{m.about}</p>
        </section>
      )}
      {m.experience && (
        <section className="mt-3 rounded-[16px] border border-line bg-surface p-4">
          <h2 className="mb-3 text-[16px] font-semibold text-ink">Experience</h2>
          <ul className="flex flex-col gap-3.5">
            {m.experience.map((e, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-[14px] font-bold text-brand-600" aria-hidden>
                  {(e.org || e.title).slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block break-words text-[14px] font-semibold text-ink">{e.title}</span>
                  <span className="block break-words text-[12.5px] text-ink-2">{e.org}</span>
                  <span className="block text-[12px] text-ink-3">{[[e.start, e.current ? "now" : e.end].filter(Boolean).join(" – "), e.location].filter(Boolean).join(" · ")}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {m.education && (
        <section className="mt-3 rounded-[16px] border border-line bg-surface p-4">
          <h2 className="mb-3 text-[16px] font-semibold text-ink">Education</h2>
          <ul className="flex flex-col gap-3.5">
            {m.education.map((e, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-brand-600" aria-hidden>
                  <GraduationCap className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block break-words text-[14px] font-semibold text-ink">{e.school}</span>
                  <span className="block break-words text-[12.5px] text-ink-2">{[e.degree, e.end].filter(Boolean).join(" · ")}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {m.skills && m.skills.length > 0 && (
        <section className="mt-3 rounded-[16px] border border-line bg-surface p-4">
          <h2 className="mb-2 text-[16px] font-semibold text-ink">Skills</h2>
          <ul className="flex flex-wrap gap-1.5">
            {m.skills.map((s) => (
              <li key={s} className={cn("max-w-full truncate rounded-full px-2.5 py-0.5 text-[12px]", m.sharedSkills.includes(s) ? "bg-brand-50 font-medium text-brand-700" : "bg-surface-2 text-ink-2")}>
                {s}
              </li>
            ))}
          </ul>
          {m.relation !== "self" && m.sharedSkills.length > 0 && <p className="mt-2 text-[11.5px] text-ink-3">Highlighted: skills you share</p>}
        </section>
      )}

      {m.relation !== "self" && (
        <Fold title="Remove, block or report" className="mt-3">
          <div className="flex flex-col gap-3 pb-4">
            {m.relation === "connected" && (
              <Button variant="outline" size="sm" className="self-start" disabled={busy} onClick={() => act("remove", "Connection removed. They aren't told.")}>
                Remove connection
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await networkApi.block(m.id);
                  toast.success(`${first} is blocked`, "You no longer see each other on the network. They aren't told.");
                  router.replace("/app/network");
                } catch (e) {
                  toast.error("Couldn't block", (e as Error).message);
                  setBusy(false);
                }
              }}
            >
              Block {first}
            </Button>
            <label className="text-[12px] font-medium text-ink-2" htmlFor="net-report">
              Report this profile
            </label>
            <textarea id="net-report" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} placeholder="What's wrong?" className="w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand-500" />
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={busy || reason.trim().length < 3}
              onClick={async () => {
                try {
                  const r = await networkApi.report(m.id, reason.trim());
                  toast.success(r.repeated ? "You already reported this profile" : "Reported", "Our team reviews reports. They aren't told who reported.");
                  setReason("");
                } catch (e) {
                  toast.error("Couldn't report", (e as Error).message);
                }
              }}
            >
              Send report
            </Button>
          </div>
        </Fold>
      )}

      {asking && (
        <ConnectSheet
          m={m}
          onClose={() => setAsking(false)}
          onSent={(sent) => {
            toast.success(`Request sent to ${sent.name}`, "They can accept or ignore it.");
            setM(sent);
          }}
        />
      )}
    </div>
  );
}
