"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Compass, FileEdit, Sparkles, ShieldCheck, ArrowLeft } from "lucide-react";
import type { AutomationLevel } from "@/domain/automation/policy";
import { INDUSTRIES, type CareerDNA } from "@/domain/career/types";
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

const FEATURES = [
  { icon: Compass, label: "Find the right opportunities" },
  { icon: FileEdit, label: "Tailor your applications" },
  { icon: Sparkles, label: "Save time with AI" },
  { icon: ShieldCheck, label: "Stay in control" },
];

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

/** Three-step onboarding (spec §5.1): welcome → career goal → automation level. Writes real Career DNA. */
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
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/app/runs/new";
  const hydrated = useHydration((s) => s.hydrated);
  const dna = useCareerStore((s) => s.dna);
  const updateDNA = useCareerStore((s) => s.updateDNA);
  const completeOnboarding = useCareerStore((s) => s.completeOnboarding);
  const setDefaultLevel = useAutomationStore((s) => s.setDefaultLevel);
  const [step, setStep] = useState(0);
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
    track("onboarding_completed", { level });
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
              <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tight md:text-[52px]">
                A smarter
                <br />
                way to your
                <br />
                next opportunity
              </h1>
              <p className="mt-3 text-[15px] text-white/80">We search. We analyze. You move forward.</p>
              <ul className="mt-7 flex flex-col gap-2.5" aria-label="What Wonder does">
                {FEATURES.map((f) => (
                  <li key={f.label} className="inline-flex w-fit items-center gap-2.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[13px] font-medium backdrop-blur">
                    <f.icon className="size-4 text-brand-200" aria-hidden /> {f.label}
                  </li>
                ))}
              </ul>
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
                  onApply={(patch) => {
                    // Straight into the fields on screen, not into the store: this is still a draft the
                    // candidate is editing, and nothing is saved until they finish onboarding.
                    if (patch.headline !== undefined) setHeadline(patch.headline);
                    if (patch.seniority !== undefined) setSeniority(patch.seniority);
                    if (patch.yearsExperience !== undefined) setYears(String(patch.yearsExperience));
                    if (patch.skills?.length) setSkillsText(patch.skills.map((s) => s.name).join(", "));
                    if (patch.industries?.length) setIndustries(patch.industries.filter((i) => INDUSTRIES.includes(i)));
                    if (patch.preferredLocations?.length && !locations) setLocations(patch.preferredLocations.join(", "));
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
              disabled={(step === 1 && !goalValue.trim()) || (step === 2 && parsedSkills().length === 0)}
            >
              {step === 0 ? "Get Started" : "Continue"}
            </Button>
          ) : null}
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
