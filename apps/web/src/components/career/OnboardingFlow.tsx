"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, LayoutList, Zap, ArrowLeft, TrendingUp, Check } from "lucide-react";
import type { AutomationLevel } from "@/domain/automation/policy";
import { EMPTY_DNA, INDUSTRIES, type CareerDNA } from "@/domain/career/types";
import { Chip, Select } from "@/components/common/Input";
import { HeroScene } from "@/components/landing/HeroScene";
import { WonderLogo } from "@/components/brand/WonderLogo";
import { Button } from "@/components/common/Button";
import { Textarea, Input } from "@/components/common/Input";
import { AutomationLevelSelector } from "@/components/automation/AutomationLevelSelector";
import { StoreHydrator } from "@/store/StoreHydrator";
import { useHydration } from "@/store/hydration";
import { ResumeImport } from "@/components/career/ResumeImport";
import { useCareerStore } from "@/store/career";
import { useAutomationStore } from "@/store/automation";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";

/** The candidate's own answer to "what do you want Wonder to help with" — never assumed. It
 * personalizes where onboarding sends them next (when nothing more specific was already asked
 * for via `?next=`), not what fields onboarding collects. */
const GOALS = [
  { id: "find_role", label: "Find my next role", body: "Search real postings and see what actually fits.", icon: Search, next: "/app/jobs" },
  { id: "improve_profile", label: "Improve my career profile", body: "Build out your Career DNA so matches get sharper.", icon: TrendingUp, next: "/app/career-dna" },
  { id: "prepare_application", label: "Prepare an application", body: "Get a tailored resume and cover letter ready.", icon: LayoutList, next: "/app/jobs" },
  { id: "track_applications", label: "Track my applications", body: "Keep every application, follow-up and reply in one place.", icon: Check, next: "/app/applications" },
  { id: "let_wonder_work", label: "Let Wonder work for me", body: "Search, analyze, prepare and track — start to finish.", icon: Zap, next: "/app/runs/new" },
] as const;

type GoalId = (typeof GOALS)[number]["id"];

/** A visible label for this step's dark hero background — the shared `Field` component is styled for a
 *  light card, so its label would be unreadable here. Placeholder text alone isn't a label: it vanishes
 *  the moment someone starts typing, leaving no visible cue what the field is for. The asterisk is a
 *  sibling of the `<label>`, not a child of it, so the label's own text stays exactly the field name —
 *  see Field's own comment in components/common/Input.tsx for why a child asterisk breaks that. */
function FieldLabel({ htmlFor, required, children }: { htmlFor: string; required?: boolean; children: React.ReactNode }) {
  return (
    <span className="mb-1.5 flex items-center">
      <label htmlFor={htmlFor} className="text-[12px] font-medium text-white/70">
        {children}
      </label>
      {required && (
        <span aria-hidden className="ml-0.5 text-[12px] font-medium text-danger-100">
          *
        </span>
      )}
    </span>
  );
}

/** Goal-oriented onboarding: what do you want help with → career goal → about you → automation level.
 * Writes real Career DNA; nothing is invented, and the post-onboarding destination follows the
 * candidate's own stated goal rather than a hardcoded default. */
export function OnboardingFlow() {
  return (
    <StoreHydrator>
      <Suspense fallback={null}>
        <Steps />
      </Suspense>
    </StoreHydrator>
  );
}

function Steps() {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next");
  // An explicit `?next=` (e.g. a shared link the candidate was sent to before signing up) always wins.
  // Otherwise, go where the candidate themselves said they wanted — never a hardcoded default.
  const explicitNext = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  const hydrated = useHydration((s) => s.hydrated);
  const dna = useCareerStore((s) => s.dna);
  const updateDNA = useCareerStore((s) => s.updateDNA);
  const completeOnboarding = useCareerStore((s) => s.completeOnboarding);
  const setDefaultLevel = useAutomationStore((s) => s.setDefaultLevel);
  const [step, setStep] = useState(0);
  const [primaryGoal, setPrimaryGoal] = useState<GoalId | null>(null);
  const next = explicitNext ?? GOALS.find((g) => g.id === primaryGoal)?.next ?? "/app/runs/new";
  const [goal, setGoal] = useState<string | null>(null);
  const [locations, setLocations] = useState<string | null>(null);
  const [level, setLevel] = useState<AutomationLevel>("guided");
  const [headline, setHeadline] = useState<string | null>(null);
  const [seniority, setSeniority] = useState<CareerDNA["seniority"] | null>(null);
  const [years, setYears] = useState<string | null>(null);
  const [skillsText, setSkillsText] = useState<string | null>(null);
  const [industries, setIndustries] = useState<string[] | null>(null);
  const [confirmingSkip, setConfirmingSkip] = useState(false);
  const goalValue = goal ?? dna.careerGoal;
  const locValue = locations ?? dna.preferredLocations.join(", ");
  const headlineValue = headline ?? dna.headline;
  const seniorityValue = seniority ?? dna.seniority;
  const yearsValue = years ?? (dna.yearsExperience ? String(dna.yearsExperience) : "");
  const skillsValue = skillsText ?? dna.skills.map((s) => s.name).join(", ");
  const industriesValue = industries ?? dna.industries;
  const parsedSkills = () =>
    skillsValue
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i)
      .slice(0, 25)
      .map((name) => dna.skills.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? { name, level: 4 as const });

  // Steps 1-2 are the only ones with anything typed to lose; welcome and the automation-level step (a
  // single, always-changeable choice) don't need the extra click.
  const hasDraftInput = (step === 1 || step === 2) && [goalValue, locValue, headlineValue, yearsValue, skillsValue].some((v) => v.trim().length > 0);
  const skip = () => {
    if (hasDraftInput && !confirmingSkip) {
      setConfirmingSkip(true);
      return;
    }
    completeOnboarding();
    router.push(next);
  };

  const finish = () => {
    updateDNA({
      careerGoal: goalValue.trim() || dna.careerGoal,
      preferredLocations: locValue.split(",").map((s) => s.trim()).filter(Boolean),
      headline: headlineValue.trim(),
      seniority: seniorityValue,
      yearsExperience: Math.max(0, Math.min(50, Number(yearsValue) || 0)),
      skills: parsedSkills(),
      industries: industriesValue,
    });
    setDefaultLevel(level);
    completeOnboarding();
    track("onboarding_completed", { level, goal: primaryGoal ?? undefined });
    router.push(next);
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink text-white">
      <HeroScene variant="dusk" className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/30 to-ink/95" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-10 md:max-w-lg md:justify-center">
        <div className="flex items-center justify-between">
          {step === 0 ? (
            <WonderLogo href={null} tone="dark" size={34} />
          ) : (
            <button
              type="button"
              onClick={() => {
                setConfirmingSkip(false);
                setStep((s) => s - 1);
              }}
              className="inline-flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white"
            >
              <ArrowLeft className="size-4" aria-hidden /> Back
            </button>
          )}
          <div className="flex items-center gap-3">
            {!confirmingSkip && (
              <Link href="/help" className="text-sm font-medium text-white/70 hover:text-white">
                Help
              </Link>
            )}
            {confirmingSkip ? (
              <div className="flex items-center gap-2 text-sm font-medium">
                <button type="button" onClick={() => setConfirmingSkip(false)} className="text-white/80 hover:text-white">
                  Cancel
                </button>
                <button type="button" onClick={skip} className="text-danger-100 hover:text-white">
                  Discard &amp; skip
                </button>
              </div>
            ) : (
              <button type="button" onClick={skip} className="text-sm font-medium text-white/80 hover:text-white">
                Skip
              </button>
            )}
          </div>
        </div>

        <div className="mt-12 flex-1 md:mt-14" aria-live="polite">
          {step === 0 && (
            <div className="wj-animate-fade-up">
              <h1 className="text-[32px] font-semibold leading-tight tracking-tight md:text-[40px]">What would you like Wonder to help you with?</h1>
              <p className="mt-2 text-[14px] text-white/75">Pick what matters most right now — you can do everything else too, this just decides where we start.</p>
              <div className="mt-6 flex flex-col gap-2.5" role="radiogroup" aria-label="What would you like Wonder to help you with?">
                {GOALS.map((g) => {
                  const active = primaryGoal === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setPrimaryGoal(g.id)}
                      className={cn(
                        "flex items-start gap-3 rounded-[16px] border px-4 py-3 text-left backdrop-blur transition-colors",
                        active ? "border-brand-300 bg-white/20" : "border-white/20 bg-white/10 hover:bg-white/15",
                      )}
                    >
                      <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full", active ? "bg-brand-300 text-ink" : "bg-white/15 text-brand-200")}>
                        <g.icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold text-white">{g.label}</span>
                        <span className="block text-[12.5px] text-white/70">{g.body}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="wj-animate-fade-up">
              <p className="wj-eyebrow text-brand-200">Step 1 of 3</p>
              <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-tight">What are you looking for?</h1>
              <p className="mt-2 text-[14px] text-white/75">Plain language is perfect. This becomes your career goal — Wonder uses it to judge every match.</p>
              <div className="mt-6 flex flex-col gap-4">
                <div>
                  <FieldLabel htmlFor="onb-goal" required>
                    Career goal
                  </FieldLabel>
                  <Textarea id="onb-goal" value={goalValue} onChange={(e) => setGoal(e.target.value)} className="min-h-24 border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-brand-300 focus:ring-brand-500/30" placeholder="e.g. Senior product roles at fintech companies, remote or Bengaluru" disabled={!hydrated} required />
                </div>
                <div>
                  <FieldLabel htmlFor="onb-locations">Preferred locations</FieldLabel>
                  <Input id="onb-locations" value={locValue} onChange={(e) => setLocations(e.target.value)} className="border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-brand-300 focus:ring-brand-500/30" placeholder="e.g. Bengaluru, Remote" disabled={!hydrated} />
                  <p className="mt-1 text-[11px] text-white/50">Optional. Comma-separated — leave blank to see roles anywhere.</p>
                </div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="wj-animate-fade-up">
              <p className="wj-eyebrow text-brand-200">Step 2 of 3</p>
              <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-tight">A little about you</h1>
              <p className="mt-2 text-[14px] text-white/75">This is your Career DNA. Wonder scores every real posting against it, so the more honest, the better the matches. You can refine it any time.</p>
              <div className="mt-5">
                <ResumeImport
                  tone="dark"
                  label="Fill this in from my resume"
                  current={{
                    name: dna.name,
                    headline: headlineValue,
                    // The empty profile's level is a placeholder, not something the candidate chose.
                    seniority: seniority ?? (dna.updatedAt !== EMPTY_DNA.updatedAt ? dna.seniority : undefined),
                    yearsExperience: Number(yearsValue) || undefined,
                    skills: skillsValue.split(",").map((n) => n.trim()).filter(Boolean).map((name) => dna.skills.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? { name, level: 3 as const }),
                    industries: industriesValue,
                    preferredLocations: locValue.split(",").map((l) => l.trim()).filter(Boolean),
                  }}
                  onApply={(patch) => {
                    // Straight into the fields on screen, not into the store: this is still a draft the
                    // candidate is editing, and nothing is saved until they finish onboarding.
                    if (patch.headline !== undefined) setHeadline(patch.headline);
                    if (patch.seniority !== undefined) setSeniority(patch.seniority);
                    if (patch.yearsExperience !== undefined) setYears(String(patch.yearsExperience));
                    if (patch.skills?.length) setSkillsText(patch.skills.map((s) => s.name).join(", "));
                    if (patch.industries?.length) setIndustries(patch.industries.filter((i) => INDUSTRIES.includes(i)));
                    if (patch.preferredLocations?.length) setLocations(patch.preferredLocations.join(", "));
                    if (patch.name) updateDNA({ name: patch.name });
                  }}
                />
              </div>
              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <FieldLabel htmlFor="onb-headline">Headline</FieldLabel>
                  <Input id="onb-headline" value={headlineValue} onChange={(e) => setHeadline(e.target.value)} className="border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-brand-300 focus:ring-brand-500/30" placeholder="e.g. Product Manager · Consumer & Fintech" disabled={!hydrated} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel htmlFor="onb-level">Current level</FieldLabel>
                    <Select id="onb-level" value={seniorityValue} onChange={(e) => setSeniority(e.target.value as CareerDNA["seniority"])} className="border-white/20 bg-white/10 text-white focus:border-brand-300 focus:ring-brand-500/30" disabled={!hydrated}>
                      {(["junior", "mid", "senior", "lead", "director"] as const).map((l) => (
                        <option key={l} value={l} className="text-ink">
                          {l[0].toUpperCase() + l.slice(1)} level
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <FieldLabel htmlFor="onb-years">Years of experience</FieldLabel>
                    <Input id="onb-years" value={yearsValue} onChange={(e) => setYears(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" className="border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-brand-300 focus:ring-brand-500/30" placeholder="0–50" disabled={!hydrated} />
                  </div>
                </div>
                <div>
                  <FieldLabel htmlFor="onb-skills" required>
                    Skills
                  </FieldLabel>
                  <Textarea id="onb-skills" value={skillsValue} onChange={(e) => setSkillsText(e.target.value)} className="min-h-20 border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-brand-300 focus:ring-brand-500/30" placeholder="Your strongest skills, comma-separated: e.g. Product Strategy, SQL, A/B Testing, Roadmapping" disabled={!hydrated} required />
                </div>
                <div>
                  <p className="mb-2 text-[12px] font-medium text-white/70">Industries you want <span className="text-white/50">(optional)</span></p>
                  <div className="flex flex-wrap gap-2">
                    {INDUSTRIES.map((i) => (
                      <Chip key={i} active={industriesValue.includes(i)} onClick={() => setIndustries(industriesValue.includes(i) ? industriesValue.filter((x) => x !== i) : [...industriesValue, i])} className={industriesValue.includes(i) ? "" : "border-white/25 bg-white/10 text-white hover:bg-white/20"}>
                        {i}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="wj-animate-fade-up">
              <p className="wj-eyebrow text-brand-200">Step 3 of 3</p>
              <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-tight">How much should Wonder do on its own?</h1>
              <p className="mt-2 text-[14px] text-white/75">You can change this any time. Nothing is ever sent to an employer without your approval.</p>
              <div className="mt-6 rounded-[20px] bg-white p-3 text-ink">
                <AutomationLevelSelector value={level} onChange={setLevel} compact />
              </div>
            </div>
          )}
        </div>

        <div className="mt-8">
          <div className="mb-5 flex justify-center gap-1.5" aria-label={`Step ${step + 1} of 4`}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-5 bg-white" : "w-1.5 bg-white/40")} />
            ))}
          </div>
          {step < 3 ? (
            <Button
              size="xl"
              full
              onClick={() => {
                setConfirmingSkip(false);
                setStep((s) => s + 1);
              }}
              disabled={(step === 0 && !primaryGoal) || (step === 1 && !goalValue.trim()) || (step === 2 && parsedSkills().length === 0)}
            >
              {step === 0 ? "Get Started" : "Continue"}
            </Button>
          ) : null}
          {step === 0 && !primaryGoal && <p className="mt-3 text-center text-[13px] text-white/60">Choose one to continue — you&apos;re not locked in.</p>}
          {step === 1 && !goalValue.trim() && <p className="mt-3 text-center text-[13px] text-white/60">Add a career goal to continue.</p>}
          {step === 2 && parsedSkills().length === 0 && <p className="mt-3 text-center text-[13px] text-white/60">Add at least one skill to continue.</p>}
          {step === 3 && (
            <Button size="xl" full onClick={finish} disabled={!hydrated}>
              Run my first search
            </Button>
          )}
          {step === 0 && (
            <p className="mt-4 text-center text-sm text-white/70">
              Already have an account?{" "}
              <Link href="/sign-in" className="font-semibold text-white hover:underline">
                Sign in
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
