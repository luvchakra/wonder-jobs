import type { Metadata } from "next";
import Link from "next/link";
import { Compass, FileEdit, Sparkles, ShieldCheck } from "lucide-react";
import { HeroScene } from "@/components/landing/HeroScene";
import { WonderMark } from "@/components/brand/WonderLogo";
import { Button } from "@/components/common/Button";

export const metadata: Metadata = { title: "Get started" };

const FEATURES = [
  { icon: Compass, label: "Find the right opportunities" },
  { icon: FileEdit, label: "Tailor your applications" },
  { icon: Sparkles, label: "Save time with AI" },
  { icon: ShieldCheck, label: "Stay in control" },
];

export default function OnboardingPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink text-white">
      <HeroScene variant="dusk" className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/20 to-ink/90" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-10 md:max-w-lg md:justify-center">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-lg font-semibold">
            <WonderMark size={30} /> WonderJobs
          </span>
          <Link href="/app" className="text-sm font-medium text-white/80 hover:text-white">
            Skip
          </Link>
        </div>
        <div className="mt-14 md:mt-16">
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
        <div className="mt-auto pt-12">
          <div className="mb-5 flex justify-center gap-1.5" aria-hidden>
            <span className="h-1.5 w-5 rounded-full bg-white" />
            <span className="size-1.5 rounded-full bg-white/40" />
            <span className="size-1.5 rounded-full bg-white/40" />
          </div>
          <Button size="xl" full href="/app/runs/new">
            Get Started
          </Button>
          <p className="mt-4 text-center text-sm text-white/70">
            Already have an account?{" "}
            <Link href="/app" className="font-semibold text-white hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
