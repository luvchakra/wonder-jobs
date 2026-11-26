"use client";
import { X } from "lucide-react";
import type { CareerDNA } from "@/domain/career/types";
import { Input } from "@/components/common/Input";
import { cn } from "@/lib/cn";
import { addSkills } from "./profileForm";

/**
 * A profile's skills as chips (tap one to mark it a strength) and a box to add more. What's typed is added on Enter
 * and when the box loses focus; Save changes and Search take what's still in it (`withTypedSkill`), so nothing typed
 * is lost (owner, 2026-11-26: "clicking outside should add the new skill").
 */
export function SkillsInput({ skills, onChange, typed, onTyped }: { skills: CareerDNA["skills"]; onChange: (next: CareerDNA["skills"]) => void; /** What's in the add box, kept by the page so Save changes and Search include it. */ typed: string; onTyped: (text: string) => void }) {
  const setTyped = onTyped;
  const commit = () => {
    if (!typed.trim()) return setTyped("");
    const next = addSkills(skills, typed);
    if (next !== skills) onChange(next);
    setTyped("");
  };
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {skills.map((s, i) => (
        <li key={s.name} className={cn("inline-flex items-center rounded-full border text-[13px]", s.level >= 4 ? "border-brand-400 bg-brand-50" : "border-line bg-surface")}>
          <button type="button" aria-pressed={s.level >= 4} aria-label={`${s.name}${s.level >= 4 ? ", a strength" : ""}`} onClick={() => onChange(skills.map((x, j) => (j === i ? { ...x, level: (x.level >= 4 ? 3 : 5) as 3 | 5 } : x)))} className={cn("py-1 pl-3 pr-1 font-medium", s.level >= 4 ? "text-brand-700" : "text-ink")}>
            {s.name}
          </button>
          <button type="button" aria-label={`Remove ${s.name}`} onClick={() => onChange(skills.filter((_, j) => j !== i))} className="flex size-7 items-center justify-center rounded-full text-ink-4 hover:text-ink">
            <X className="size-3.5" aria-hidden />
          </button>
        </li>
      ))}
      <li>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
        >
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} onBlur={commit} enterKeyHint="done" placeholder="+ Add a skill" aria-label="New skill" className="h-9 w-36 rounded-full" />
        </form>
      </li>
    </ul>
  );
}
