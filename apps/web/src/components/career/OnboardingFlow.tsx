"use client";
import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileUp, X } from "lucide-react";
import type { CareerDNA } from "@/domain/career/types";
import type { HistoryDraft } from "@/domain/career/historyImport";
import { buildHistoryPatch, reviewHistoryImport } from "@/domain/career/historyImport";
import type { ResumeImportDraft } from "@/domain/career/resumeImport";
import { onlyLevel } from "@/domain/jobs/readiness";
import { HeroScene } from "@/components/landing/HeroScene";
import { WonderLogo } from "@/components/brand/WonderLogo";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { StoreHydrator } from "@/store/StoreHydrator";
import { useHydration } from "@/store/hydration";
import { useCareerStore } from "@/store/career";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { track } from "@/lib/analytics";
import { safeNextPath } from "@/lib/safeRedirect";

const FIELD = "border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-brand-300 focus:ring-brand-500/30";
const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** A visible label on the dark hero background — the shared `Field` is styled for a light card. */
function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-medium text-white/70">
      {children}
    </label>
  );
}

/**
 * CV-first onboarding: upload a CV → confirm the role, where and skills Wonder read from it → jobs.
 * Everything shown comes from the candidate's own CV or what they type; nothing is invented, and
 * nothing is saved until they confirm. No CV? The same three lines, typed.
 */
export function OnboardingFlow() {
  return (
    <StoreHydrator>
      <Suspense fallback={null}>
        <Steps />
      </Suspense>
    </StoreHydrator>
  );
}

interface Read {
  draft: ResumeImportDraft;
  history?: HistoryDraft;
  filename?: string;
}

function Steps() {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next");
  const next = (rawNext ? safeNextPath(rawNext, "") : "") || "/app";
  const hydrated = useHydration((s) => s.hydrated);
  const dna = useCareerStore((s) => s.dna);
  const updateDNA = useCareerStore((s) => s.updateDNA);
  const completeOnboarding = useCareerStore((s) => s.completeOnboarding);
  const base = useCareerStore((s) => s.baseResume);
  const setBase = useCareerStore((s) => s.setBaseResume);
  const upload = useResumeFilesStore((s) => s.upload);
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"cv" | "confirm">("cv");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  const [role, setRole] = useState("");
  const [where, setWhere] = useState("");
  const [skills, setSkills] = useState<CareerDNA["skills"]>([]);
  const [newSkill, setNewSkill] = useState("");

  const confirm = (r: Read | null) => {
    setRead(r);
    // The role they want is theirs to say: a CV says what they do now, not what they're looking for.
    setRole(dna.careerGoal);
    setWhere((r?.draft.preferredLocations?.length ? r.draft.preferredLocations : dna.preferredLocations).join(", ") || r?.history?.contact.location?.value.trim() || "");
    setSkills(r?.draft.skills?.length ? r.draft.skills.slice(0, 15) : dna.skills);
    setStep("confirm");
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    // Read it and keep it as the base résumé at once; keeping it is a convenience, reading it is the step.
    const [readRes, stored] = await Promise.allSettled([fetch("/api/career/import-resume", { method: "POST", body }), upload(file)]);
    if (stored.status === "fulfilled" && !base) setBase({ kind: "upload", id: stored.value.id });
    const res = readRes.status === "fulfilled" ? readRes.value : null;
    const data = res ? ((await res.json().catch(() => null)) as (Read & { error?: string }) | null) : null;
    setBusy(false);
    if (!res?.ok || !data?.draft) {
      setError(data?.error ?? (res ? "Wonder couldn't read that file. Try a PDF or Word file, or type it in." : "Couldn't reach the server. Check your connection and try again."));
      return;
    }
    track("resume_imported", { fields: Object.keys(data.draft.evidence).length, conflicts: 0, history: data.history?.experience.length ?? 0 });
    confirm({ draft: data.draft, history: data.history, filename: data.filename ?? file.name });
  };

  const addSkill = () => {
    const name = newSkill.trim();
    if (name && !skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) setSkills([...skills, { name, level: 4 }]);
    setNewSkill("");
  };

  const skip = () => {
    completeOnboarding();
    router.push(next);
  };

  const finish = () => {
    const d = read?.draft;
    const goal = role.trim();
    const history = read?.history ? buildHistoryPatch(read.history, dna.history, reviewHistoryImport(read.history, dna.history).map((r) => r.key)) : undefined;
    updateDNA({
      ...(d?.name && !dna.name.trim() ? { name: d.name } : {}),
      headline: d?.headline?.trim() || dna.headline.trim() || goal,
      careerGoal: goal,
      ...(d?.seniority ? { seniority: d.seniority } : {}),
      ...(d?.yearsExperience ? { yearsExperience: d.yearsExperience } : {}),
      ...(d?.industries?.length ? { industries: d.industries } : {}),
      skills,
      preferredLocations: where.split(",").map((s) => s.trim()).filter(Boolean),
      ...(history ? { history } : {}),
    });
    completeOnboarding();
    track("onboarding_completed", { goal: read ? "cv" : "typed" });
    router.push(next);
  };

  const levelOnly = !!role.trim() && onlyLevel(role);
  const found = read ? [read.draft.seniority && read.draft.seniority[0].toUpperCase() + read.draft.seniority.slice(1), read.draft.yearsExperience && `${read.draft.yearsExperience} years`, read.history?.experience.length && `${read.history.experience.length} roles`].filter(Boolean).join(" · ") : "";

  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink text-white">
      <HeroScene variant="dusk" className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/30 to-ink/95" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-10 md:max-w-lg md:justify-center">
        <div className="flex items-center justify-between">
          {step === "cv" ? (
            <WonderLogo href={null} tone="dark" size={34} />
          ) : (
            <button type="button" onClick={() => setStep("cv")} className="inline-flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white">
              <ArrowLeft className="size-4" aria-hidden /> Back
            </button>
          )}
          <button type="button" onClick={skip} className="text-sm font-medium text-white/80 hover:text-white">
            Skip
          </button>
        </div>

        <div className="mt-12 flex-1 md:mt-14" aria-live="polite">
          {step === "cv" ? (
            <div className="wj-animate-fade-up">
              <h1 className="text-[32px] font-semibold leading-tight tracking-tight md:text-[40px]">Add your CV, see your jobs</h1>
              <p className="mt-2 text-[14px] text-white/75">Wonder reads your role, level and skills from it and matches every job to them. You check what it found first.</p>
              <input ref={fileRef} type="file" accept={ACCEPT} className="sr-only" aria-label="Choose your CV" onChange={(e) => onPick(e.target.files?.[0])} />
              <button
                type="button"
                disabled={busy || !hydrated}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void onPick(e.dataTransfer.files?.[0]);
                }}
                className="mt-6 flex w-full flex-col items-center gap-2 rounded-[20px] border border-dashed border-white/30 bg-white/10 px-6 py-10 text-center backdrop-blur transition-colors hover:bg-white/15 disabled:opacity-60"
              >
                <FileUp className="size-7 text-brand-200" aria-hidden />
                <span className="text-[15px] font-semibold">{busy ? "Reading your CV…" : "Upload CV"}</span>
                <span className="text-[12.5px] text-white/60">PDF or Word · up to 5 MB</span>
              </button>
              {error && (
                <p role="alert" className="mt-3 text-[13px] text-danger-100">
                  {error}
                </p>
              )}
              <button type="button" onClick={() => confirm(null)} className="mt-5 text-[14px] font-medium text-white/80 underline-offset-4 hover:text-white hover:underline">
                No CV handy? Type it in
              </button>
            </div>
          ) : (
            <form
              id="onb-confirm"
              className="wj-animate-fade-up"
              onSubmit={(e) => {
                e.preventDefault();
                if (role.trim()) finish();
              }}
            >
              <h1 className="text-[32px] font-semibold leading-tight tracking-tight">{read ? "Is this right?" : "What are you looking for?"}</h1>
              {read && <p className="mt-2 text-[14px] text-white/75">Read from {read.filename ?? "your CV"}{found ? ` · ${found}` : ""}. Change anything that&apos;s off.</p>}
              <div className="mt-6 flex flex-col gap-4">
                <div>
                  <FieldLabel htmlFor="onb-role">Role you want</FieldLabel>
                  <Input id="onb-role" value={role} onChange={(e) => setRole(e.target.value)} className={FIELD} placeholder="e.g. Director, identity and access management" disabled={!hydrated} required />
                  {levelOnly && <p className="mt-1 text-[12px] text-white/60">Add the field too, e.g. “{role.trim()} of identity and access management”.</p>}
                </div>
                <div>
                  <FieldLabel htmlFor="onb-where">Where</FieldLabel>
                  <Input id="onb-where" value={where} onChange={(e) => setWhere(e.target.value)} className={FIELD} placeholder="e.g. Bengaluru, Remote — blank for anywhere" disabled={!hydrated} />
                </div>
                <div>
                  <FieldLabel htmlFor="onb-skill">Skills</FieldLabel>
                  {skills.length > 0 && (
                    <ul className="mb-2 flex flex-wrap gap-1.5">
                      {skills.map((s) => (
                        <li key={s.name} className="inline-flex items-center gap-1 rounded-full bg-white/15 py-1 pl-3 pr-1.5 text-[13px]">
                          {s.name}
                          <button type="button" aria-label={`Remove ${s.name}`} onClick={() => setSkills(skills.filter((x) => x !== s))} className="rounded-full p-0.5 text-white/60 hover:bg-white/15 hover:text-white">
                            <X className="size-3.5" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Input
                    id="onb-skill"
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addSkill();
                      }
                    }}
                    onBlur={addSkill}
                    className={FIELD}
                    placeholder="Add a skill and press Enter"
                    disabled={!hydrated}
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        {step === "confirm" && (
          <div className="mt-8">
            <Button type="submit" form="onb-confirm" size="xl" full disabled={!hydrated || !role.trim()}>
              Show my jobs
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
