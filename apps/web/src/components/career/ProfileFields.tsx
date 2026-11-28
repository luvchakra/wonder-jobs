"use client";
import type { CareerDNA } from "@/domain/career/types";
import { Field, Input, Select } from "@/components/common/Input";
import { SkillsInput } from "./SkillsInput";

/**
 * One profile's own fields (owner, 2026-11-26: "all profiles should have similar options to select"), in the same order
 * and look for My profile and every role: what's wanted, search words, résumé and skills. Level, places, salary and
 * work mode are Refine's alone (owner, 2026-11-28: "just keep the minimum parameters which are not part of refine").
 * A role's empty field follows My profile's (`follow`), shown as its placeholder.
 */
export interface ProfileFieldsValue {
  searchWords: string;
  goal: string;
  resume: string;
  skills: CareerDNA["skills"];
  /** A role with its own résumé: its skills are the ones added by hand, and these the file's taken off (domain/career/roleFile.ts). */
  skillsOwn?: boolean;
  skillsRemoved?: string[];
}

export function ProfileFields({ id, value, onChange, typedSkill, onTypedSkill, follow, derivedWords, choices, skillsFrom }: { /** Where a role's skills come from when its own résumé gives them (“from Deepak_CV.docx”). */ skillsFrom?: string; id: string; value: ProfileFieldsValue; onChange: (patch: Partial<ProfileFieldsValue>) => void; typedSkill: string; onTypedSkill: (text: string) => void; /** My profile's own values, for a role: what each empty field follows. */ follow?: ProfileFieldsValue; /** The words searched when Search words is empty. */ derivedWords: string; choices: { key: string; label: string }[] }) {
  const skills = value.skills.length ? value.skills : (follow?.skills ?? []);
  const setSkills = (next: CareerDNA["skills"]) => onChange({ skills: next });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Role you want" htmlFor={`${id}-goal`} hint={follow ? undefined : "What Wonder searches for, e.g. “Director, identity and access management”."}>
          <Input id={id === "main" ? "goal" : `${id}-goal`} value={value.goal} onChange={(e) => onChange({ goal: e.target.value })} maxLength={300} />
        </Field>
        <Field label="Search words" htmlFor={`${id}-words`} hint={value.searchWords.trim() ? "Sent to job sources as written." : derivedWords ? `Empty searches for “${derivedWords}”.` : undefined}>
          <Input id={`${id}-words`} value={value.searchWords} onChange={(e) => onChange({ searchWords: e.target.value })} maxLength={120} placeholder={derivedWords} />
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
      </div>
      <div className="border-t border-line pt-3">
        <p className="text-[13px] font-medium text-ink-2">
          Skills <span className="font-normal text-ink-3">· {skillsFrom ? `${skillsFrom}, plus any you add; ` : follow && !value.skills.length ? "same as My profile until you change them; " : ""}tap one to mark it a strength (weighs more)</span>
        </p>
        <SkillsInput skills={skills} onChange={setSkills} typed={typedSkill} onTyped={onTypedSkill} />
      </div>
    </div>
  );
}
