"use client";
import Link from "next/link";
import { Award, Bookmark, CheckCircle2, ChevronDown, FileText, PartyPopper, X } from "lucide-react";
import { useCareerStore, type SavedSkill } from "@/store/career";
import { LEVEL_NAMES, onProfile, percent, profileLevel, readyForResume, summarize, type SavedLevel } from "@/domain/skills/progress";
import { searchTerm } from "@/domain/skills/learn";
import { newId } from "@/lib/ids";
import { cn } from "@/lib/cn";
import { toast } from "@/components/feedback/Toast";
import { Resources, type LearnItem } from "./Resources";

/** Save to learn / Saved — on every Skill Up suggestion. */
export function SaveButton({ name, kind, saved }: { name: string; kind: SavedSkill["kind"]; saved: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={saved}
      onClick={() => {
        const s = useCareerStore.getState();
        if (saved) s.unsaveSkillUp(name);
        else {
          s.saveSkillUp(name, kind);
          toast.success(`${name} saved to learn`, "Track your progress in My Saved Skills.");
        }
      }}
      className={cn("inline-flex min-h-10 items-center gap-1 text-[13px] font-semibold", saved ? "text-brand-600" : "text-brand-600 hover:underline")}
    >
      <Bookmark className="size-4" fill={saved ? "currentColor" : "none"} aria-hidden /> {saved ? "Saved to learn" : "Save to learn"}
    </button>
  );
}

/**
 * My Saved Skills: what the candidate chose to learn, a five-step tracker they set themselves, where to learn
 * each, and — once they rate a skill Confident or a certification Earned — the step that puts it on their
 * Career Profile, which every résumé is made from.
 */
export function SavedSkills({ items, learn }: { items: SavedSkill[]; learn: { skills: Record<string, LearnItem[]>; certs: Record<string, LearnItem | null> } | null }) {
  const dna = useCareerStore((s) => s.dna);
  const profile = { skills: dna.skills.map((s) => s.name), certifications: (dna.history?.certifications ?? []).map((c) => c.name) };
  const sum = summarize(items, profile);
  return (
    // Folded by default: the summary line says where things stand; the trackers open on a tap.
    <details className="group/saved rounded-[16px] border border-brand-200 bg-brand-50/40">
      <summary className="flex min-h-[60px] cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span role="heading" aria-level={2} className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-ink">
            <Bookmark className="size-4 text-brand-600" fill="currentColor" aria-hidden /> My Saved Skills
          </span>
          <span className="block text-[12px] text-ink-3">
            {sum.saved} saved · {sum.average}% along{sum.toAdd ? ` · ${sum.toAdd} ready for your résumé` : ""}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-4 transition-transform group-open/saved:rotate-180" aria-hidden />
      </summary>
      <ul className="flex flex-col gap-2 px-4 pb-4">
        {items.map((item) => (
          <SavedRow key={item.name} item={item} on={onProfile(item, profile)} learn={item.kind === "skill" ? (learn?.skills[item.name] ?? []) : learn?.certs[item.name] ? [learn.certs[item.name]!] : []} />
        ))}
      </ul>
    </details>
  );
}

function SavedRow({ item, on, learn }: { item: SavedSkill; on: boolean; learn: LearnItem[] }) {
  const names = LEVEL_NAMES[item.kind];
  const ready = readyForResume(item);
  const set = (level: SavedLevel) => useCareerStore.getState().setSkillUpLevel(item.name, level);
  return (
    <li className="rounded-[14px] border border-line bg-surface p-3">
      <div className="flex items-start gap-2">
        {item.kind === "certification" && <Award className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-ink">{item.name}</p>
          <p className="text-[12px] text-ink-3">
            <span className={cn("font-medium", ready ? "text-success-600" : "text-ink-2")}>{names[item.level]}</span> · {percent(item.level)}%
          </p>
        </div>
        <button type="button" aria-label={`Stop tracking ${item.name}`} onClick={() => unsave(item)} className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-4 hover:bg-bg-soft hover:text-ink">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {/* The tracker: five steps, the candidate's own rating — tap the step they're at. */}
      <div role="radiogroup" aria-label={`Your progress with ${item.name}`} className="mt-2 grid grid-cols-5 gap-1">
        {names.map((label, i) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={item.level === i}
            title={label}
            onClick={() => set(i as SavedLevel)}
            className="group flex min-h-10 flex-col items-stretch justify-center gap-1"
          >
            <span className={cn("h-2 rounded-full transition-colors", i <= item.level && item.level > 0 ? (ready ? "bg-success-600" : "bg-brand-500") : "bg-bg-soft group-hover:bg-line-strong")} />
            <span className={cn("truncate text-center text-[10px]", item.level === i ? "font-semibold text-ink" : "text-ink-4")}>{label}</span>
          </button>
        ))}
      </div>
      {ready && <ResumeStep item={item} on={on} />}
      <details className="group mt-1">
        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 text-[12px] font-medium text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
          Where to learn <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <Resources term={item.kind === "certification" ? searchTerm(item.name) : item.name} items={learn} />
      </details>
    </li>
  );
}

/** Confident in a skill, or a certification earned: put it on the Career Profile (on the candidate's press), then make a résumé with it. */
function ResumeStep({ item, on }: { item: SavedSkill; on: boolean }) {
  if (on) {
    return (
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] bg-success-100/50 px-3 py-2 text-[12px] text-ink-2">
        <CheckCircle2 className="size-4 text-success-600" aria-hidden /> On your Career Profile.
        <Link href="/app/resume-studio" className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
          <FileText className="size-3.5" aria-hidden /> Make a résumé with it
        </Link>
      </p>
    );
  }
  return (
    <div className="mt-2 rounded-[10px] bg-success-100/50 px-3 py-2">
      <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <PartyPopper className="size-4 text-success-600" aria-hidden /> {item.kind === "skill" ? `You're ${LEVEL_NAMES.skill[item.level]} in ${item.name}` : `You earned ${searchTerm(item.name)}`} — put it on your résumé
      </p>
      <p className="mt-0.5 text-[12px] text-ink-3">Your résumés are made from your Career Profile. Add it there, then make a new résumé.</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4">
        <button type="button" onClick={() => addToProfile(item)} className="inline-flex min-h-10 items-center rounded-full bg-success-600 px-4 text-[13px] font-semibold text-white hover:brightness-110">
          Add to Career Profile
        </button>
        <Link href="/app/resume-studio" className="inline-flex min-h-10 items-center gap-1 text-[13px] font-semibold text-brand-600 hover:underline">
          <FileText className="size-4" aria-hidden /> Open Résumés
        </Link>
      </div>
    </div>
  );
}

function unsave(item: SavedSkill) {
  const s = useCareerStore.getState();
  s.unsaveSkillUp(item.name);
  toast.info(`Stopped tracking ${item.name}`, undefined, {
    label: "Undo",
    onClick: () => {
      const st = useCareerStore.getState();
      st.saveSkillUp(item.name, item.kind);
      st.setSkillUpLevel(item.name, item.level);
    },
  });
}

/** The candidate's own claim, on their press, typed by them (USER_PROVIDED); Undo puts the profile back. */
function addToProfile(item: SavedSkill) {
  const s = useCareerStore.getState();
  const before = s.dna;
  if (item.kind === "skill") {
    s.updateDNA({ skills: [...before.skills.filter((x) => x.name.toLowerCase() !== item.name.toLowerCase()), { name: item.name, level: profileLevel(item.level) }] });
  } else {
    const history = before.history ?? { contact: {}, experience: [], education: [], certifications: [], projects: [], publications: [], researchInterests: [] };
    s.updateDNA({ history: { ...history, certifications: [...(history.certifications ?? []), { id: newId("cert"), name: searchTerm(item.name), provenance: "USER_PROVIDED" }] } });
  }
  toast.success(`${searchTerm(item.name)} added to your Career Profile`, "Your matches are re-scored, and new résumés include it.", {
    label: "Undo",
    onClick: () => useCareerStore.getState().updateDNA({ skills: before.skills, history: before.history }),
  });
}
