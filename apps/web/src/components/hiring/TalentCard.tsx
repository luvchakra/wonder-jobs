"use client";
import { Briefcase, FileText, MapPin, MessageSquare, UserPlus } from "lucide-react";
import type { TalentProfile } from "@/domain/org/types";
import { hiringApi } from "@/services/hiring/client";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/common/Avatar";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";

/**
 * A job seeker as a recruiter sees them, laid out like a professional profile card (owner, 2026-11-20: "make this card
 * useful for the hiring person, add photo of the user, link to full profile along with link of resume, make it look
 * similar to how LinkedIn profiles look"). Only what they chose to show: the photo and résumé appear only when they
 * turned each on, on You → Recruiters.
 */
const meta = (p: TalentProfile) => [p.seniority && cap(p.seniority), p.yearsExperience ? `${p.yearsExperience} years' experience` : ""].filter(Boolean).join(" · ");
// "Remote" as a place and as a work mode says the same thing once.
const where = (p: TalentProfile) => [p.locations.join(", "), p.workModes.filter((m) => !p.locations.some((l) => l.toLowerCase() === m.toLowerCase())).map(cap).join(" / ")].filter(Boolean).join(" · ");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const isMatched = (s: string, matched: string[]) => matched.some((m) => m.toLowerCase() === s.toLowerCase());

/** Matched skills first, so the card leads with why they came up. */
function orderedSkills(p: TalentProfile, matched: string[]) {
  return [...p.skills.filter((s) => isMatched(s, matched)), ...p.skills.filter((s) => !isMatched(s, matched))];
}

function SkillChips({ skills, matched, limit }: { skills: string[]; matched: string[]; limit?: number }) {
  const shown = limit ? skills.slice(0, limit) : skills;
  const more = skills.length - shown.length;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((s) => (
        <li key={s} className={cn("max-w-full truncate rounded-full px-2.5 py-0.5 text-[12px]", isMatched(s, matched) ? "bg-brand-50 font-medium text-brand-700" : "bg-surface-2 text-ink-2")}>
          {s}
        </li>
      ))}
      {more > 0 && <li className="px-1 py-0.5 text-[12px] text-ink-3">+{more} more</li>}
    </ul>
  );
}

function Head({ orgId, p, size }: { orgId: string; p: TalentProfile; size: "card" | "page" }) {
  const big = size === "page";
  return (
    <>
      <div className={cn("bg-gradient-to-r from-brand-500 via-brand-400 to-pink-400", big ? "h-20 rounded-t-[16px]" : "h-14 rounded-t-[15px]")} aria-hidden />
      <div className={cn("px-4", big ? "-mt-12" : "-mt-9")}>
        <Avatar name={p.displayName} size={big ? 96 : 72} photo={p.showPhoto ? hiringApi.talentPhotoUrl(orgId, p.tenantId) : undefined} className="ring-4 ring-surface" />
        <p className={cn("mt-2 font-semibold text-ink", big ? "text-[20px]" : "text-[16px]")}>{p.displayName}</p>
        <p className={cn("break-words text-ink-2", big ? "text-[14px]" : "line-clamp-2 text-[13px]")}>{p.headline || "No headline"}</p>
        {meta(p) && (
          <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-ink-3">
            <Briefcase className="size-3.5 shrink-0" aria-hidden /> {meta(p)}
          </p>
        )}
        {where(p) && (
          <p className="flex items-start gap-1 text-[12px] text-ink-3">
            <MapPin className="mt-px size-3.5 shrink-0" aria-hidden /> <span className="min-w-0 break-words">{where(p)}</span>
          </p>
        )}
      </div>
    </>
  );
}

function ResumeLink({ orgId, p }: { orgId: string; p: TalentProfile }) {
  if (!p.hasResume) return null;
  return (
    <a href={hiringApi.talentResumeUrl(orgId, p.tenantId)} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1 text-[13px] font-semibold text-brand-600 hover:underline">
      <FileText className="size-4" aria-hidden /> Résumé
    </a>
  );
}

export function TalentCard({ orgId, p, matched, onOpen, onShortlist, onMessage }: { orgId: string; p: TalentProfile; matched: string[]; onOpen: () => void; onShortlist: () => void; onMessage: () => void }) {
  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-[16px] border border-line bg-surface">
      <button type="button" onClick={onOpen} className="text-left" aria-label={`View ${p.displayName}'s profile`}>
        <Head orgId={orgId} p={p} size="card" />
      </button>
      <div className="flex flex-1 flex-col gap-2 px-4 pb-3 pt-2">
        {p.summary && <p className="line-clamp-2 break-words text-[12.5px] text-ink-2">{p.summary}</p>}
        {p.skills.length > 0 && <SkillChips skills={orderedSkills(p, matched)} matched={matched} limit={6} />}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={onMessage} icon={<MessageSquare className="size-4" aria-hidden />}>
            Message
          </Button>
          <Button size="sm" variant="outline" onClick={onShortlist} icon={<UserPlus className="size-4" aria-hidden />}>
            Shortlist
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 border-t border-line pt-1">
          <button type="button" onClick={onOpen} className="inline-flex min-h-10 items-center text-[13px] font-semibold text-brand-600 hover:underline">
            View full profile
          </button>
          <ResumeLink orgId={orgId} p={p} />
        </div>
      </div>
    </li>
  );
}

/** The full profile: everything the job seeker chose to show, in sections. */
export function TalentProfileView({ orgId, p, matched, onClose, onShortlist, onMessage }: { orgId: string; p: TalentProfile; matched: string[]; onClose: () => void; onShortlist: () => void; onMessage: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title={p.displayName}
      size="md"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={onShortlist} icon={<UserPlus className="size-4" aria-hidden />}>
            Shortlist
          </Button>
          <Button onClick={onMessage} icon={<MessageSquare className="size-4" aria-hidden />}>
            Message
          </Button>
        </div>
      }
    >
      <div className="-mx-1 flex flex-col gap-4">
        <div className="overflow-hidden rounded-[16px] border border-line pb-3">
          <Head orgId={orgId} p={p} size="page" />
          <div className="px-4">
            <ResumeLink orgId={orgId} p={p} />
          </div>
        </div>
        {p.summary && (
          <section>
            <h3 className="mb-1 text-[15px] font-semibold text-ink">About</h3>
            <p className="whitespace-pre-line break-words text-[13px] text-ink-2">{p.summary}</p>
          </section>
        )}
        {p.skills.length > 0 && (
          <section>
            <h3 className="mb-2 text-[15px] font-semibold text-ink">Skills</h3>
            <SkillChips skills={orderedSkills(p, matched)} matched={matched} />
          </section>
        )}
        <p className="text-[11.5px] text-ink-4">Only what {p.displayName} chose to show recruiters. Write to them with Message.</p>
      </div>
    </Modal>
  );
}
