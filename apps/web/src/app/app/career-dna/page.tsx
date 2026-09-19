"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { INDUSTRIES, type CareerDNA } from "@/domain/career/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { Chip, Field, Input, Select, Textarea } from "@/components/common/Input";
import { ResumeImport } from "@/components/career/ResumeImport";
import { LearnedPreferences } from "@/components/career/LearnedPreferences";
import { toast } from "@/components/feedback/Toast";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";


export default function CareerDNAPage() {
  const dna = useCareerStore((s) => s.dna);
  const updateDNA = useCareerStore((s) => s.updateDNA);
  const [draft, setDraft] = useState<CareerDNA>(dna);
  const [newSkill, setNewSkill] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(dna);
  const set = <K extends keyof CareerDNA>(k: K, v: CareerDNA[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Career DNA"
        description="What Wonder knows about you. Every match, ranking and draft starts here — and you can change any of it."
        actions={
          <>
            <Badge>Updated {formatDate(dna.updatedAt)}</Badge>
            <ResumeImport onApply={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
            <Button
              disabled={!dirty}
              onClick={() => {
                updateDNA(draft);
                toast.success("Career DNA updated", "Your next run will use these values.");
              }}
            >
              Save changes
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Goal</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name">
              <Input id="name" value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Headline" htmlFor="headline">
              <Input id="headline" value={draft.headline} onChange={(e) => set("headline", e.target.value)} />
            </Field>
            <Field label="Career goal" htmlFor="goal" className="sm:col-span-2" hint="Plain language. Wonder uses this to judge career-goal alignment.">
              <Textarea id="goal" value={draft.careerGoal} onChange={(e) => set("careerGoal", e.target.value)} className="min-h-20" />
            </Field>
            <Field label="Years of experience" htmlFor="yoe">
              <Input id="yoe" type="number" min={0} max={50} value={draft.yearsExperience} onChange={(e) => set("yearsExperience", Number(e.target.value))} />
            </Field>
            <Field label="Current level" htmlFor="level">
              <Select id="level" value={draft.seniority} onChange={(e) => set("seniority", e.target.value as CareerDNA["seniority"])}>
                {["junior", "mid", "senior", "lead", "director"].map((l) => (
                  <option key={l} value={l}>
                    {l[0].toUpperCase() + l.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-[15px] font-semibold text-ink">Skills</h2>
          <p className="mb-3 text-[12px] text-ink-3">Tap a skill to change its strength (1–5). Stronger skills weigh more in matching.</p>
          <ul className="flex flex-wrap gap-2">
            {draft.skills.map((s, i) => (
              <li key={s.name} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface pl-3 pr-1 text-[13px]">
                <span className="font-medium text-ink">{s.name}</span>
                <div className="flex" role="radiogroup" aria-label={`${s.name} strength`}>
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <button key={lvl} type="button" role="radio" aria-checked={s.level === lvl} aria-label={`${lvl}`} onClick={() => set("skills", draft.skills.map((x, j) => (j === i ? { ...x, level: lvl as 1 | 2 | 3 | 4 | 5 } : x)))} className={cn("size-6 rounded-full text-[10px]", lvl <= s.level ? "text-brand-600" : "text-ink-4")}>
                      ●
                    </button>
                  ))}
                </div>
                <button type="button" aria-label={`Remove ${s.name}`} onClick={() => set("skills", draft.skills.filter((_, j) => j !== i))} className="flex size-7 items-center justify-center rounded-full text-ink-4 hover:bg-bg-soft hover:text-ink">
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newSkill.trim();
              if (!name || draft.skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) return;
              set("skills", [...draft.skills, { name, level: 3 }]);
              setNewSkill("");
            }}
          >
            <Input value={newSkill} onChange={(e) => setNewSkill(e.target.value)} placeholder="Add a skill" aria-label="New skill" />
            <Button type="submit" variant="outline" icon={<Plus className="size-4" aria-hidden />}>
              Add
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Preferences</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="mb-2 text-[13px] font-medium text-ink-2">Industries</p>
              <div className="flex flex-wrap gap-2">
                {INDUSTRIES.map((i) => (
                  <Chip key={i} active={draft.industries.includes(i)} onClick={() => set("industries", draft.industries.includes(i) ? draft.industries.filter((x) => x !== i) : [...draft.industries, i])}>
                    {i}
                  </Chip>
                ))}
              </div>
            </div>
            <Field label="Preferred locations" htmlFor="locs" hint="Comma-separated. Include “Remote” to allow remote roles anywhere.">
              <Input id="locs" value={draft.preferredLocations.join(", ")} onChange={(e) => set("preferredLocations", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
            </Field>
            <Field label="Minimum salary (annual, ₹ lakh)" htmlFor="sal">
              <Input id="sal" type="number" min={0} value={draft.minSalary ? Math.round(draft.minSalary / 100_000) : ""} onChange={(e) => set("minSalary", e.target.value ? Number(e.target.value) * 100_000 : undefined)} />
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-2 text-[13px] font-medium text-ink-2">Work modes</p>
              <div className="flex flex-wrap gap-2">
                {(["remote", "hybrid", "onsite"] as const).map((m) => (
                  <Chip key={m} active={draft.workModes.includes(m)} onClick={() => set("workModes", draft.workModes.includes(m) ? draft.workModes.filter((x) => x !== m) : [...draft.workModes, m])}>
                    {m === "onsite" ? "On-site" : m[0].toUpperCase() + m.slice(1)}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Strengths &amp; growth areas</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Strengths (one per line)" htmlFor="str">
              <Textarea id="str" value={draft.strengths.join("\n")} onChange={(e) => set("strengths", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
            </Field>
            <Field label="Growth areas (one per line)" htmlFor="grow">
              <Textarea id="grow" value={draft.growthAreas.join("\n")} onChange={(e) => set("growthAreas", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
            </Field>
          </div>
        </Card>
        <LearnedPreferences />
        <p className="text-[12px] text-ink-4">Wonder may suggest changes here after a run, but never edits your Career DNA unless you allow it in Automation Settings.</p>
      </div>
    </div>
  );
}
