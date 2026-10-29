"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Eye, EyeOff, MessagesSquare } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { talentProfileFrom } from "@/domain/org/talent";
import type { TalentProfile } from "@/domain/org/types";
import { hiringApi, type ConversationView } from "@/services/hiring/client";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/wonderstar/chrome/PageHeader";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { Thread } from "@/components/hiring/Thread";

/**
 * Recruiters (owner, 2026-10-20): whether companies on WonderJobs can find the job seeker and write to them —
 * off until they turn it on, showing exactly what recruiters see — and their conversations with companies.
 */
function RecruitersPage() {
  const dna = useCareerStore((s) => s.dna);
  const params = useSearchParams();
  const router = useRouter();
  const [profile, setProfile] = useState<TalentProfile | null | undefined>(undefined);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<ConversationView[] | null>(null);
  const open = params.get("c");

  const loadList = useCallback(() => {
    hiringApi
      .myConversations()
      .then((d) => setList(d.conversations))
      .catch(() => setList([]));
  }, []);
  useEffect(() => {
    hiringApi
      .myProfile()
      .then((d) => {
        setProfile(d.profile);
        setSummary(d.profile?.summary ?? "");
      })
      .catch(() => setProfile(null));
    loadList();
  }, [loadList]);

  const preview = useMemo(() => talentProfileFrom(dna, summary), [dna, summary]);
  const save = async () => {
    setBusy(true);
    try {
      const { profile: p } = await hiringApi.saveProfile(preview);
      setProfile(p);
      toast.success(profile ? "Recruiters see your update" : "You're open to recruiters", "Companies on WonderWorks can now find you and write to you here.");
    } catch (e) {
      toast.error("Couldn't save", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      await hiringApi.removeProfile();
      setProfile(null);
      toast.info("You're hidden from recruiters", "Companies can't find you or start new conversations. Existing ones stay here.");
    } catch (e) {
      toast.error("Couldn't turn it off", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (profile === undefined) return <PageLoading />;
  const on = !!profile;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Recruiters" description="Let companies on WonderWorks find you and write to you about roles." />

      <Card className="mb-5">
        <div className="flex items-center gap-3">
          {on ? <Eye className="size-5 text-success-600" aria-hidden /> : <EyeOff className="size-5 text-ink-4" aria-hidden />}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-ink">{on ? "Open to recruiters" : "Hidden from recruiters"}</p>
            <p className="text-[12px] text-ink-3">{on ? `Last updated ${relativeTime(profile.updatedAt)}.` : "Off until you turn it on. Only what's below is ever shown."}</p>
          </div>
        </div>

        {/* Exactly what recruiters see — nothing else from the account (no email, phone or work history). */}
        <div className="mt-4 rounded-[14px] border border-line bg-surface-2 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">What recruiters see</p>
          <p className="mt-1 text-[15px] font-semibold text-ink">{preview.displayName}</p>
          <p className="text-[13px] text-ink-2">{preview.headline || "No headline yet"}</p>
          <p className="mt-1 text-[12px] text-ink-3">{[preview.seniority, preview.yearsExperience ? `${preview.yearsExperience} years` : "", preview.locations.join(", "), preview.workModes.join(" / ")].filter(Boolean).join(" · ")}</p>
          {preview.skills.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1">
              {preview.skills.map((s) => (
                <li key={s} className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink-2">
                  {s}
                </li>
              ))}
            </ul>
          )}
          <label className="mt-3 block text-[12px] font-medium text-ink-2" htmlFor="pitch">
            A line for recruiters (optional)
          </label>
          <textarea id="pitch" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={600} rows={2} placeholder="What you're looking for next" className="mt-1 w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-brand-500" />
          <p className="mt-1 text-[11px] text-ink-4">From your Career Profile; change it there. Recruiters see an update only when you press {on ? "Update" : "Turn on"}.</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={save} loading={busy}>
            {on ? "Update what recruiters see" : "Turn on"}
          </Button>
          {on && (
            <button type="button" onClick={turnOff} disabled={busy} className="min-h-10 text-[13px] font-medium text-ink-3 hover:text-ink">
              Turn off
            </button>
          )}
        </div>
      </Card>

      <h2 className="mb-2 inline-flex items-center gap-1.5 text-[15px] font-semibold text-ink">
        <MessagesSquare className="size-4 text-brand-600" aria-hidden /> Messages from companies
      </h2>
      {list === null ? (
        <p className="text-[13px] text-ink-3">Loading…</p>
      ) : list.length === 0 ? (
        <p className="rounded-[16px] border border-line bg-surface p-4 text-[13px] text-ink-3">{on ? "No messages yet. When a recruiter writes to you, it shows here and you get a notification." : "Turn on Open to recruiters to let companies write to you."}</p>
      ) : (
        <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
          {list.map((c) => (
            <li key={c.id} className="border-b border-line last:border-b-0">
              <button type="button" onClick={() => router.replace(open === c.id ? "/app/recruiters" : `/app/recruiters?c=${c.id}`)} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2", open === c.id && "bg-surface-2")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{c.orgName}</span>
                  <span className="block truncate text-[12px] text-ink-3">{c.last ? `${c.last.side === "candidate" ? "You: " : ""}${c.last.body}` : "No messages"}</span>
                </span>
                <span className="shrink-0 text-[11px] text-ink-4">{c.status !== "open" ? (c.status === "blocked" ? "Blocked" : "Declined") : c.last ? relativeTime(c.last.createdAt) : ""}</span>
                <ChevronRight className={cn("size-4 shrink-0 text-ink-4 transition-transform", open === c.id && "rotate-90")} aria-hidden />
              </button>
              {open === c.id && (
                <div className="border-t border-line px-4 py-3">
                  <Thread id={c.id} onChange={loadList} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <RecruitersPage />
    </Suspense>
  );
}
