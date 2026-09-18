"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Compass, FileEdit, Sparkles, ShieldCheck, ArrowLeft } from "lucide-react";
import type { AutomationLevel } from "@/domain/automation/policy";
import { HeroScene } from "@/components/landing/HeroScene";
import { WonderMark } from "@/components/brand/WonderLogo";
import { Button } from "@/components/common/Button";
import { Textarea, Input } from "@/components/common/Input";
import { AutomationLevelSelector } from "@/components/automation/AutomationLevelSelector";
import { StoreHydrator } from "@/store/StoreHydrator";
import { useHydration } from "@/store/hydration";
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
  const goalValue = goal ?? dna.careerGoal;
  const locValue = locations ?? dna.preferredLocations.join(", ");

  const finish = () => {
    updateDNA({ careerGoal: goalValue.trim() || dna.careerGoal, preferredLocations: locValue.split(",").map((s) => s.trim()).filter(Boolean) });
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
            <span className="inline-flex items-center gap-2 text-lg font-semibold">
              <WonderMark size={30} /> WonderJobs
            </span>
          ) : (
            <button type="button" onClick={() => setStep((s) => s - 1)} className="inline-flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white">
              <ArrowLeft className="size-4" aria-hidden /> Back
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              completeOnboarding();
              router.push(next);
            }}
            className="text-sm font-medium text-white/80 hover:text-white"
          >
            Skip
          </button>
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
              <p className="wj-eyebrow text-brand-200">Step 1 of 2</p>
              <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-tight">What are you looking for?</h1>
              <p className="mt-2 text-[14px] text-white/75">Plain language is perfect. This becomes your career goal — Wonder uses it to judge every match.</p>
              <div className="mt-6 flex flex-col gap-4">
                <Textarea value={goalValue} onChange={(e) => setGoal(e.target.value)} aria-label="Career goal" className="min-h-24 border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-brand-300 focus:ring-brand-500/30" placeholder="e.g. Senior product roles at fintech companies, remote or Bengaluru" disabled={!hydrated} />
                <Input value={locValue} onChange={(e) => setLocations(e.target.value)} aria-label="Preferred locations" className="border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-brand-300 focus:ring-brand-500/30" placeholder="Preferred locations, comma-separated" disabled={!hydrated} />
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="wj-animate-fade-up">
              <p className="wj-eyebrow text-brand-200">Step 2 of 2</p>
              <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-tight">How much should Wonder do on its own?</h1>
              <p className="mt-2 text-[14px] text-white/75">You can change this any time. Nothing is ever sent to an employer without your approval.</p>
              <div className="mt-6 rounded-[20px] bg-white p-3 text-ink">
                <AutomationLevelSelector value={level} onChange={setLevel} compact />
              </div>
            </div>
          )}
        </div>

        <div className="mt-8">
          <div className="mb-5 flex justify-center gap-1.5" aria-label={`Step ${step + 1} of 3`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-5 bg-white" : "w-1.5 bg-white/40")} />
            ))}
          </div>
          {step < 2 ? (
            <Button size="xl" full onClick={() => setStep((s) => s + 1)} disabled={step === 1 && !goalValue.trim()}>
              {step === 0 ? "Get Started" : "Continue"}
            </Button>
          ) : (
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
