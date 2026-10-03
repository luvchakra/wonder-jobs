"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronDown, X } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { INDUSTRIES, type CareerDNA } from "@/domain/career/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { Chip, Field, Input, Select, Textarea } from "@/components/common/Input";
import { ResumeImport } from "@/components/career/ResumeImport";
import { RolesCard } from "@/components/career/RolesCard";
import { CareerHistoryEditor } from "@/components/career/CareerHistoryEditor";
import { MissingRoles } from "@/components/career/MissingRoles";
import { RememberedAnswers } from "@/components/career/RememberedAnswers";
import { historyOf, sortExperience } from "@/domain/career/history";
import { stripHeadlineLabel } from "@/services/jobs/normalize";
import { profileChanged } from "@/domain/career/profileEdit";
import { LearnedPreferences } from "@/components/career/LearnedPreferences";
import { toast } from "@/components/feedback/Toast";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";


export default function CareerDNAPage() {
  const dna = useCareerStore((s) => s.dna);
  const updateDNA = useCareerStore((s) => s.updateDNA);
  const [draft, setDraft] = useState<CareerDNA>(dna);
  // Resume Studio → "Fill Career Profile" links here with the stored file to read.
  const params = useSearchParams();
  const router = useRouter();
  const fillFrom = params.get("fill") ?? undefined;
  // A CV headline like "Target: Senior Director — IAM" is a goal, not the role held today.
  const targetInHeadline = stripHeadlineLabel(draft.headline) !== draft.headline;
  // The history editor's contact and summary fields are uncontrolled: remount it to show imported values.
  const [importRev, setImportRev] = useState(0);
  const [newSkill, setNewSkill] = useState("");
  const dirty = profileChanged(draft, dna);
  // The saved profile can change under an untouched form (it loads from your account, or another tab
  // saves): follow it then, but never over edits not yet saved.
  const seen = useRef(dna);
  useEffect(() => {
    if (seen.current === dna) return;
    const untouched = !profileChanged(draft, seen.current);
    seen.current = dna;
    if (untouched) setDraft(dna);
  }, [dna, draft]);
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
        className="mb-2 md:mb-3"
      />
      {/* Stays in view below the top bar while the long form scrolls, so Save is always one tap away. */}
      <div className="sticky top-16 z-20 -mx-4 mb-4 flex items-center justify-end gap-2 border-b border-line/70 bg-bg/90 px-4 py-2.5 backdrop-blur md:mx-0 md:rounded-b-[14px] md:px-0">
        <Badge className="mr-auto">Updated {formatDate(dna.updatedAt)}</Badge>
        {dirty && (
          <span role="status" className="text-[12px] font-medium text-warning-600">
            Unsaved changes
          </span>
        )}
        <Button
          disabled={!dirty}
          onClick={() => {
            updateDNA(draft);
            // Saving stamps a new time on the stored profile; take it, so the form matches what was saved.
            const stored = useCareerStore.getState().dna;
            seen.current = stored;
            setDraft(stored);
            toast.success("Career Profile updated", "Your next run will use these values.");
          }}
        >
          Save changes
        </Button>
      </div>
      <div className="flex flex-col gap-4">
        {/* Two questions, each asked once: who you are today (what jobs are matched against) and
            what you're looking for (what Wonder searches for). Everything else is one tap down. */}
        <Card className="p-0">
          <div className="px-5 pb-5 pt-4">
            <h2 className="text-[15px] font-semibold text-ink">What you&apos;re looking for</h2>
            <p className="mb-3 text-[12px] text-ink-3">What Wonder searches for. Say the role and its field.</p>
            <Field label="Role you want" htmlFor="goal" hint="e.g. “Director, identity and access management” — not a level alone.">
              <Input id="goal" value={draft.careerGoal} onChange={(e) => set("careerGoal", e.target.value)} />
            </Field>
          </div>
          <MoreRow title="Other roles you'd take" hint={draft.careerGoal.trim() ? "Search as each of them with one tap" : "Add roles once you've named the one you want"} last>
            <RolesCard bare />
          </MoreRow>
        </Card>

        <Card>
          <h2 className="text-[15px] font-semibold text-ink">About you</h2>
          <p className="mb-4 text-[12px] text-ink-3">Who you are today. Every job is matched against this.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name">
              <Input id="name" value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Current role" htmlFor="headline" hint="Your title and field now, e.g. “Senior Manager — Identity & Access Management”.">
              <Input id="headline" value={draft.headline} onChange={(e) => set("headline", e.target.value)} />
              {targetInHeadline && (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                  This reads like where you&apos;re heading, not your role today.
                  <button
                    type="button"
                    className="font-medium text-brand-600 hover:underline"
                    onClick={() => {
                      const latest = sortExperience(historyOf(draft).experience)[0];
                      setDraft((d) => ({ ...d, careerGoal: stripHeadlineLabel(d.headline), headline: latest ? `${latest.title}${latest.employer ? ` — ${latest.employer}` : ""}` : "" }));
                    }}
                  >
                    Move it to Role you want
                  </button>
                </p>
              )}
            </Field>
            <Field label="Level" htmlFor="level">
              <Select id="level" value={draft.seniority} onChange={(e) => set("seniority", e.target.value as CareerDNA["seniority"])}>
                {["junior", "mid", "senior", "lead", "director"].map((l) => (
                  <option key={l} value={l}>
                    {l[0].toUpperCase() + l.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Years of experience" htmlFor="yoe">
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
            <Field label="Where" htmlFor="locs" hint="Comma-separated; add “Remote” for remote roles.">
              <Input id="locs" value={draft.preferredLocations.join(", ")} onChange={(e) => set("preferredLocations", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
            </Field>
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-ink-2">Work mode</p>
              <div className="flex flex-wrap gap-2">
                {(["remote", "hybrid", "onsite"] as const).map((m) => (
                  <Chip key={m} active={draft.workModes.includes(m)} onClick={() => set("workModes", draft.workModes.includes(m) ? draft.workModes.filter((x) => x !== m) : [...draft.workModes, m])} className="h-9">
                    {m === "onsite" ? "On-site" : m[0].toUpperCase() + m.slice(1)}
                  </Chip>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[13px] font-medium text-ink-2">Skills</p>
            <p className="mb-2 text-[12px] text-ink-3">Tap a skill to mark it a strength — strengths weigh more in matching.</p>
            <ul className="flex flex-wrap gap-2">
              {draft.skills.map((s, i) => (
                <li key={s.name} className={cn("inline-flex items-center rounded-full border text-[13px]", s.level >= 4 ? "border-brand-400 bg-brand-50" : "border-line bg-surface")}>
                  <button type="button" aria-pressed={s.level >= 4} aria-label={`${s.name}${s.level >= 4 ? ", a strength" : ""}`} onClick={() => set("skills", draft.skills.map((x, j) => (j === i ? { ...x, level: (x.level >= 4 ? 3 : 5) as 3 | 5 } : x)))} className={cn("py-1.5 pl-3 pr-1 font-medium", s.level >= 4 ? "text-brand-700" : "text-ink")}>
                    {s.name}
                  </button>
                  <button type="button" aria-label={`Remove ${s.name}`} onClick={() => set("skills", draft.skills.filter((_, j) => j !== i))} className="flex size-7 items-center justify-center rounded-full text-ink-4 hover:text-ink">
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
              <li>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = newSkill.trim();
                    if (!name || draft.skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) return;
                    set("skills", [...draft.skills, { name, level: 3 }]);
                    setNewSkill("");
                  }}
                >
                  <Input value={newSkill} onChange={(e) => setNewSkill(e.target.value)} placeholder="+ Add a skill" aria-label="New skill" className="h-9 w-40 rounded-full" />
                </form>
              </li>
            </ul>
          </div>
        </Card>

        <Card className="p-0">
          <MissingRoles
            history={historyOf(draft)}
            onAdd={(h) => {
              set("history", h);
              setImportRev((n) => n + 1);
            }}
          />
          <MoreRow title="Fill from your résumé" hint="Reads roles, education and contact from a CV — you tick what to keep" open={!!fillFrom}>
            <p className="mb-3 text-[12px] text-ink-3">Every suggestion shows the words it came from, and nothing is applied until you tick it. To keep a résumé for applying, <Link href="/app/resume-studio" className="text-brand-600 underline underline-offset-2">upload it under Résumés</Link>.</p>
            <ResumeImport current={draft} history={draft.history ?? {}} onApply={(patch) => {
                setDraft((d) => ({ ...d, ...patch }));
                setImportRev((n) => n + 1);
              }}
              fileId={fillFrom} onFileHandled={() => router.replace("/app/career-dna")} />
          </MoreRow>
          <MoreRow title="Work history, education and contact" hint={`${historyOf(draft).experience.length} roles — what résumés are built from`}>
            <CareerHistoryEditor key={`${dna.updatedAt}-${importRev}`} value={historyOf(draft)} onChange={(h) => set("history", h)} />
          </MoreRow>
          <MoreRow title="Industries and minimum salary" hint={draft.industries.length ? draft.industries.slice(0, 3).join(", ") : "Any industry"}>
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map((i) => (
                <Chip key={i} active={draft.industries.includes(i)} onClick={() => set("industries", draft.industries.includes(i) ? draft.industries.filter((x) => x !== i) : [...draft.industries, i])}>
                  {i}
                </Chip>
              ))}
            </div>
            <Field label="Minimum salary (annual, ₹ lakh)" htmlFor="sal" hint="E.g. 28 means ₹28,00,000/year. Blank for no minimum." className="mt-4 max-w-xs">
              <Input id="sal" type="number" min={0} placeholder="No minimum" value={draft.minSalary ? Math.round(draft.minSalary / 100_000) : ""} onChange={(e) => set("minSalary", e.target.value ? Number(e.target.value) * 100_000 : undefined)} />
            </Field>
          </MoreRow>
          <MoreRow title="Strengths and growth areas">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Strengths (one per line)" htmlFor="str">
                <Textarea id="str" value={draft.strengths.join("\n")} onChange={(e) => set("strengths", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
              </Field>
              <Field label="Growth areas (one per line)" htmlFor="grow">
                <Textarea id="grow" value={draft.growthAreas.join("\n")} onChange={(e) => set("growthAreas", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
              </Field>
            </div>
          </MoreRow>
          <MoreRow title="Answers Wonder remembers" hint="Offered on application forms for you to confirm">
            <RememberedAnswers />
          </MoreRow>
          <MoreRow title="What Wonder has learned" hint="From the jobs you marked not for me">
            <LearnedPreferences />
          </MoreRow>
          <MoreRow title="Where this profile came from" last>
            <p className="text-[12px] text-ink-3">
              What you type here and what you choose to bring in from a résumé — last changed {formatDate(dna.updatedAt)}. Work-history entries show where each came from. LinkedIn isn&apos;t connected: it has no public API, so nothing here comes from there.
            </p>
          </MoreRow>
        </Card>

        <p className="text-[12px] text-ink-4">Wonder may suggest changes here after a run, but never edits your Career Profile unless you allow it in What Wonder can do.</p>
      </div>
    </div>
  );
}

/** One collapsed section of the profile: a title and a one-line summary; the detail opens in place. */
function MoreRow({ title, hint, open, last, children }: { title: string; hint?: string; open?: boolean; last?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className={cn("group", !last && "border-b border-line")}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">{title}</span>
          {hint && <span className="block truncate text-[12px] text-ink-3">{hint}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}
