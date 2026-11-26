"use client";
import { useState } from "react";
import { X } from "lucide-react";
import type { CareerDNA } from "@/domain/career/types";
import { Chip, Field, Input, Select } from "@/components/common/Input";
import { cn } from "@/lib/cn";

/**
 * One profile's own fields (owner, 2026-11-26: "all profiles should have similar options to select"), in the same order
 * and look for My profile and every role: search words, what's wanted, level, résumé, places, work mode, minimum
 * salary, skills. A role's empty field follows My profile's (`follow`), shown as its placeholder.
 */
export interface ProfileFieldsValue {
  searchWords: string;
  goal: string;
  seniority?: CareerDNA["seniority"];
  resume: string;
  places: string[];
  workModes: CareerDNA["workModes"];
  minSalary?: number;
  skills: CareerDNA["skills"];
}

const LEVELS: { value: CareerDNA["seniority"]; label: string }[] = [
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "director", label: "Director+" },
];
const MODES: { value: CareerDNA["workModes"][number]; label: string }[] = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

export function ProfileFields({ id, value, onChange, follow, derivedWords, choices }: { id: string; value: ProfileFieldsValue; onChange: (patch: Partial<ProfileFieldsValue>) => void; /** My profile's own values, for a role: what each empty field follows. */ follow?: ProfileFieldsValue; /** The words searched when Search words is empty. */ derivedWords: string; choices: { key: string; label: string }[] }) {
  const [newSkill, setNewSkill] = useState("");
  const skills = value.skills.length ? value.skills : (follow?.skills ?? []);
  const modes = value.workModes.length ? value.workModes : (follow?.workModes ?? []);
  const setSkills = (next: CareerDNA["skills"]) => onChange({ skills: next });
  const levelLabel = (v?: string) => LEVELS.find((l) => l.value === v)?.label;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Role you want" htmlFor={`${id}-goal`} hint={follow ? undefined : "What Wonder searches for, e.g. “Director, identity and access management”."}>
          <Input id={id === "main" ? "goal" : `${id}-goal`} value={value.goal} onChange={(e) => onChange({ goal: e.target.value })} maxLength={300} />
        </Field>
        <Field label="Search words" htmlFor={`${id}-words`} hint={value.searchWords.trim() ? "Sent to job sources as written." : derivedWords ? `Empty searches for “${derivedWords}”.` : undefined}>
          <Input id={`${id}-words`} value={value.searchWords} onChange={(e) => onChange({ searchWords: e.target.value })} maxLength={120} placeholder={derivedWords} />
        </Field>
        <Field label="Level" htmlFor={`${id}-level`}>
          <Select id={`${id}-level`} value={value.seniority ?? ""} onChange={(e) => onChange({ seniority: (e.target.value || undefined) as ProfileFieldsValue["seniority"] })}>
            {follow && <option value="">Same as My profile ({levelLabel(follow.seniority) ?? "—"})</option>}
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Résumé" htmlFor={`${id}-resume`} hint="Offered first when you apply to jobs this profile found.">
          <Select id={`${id}-resume`} value={value.resume} onChange={(e) => onChange({ resume: e.target.value })}>
            <option value="">{follow ? "Your base résumé" : "None chosen"}</option>
            {choices.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Places" htmlFor={`${id}-places`} hint="Separate with commas.">
          <Input id={`${id}-places`} value={value.places.join(", ")} onChange={(e) => onChange({ places: e.target.value.split(",").map((s) => s.trimStart()).filter((s, i, a) => s || i === a.length - 1) })} placeholder={follow?.places.join(", ") || "Anywhere"} />
        </Field>
        <Field label="Minimum salary (₹ a year)" htmlFor={`${id}-salary`}>
          <Input id={`${id}-salary`} type="number" min={0} value={value.minSalary ?? ""} onChange={(e) => onChange({ minSalary: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })} placeholder={follow?.minSalary ? String(follow.minSalary) : "Any"} />
        </Field>
      </div>
      <div>
        <p className="text-[13px] font-medium text-ink-2">Work mode{follow && !value.workModes.length ? <span className="font-normal text-ink-3"> · same as My profile</span> : null}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <Chip key={m.value} active={modes.includes(m.value)} onClick={() => onChange({ workModes: modes.includes(m.value) ? modes.filter((x) => x !== m.value) : [...modes, m.value] })}>
              {m.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="border-t border-line pt-3">
        <p className="text-[13px] font-medium text-ink-2">
          Skills <span className="font-normal text-ink-3">· {follow && !value.skills.length ? "same as My profile until you change them; " : ""}tap one to mark it a strength (weighs more)</span>
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {skills.map((s, i) => (
            <li key={s.name} className={cn("inline-flex items-center rounded-full border text-[13px]", s.level >= 4 ? "border-brand-400 bg-brand-50" : "border-line bg-surface")}>
              <button type="button" aria-pressed={s.level >= 4} aria-label={`${s.name}${s.level >= 4 ? ", a strength" : ""}`} onClick={() => setSkills(skills.map((x, j) => (j === i ? { ...x, level: (x.level >= 4 ? 3 : 5) as 3 | 5 } : x)))} className={cn("py-1 pl-3 pr-1 font-medium", s.level >= 4 ? "text-brand-700" : "text-ink")}>
                {s.name}
              </button>
              <button type="button" aria-label={`Remove ${s.name}`} onClick={() => setSkills(skills.filter((_, j) => j !== i))} className="flex size-7 items-center justify-center rounded-full text-ink-4 hover:text-ink">
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
          <li>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = newSkill.trim();
                if (!name || skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) return;
                setSkills([...skills, { name, level: 3 }]);
                setNewSkill("");
              }}
            >
              <Input value={newSkill} onChange={(e) => setNewSkill(e.target.value)} placeholder="+ Add a skill" aria-label="New skill" className="h-9 w-36 rounded-full" />
            </form>
          </li>
        </ul>
      </div>
    </div>
  );
}
