"use client";
import { useEffect, useState } from "react";
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

  // Covers a closed tab or reload; an in-app Link click still navigates freely, but the visible "Unsaved
  // changes" note by Save (below) is the fallback for that case.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Career Profile"
        description="Your Career Profile — what Wonder knows about you. Every match, ranking and draft starts here, and you can change any of it."
        actions={
          <>
            <Badge>Updated {formatDate(dna.updatedAt)}</Badge>
            {dirty && (
              <span role="status" className="text-[12px] font-medium text-warning-600">
                Unsaved changes
              </span>
            )}
            <Button
              disabled={!dirty}
              onClick={() => {
                updateDNA(draft);
                toast.success("Career Profile updated", "Your next run will use these values.");
              }}
            >
              Save changes
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Career direction</h2>
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
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Experience</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Years of experience" htmlFor="yoe" hint="0–50">
              <Input
                id="yoe"
                type="number"
                min={0}
                max={50}
                value={draft.yearsExperience}
                onChange={(e) => set("yearsExperience", Number(e.target.value))}
                onBlur={(e) => set("yearsExperience", Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
              />
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
          <p className="mt-3 text-[12px] text-ink-3">Wonder doesn&apos;t hold a field-by-field employment history yet — skills, level and years are what it scores experience against today.</p>
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
            <Field label="Minimum salary (annual, ₹ lakh)" htmlFor="sal" hint="1 lakh = ₹1,00,000/year. E.g. 28 means ₹28,00,000/year. Leave blank for no minimum.">
              <Input id="sal" type="number" min={0} placeholder="No minimum" value={draft.minSalary ? Math.round(draft.minSalary / 100_000) : ""} onChange={(e) => set("minSalary", e.target.value ? Number(e.target.value) * 100_000 : undefined)} />
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

        <Card>
          <h2 className="mb-1 text-[15px] font-semibold text-ink">Resume</h2>
          <p className="mb-3 text-[12px] text-ink-3">Pull fields from a resume to fill in the sections above. Every suggestion shows the words it came from, and nothing is applied until you tick it. The file itself is never stored.</p>
          <ResumeImport current={draft} onApply={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
        </Card>

        <LearnedPreferences />

        <Card>
          <h2 className="mb-1 text-[15px] font-semibold text-ink">Sources</h2>
          <p className="text-[12px] text-ink-3">
            Career Profile is built from what you type here and what you choose to bring in from a resume — last changed {formatDate(dna.updatedAt)}. Wonder doesn&apos;t track which individual field came from which source.
          </p>
          <p className="mt-2 text-[12px] text-ink-3">LinkedIn isn&apos;t connected — it has no public API to import from, so nothing here comes from there.</p>
        </Card>

        <p className="text-[12px] text-ink-4">Wonder may suggest changes here after a run, but never edits your Career Profile unless you allow it in What Wonder can do.</p>
      </div>
    </div>
  );
}
