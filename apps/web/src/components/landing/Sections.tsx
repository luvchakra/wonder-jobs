"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, CheckCircle2, Dna, FileText, GitCompareArrows, MessageCircleQuestion, Search, Sparkles, Target, ShieldCheck, Zap, Eye, Radar } from "lucide-react";
import { JOB_SOURCES } from "@/services/mock/catalog";
import { AI_PROVIDERS, type AIProviderId } from "@/domain/ai/types";
import { ScrollReveal } from "@/components/common/ScrollReveal";
import { Button } from "@/components/common/Button";
import { WonderLogo } from "@/components/brand/WonderLogo";
import { ProviderMark } from "@/components/ai/ProviderMark";
import { HeroScene } from "./HeroScene";
import { FloatingDashboardCard } from "./ParallaxHero";
import { PhoneRunCard } from "./PhoneRunCard";
import { cn } from "@/lib/cn";
import { useSectionParallax } from "./useSectionParallax";

/* --------------------------------------------------------------- sources */
export function SourceLogoStrip() {
  const sources = JOB_SOURCES.filter((s) => s.integrated);
  return (
    <section className="bg-white py-14" aria-labelledby="sources-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <ScrollReveal>
          <p id="sources-title" className="wj-eyebrow text-center">
            Jobs from top platforms. All in one place.
          </p>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4" aria-label="Connected job sources">
            {sources.map((s) => (
              <li key={s.id} className="text-[20px] font-semibold tracking-tight text-ink-3" style={{ fontFamily: "var(--font-sans)" }}>
                {s.name}
              </li>
            ))}
            <li className="text-[13px] text-ink-4">+ more via source adapters</li>
          </ul>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- agent */
const AGENT_POINTS = [
  { icon: Radar, t: "Search everywhere", s: "One search. A bigger world of opportunities." },
  { icon: Target, t: "Find better matches", s: "Less noise. More of what matters." },
  { icon: Zap, t: "Prepare in minutes", s: "An Application Pack for your strongest matches." },
  { icon: Eye, t: "See the why", s: "Every match explains itself — and so does every hidden one." },
  { icon: ShieldCheck, t: "Stay in control", s: "Wonder prepares. The final action is always yours." },
];

export function AgentSection() {
  return (
    <section id="product" className="relative overflow-hidden bg-white py-20 md:py-28" aria-labelledby="agent-title">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.15fr_0.85fr]">
        <ScrollReveal className="relative min-h-[420px] md:min-h-[520px]">
          <div className="absolute inset-0 overflow-hidden rounded-[32px]">
            <HeroScene variant="dawn" id="agent" className="h-full w-full" withFigure={false} />
            <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />
          </div>
          <div className="relative flex h-full items-end justify-center gap-4 px-4 pb-6 pt-16 sm:px-8">
            <FloatingDashboardCard className="w-full max-w-[380px] -rotate-1" />
            <PhoneRunCard className="hidden rotate-2 sm:block" />
          </div>
        </ScrollReveal>
        <ScrollReveal delay={120}>
          <p className="wj-eyebrow text-brand-700">More than a job search</p>
          <h2 id="agent-title" className="mt-3 text-h2 font-semibold text-ink">
            An AI career agent that works <span className="wj-gradient-text">for you.</span>
          </h2>
          <ul className="mt-8 space-y-5">
            {AGENT_POINTS.map((p, i) => (
              <ScrollReveal as="li" key={p.t} delay={i * 60} className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-brand-50 text-brand-600">
                  <p.icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block text-[16px] font-semibold text-ink">{p.t}</span>
                  <span className="block text-[14px] text-ink-3">{p.s}</span>
                </span>
              </ScrollReveal>
            ))}
          </ul>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- journey */
const JOURNEY = [
  { key: "find", t: "Find", s: "Tell Wonder what you want", body: "Describe the roles you want in your own words. Wonder shows what it understood, searches live sources and removes duplicates — you see real progress, never a spinner pretending." },
  { key: "decide", t: "Decide", s: "Know where to spend your time", body: "Every opportunity says why Wonder surfaced it, what to weigh and what to do next. Compare a few side by side — Wonder points out differences, you pick." },
  { key: "apply", t: "Apply", s: "Your Application Pack, ready", body: "Tailored résumé, cover letter and screening answers in one pack, each labelled as an AI draft or your edit. Wonder opens the employer's page; the final click is yours." },
  { key: "progress", t: "Progress", s: "Keep everything moving", body: "Applications, follow-ups, interviews and replies on one timeline — and Wonder can keep watch for new roles, speaking up only when it matters." },
];

export function JourneySection() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const parallax = useSectionParallax<HTMLElement>();
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { rootMargin: "-40% 0px -45% 0px", threshold: 0 },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <section ref={parallax} id="how-it-works" className="relative overflow-hidden bg-[#0e1030] py-20 text-white md:py-28" aria-labelledby="journey-title">
      <div className="absolute inset-0" aria-hidden>
        <div data-depth="0.8" className="absolute inset-0 will-change-transform">
          <HeroScene variant="dusk" id="journey" className="h-full w-full opacity-70" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-[#0e1030] via-[#0e1030]/40 to-[#0e1030]" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <ScrollReveal className="max-w-xl">
          <p className="wj-eyebrow text-brand-200">Find → Decide → Apply → Progress</p>
          <h2 id="journey-title" className="mt-3 text-h2 font-semibold">
            Tell Wonder what you want. <span className="wj-gradient-text">It does the rest.</span>
          </h2>
          <p className="mt-4 text-[16px] text-white/75">No setup wizard and no workflow to babysit. Wonder searches, compares and prepares — then tells you what matters, so you can decide.</p>
        </ScrollReveal>
        <p data-depth="-0.6" className="wj-handwritten mt-6 text-[20px] text-white/80 will-change-transform md:absolute md:right-16 md:top-0 md:rotate-[-6deg]">
          Same you. Bigger possibilities.
        </p>

        <div className="mt-14 grid grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <ol className="relative space-y-10 lg:space-y-24" aria-label="How WonderJobs works">
            <span className="absolute left-5 top-6 hidden h-[calc(100%-3rem)] w-px bg-white/15 lg:block" aria-hidden>
              <span className="block w-full wj-gradient-bg transition-[height] duration-500" style={{ height: `${(active / (JOURNEY.length - 1)) * 100}%` }} />
            </span>
            {JOURNEY.map((j, i) => (
              <li
                key={j.key}
                data-index={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className="relative flex gap-5"
              >
                <span className={cn("relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border text-[13px] font-bold transition-all duration-300", active >= i ? "border-brand-400 bg-brand-500 text-white" : "border-white/30 bg-[#0e1030] text-white/60", active === i && "scale-110 shadow-[0_0_0_6px_rgba(109,76,245,0.25)]")}>{i + 1}</span>
                <button type="button" onClick={() => setActive(i)} aria-pressed={active === i} className="text-left">
                  <span className={cn("block text-[22px] font-semibold transition-colors", active === i ? "text-white" : "text-white/70")}>{j.t}</span>
                  <span className="block text-[13px] text-brand-200">{j.s}</span>
                  <span className={cn("mt-2 block max-w-sm text-[14px] transition-opacity duration-300", active === i ? "text-white/80 opacity-100" : "text-white/60 opacity-70")}>{j.body}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="relative mx-auto h-[400px] max-w-md">
              {JOURNEY.map((j, i) => (
                <div key={j.key} className={cn("absolute inset-0 transition-all duration-500", active === i ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-4 scale-[0.98] opacity-0")} aria-hidden={active !== i}>
                  <OutcomeCard step={j.key} title={j.t} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A faithful miniature of what the product shows at each outcome — same words the app uses. */
function OutcomeCard({ step, title }: { step: string; title: string }) {
  const icon = { find: Search, decide: Target, apply: FileText, progress: BarChart3 }[step] ?? Sparkles;
  const Icon = icon;
  return (
    <div className="wj-glass flex h-full flex-col rounded-[28px] p-6 text-ink">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-[14px] wj-gradient-bg text-white">
          <Icon className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-[12px] text-ink-3">What you see</p>
          <p className="text-[18px] font-semibold">{title}</p>
        </div>
      </div>
      <div className="mt-5 flex-1 rounded-[18px] bg-white/85 p-4 text-[13px]">
        {step === "find" && (
          <>
            <p className="font-semibold text-ink">“Senior product roles in Bengaluru or remote, preferably fintech”</p>
            <dl className="mt-3 space-y-1 text-[12px]">
              <div className="flex gap-2"><dt className="text-ink-3">Roles</dt><dd className="font-medium">“senior product”</dd><dd className="text-ink-4">from your words</dd></div>
              <div className="flex gap-2"><dt className="text-ink-3">Where</dt><dd className="font-medium">Bengaluru, Remote</dd></div>
              <div className="flex gap-2"><dt className="text-ink-3">Industry</dt><dd className="font-medium">Fintech</dd><dd className="text-ink-4">weighed, not a filter</dd></div>
            </dl>
            <ul className="mt-4 space-y-1.5">
              {["Searching the market — 412 found", "Removing duplicates — done", "Comparing with your career profile…"].map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", i < 2 ? "bg-brand-500" : "bg-brand-300 wj-animate-pulse-dot")} />
                  <span className={i < 2 ? "text-ink" : "text-ink-2"}>{s}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {step === "decide" && (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-ink">Senior Product Manager, Payments</p>
                <p className="text-[12px] text-ink-3">Cobalt Pay · Bengaluru · Hybrid</p>
              </div>
              <span className="shrink-0 rounded-full bg-success-100 px-2 py-0.5 text-[11px] font-semibold text-success-600">Strong</span>
            </div>
            <p className="mt-3 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">Why Wonder surfaced this</p>
            <ul className="mt-1 space-y-1 text-[12.5px] text-ink-2">
              <li>✓ Strong overlap with your skills</li>
              <li>✓ Fintech is one of your target industries</li>
            </ul>
            <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">Things to consider</p>
            <p className="mt-1 text-[12.5px] text-ink-2">⚠ Compensation isn&apos;t disclosed</p>
            <p className="mt-3 rounded-[10px] bg-brand-50 px-2.5 py-1.5 text-[12px] text-brand-700">Wonder&apos;s next suggestion: Prepare an application</p>
          </>
        )}
        {step === "apply" && (
          <>
            <p className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
              <CheckCircle2 className="size-4 text-success-600" aria-hidden /> Application ready
            </p>
            <ul className="mt-3 space-y-1.5 text-[12.5px]">
              {[
                ["Tailored résumé", "Edited by you"],
                ["Cover letter", "AI-generated draft"],
                ["Screening answers", "AI-generated draft"],
              ].map(([t, s]) => (
                <li key={t} className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{t}</span>
                  <span className="text-ink-3">{s}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-[10px] bg-surface-2 px-2.5 py-2 text-[12px] text-ink-2">
              <strong className="text-ink">The final action is yours.</strong> Wonder opens the employer&apos;s page; it never submits for you.
            </p>
          </>
        )}
        {step === "progress" && (
          <>
            <p className="font-semibold text-ink">Your progress</p>
            <ul className="mt-2 grid grid-cols-2 gap-2">
              {[
                ["3", "applications active"],
                ["1", "interview this week"],
                ["1", "follow-up due"],
                ["1", "employer replied"],
              ].map(([n, l]) => (
                <li key={l} className="rounded-[10px] border border-line bg-white px-2.5 py-2">
                  <span className="block text-[17px] font-semibold text-ink">{n}</span>
                  <span className="block text-[11px] text-ink-3">{l}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-center gap-2 rounded-[10px] bg-success-100/60 px-2.5 py-2 text-[12px] text-ink-2">
              <Radar className="size-3.5 text-success-600" aria-hidden /> Wonder is working · Next search tomorrow at 8:00
            </p>
          </>
        )}
      </div>
      <p className="mt-4 text-[12px] text-ink-3">Illustrative example. Every number in your account comes from real postings and your own applications.</p>
    </div>
  );
}

/* ------------------------------------------------------------ features */
const FEATURES = [
  { icon: Search, t: "Find opportunities", s: "Say what you want in your own words. Wonder shows what it understood before it searches.", href: "/demo?next=/app/runs/new" },
  { icon: MessageCircleQuestion, t: "Ask Wonder", s: "“What should I focus on today?” — answered from your own data, one keystroke away.", href: "/demo?next=/app" },
  { icon: Target, t: "Why it fits", s: "Every match explains itself: why it surfaced, what to weigh, what to do next.", href: "/demo?next=/app/jobs" },
  { icon: GitCompareArrows, t: "Compare opportunities", s: "Put two to four roles side by side. Real differences, no fake winner.", href: "/demo?next=/app/jobs" },
  { icon: FileText, t: "Application Pack", s: "Résumé, cover letter and answers in one place — each labelled AI draft or yours.", href: "/demo?next=/app/applications/app_razorpay/prepare" },
  { icon: Dna, t: "Career Profile", s: "Import your résumé; conflicts are shown side by side, never silently overwritten.", href: "/demo?next=/app/career-dna" },
];

export function FeatureGrid() {
  return (
    <section id="features" className="bg-white py-20 md:py-28" aria-labelledby="features-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <ScrollReveal className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="wj-eyebrow text-brand-700">Powerful by design</p>
            <h2 id="features-title" className="mt-3 text-h2 font-semibold text-ink">
              Everything you need.
              <br />
              <span className="wj-gradient-text">Nothing you don&apos;t.</span>
            </h2>
          </div>
          <a href="/demo" className="inline-flex items-center gap-1 text-[14px] font-semibold text-brand-600 hover:underline">
            Try it in the demo <ArrowRight className="size-4" aria-hidden />
          </a>
        </ScrollReveal>
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <ScrollReveal as="li" key={f.t} delay={(i % 3) * 70}>
              <Link href={f.href} className="wj-elevate group relative flex h-full flex-col overflow-hidden rounded-[22px] border border-line bg-surface-2 p-6">
                <span className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-brand-100/60 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" aria-hidden />
                <span className="relative flex size-11 items-center justify-center rounded-[13px] bg-brand-50 text-brand-600 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-105">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <span className="relative mt-4 text-[17px] font-semibold text-ink">{f.t}</span>
                <span className="relative mt-1.5 flex-1 text-[14px] leading-relaxed text-ink-3">{f.s}</span>
                <span className="relative mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-600">
                  See it in the demo <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </ScrollReveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ personas */
const PERSONAS: { key: string; label: string; headline: string; points: string[] }[] = [
  { key: "seekers", label: "Job Seekers", headline: "Stop doom-scrolling job boards.", points: ["One search across every connected platform", "Strong matches surfaced first, with the reasons why", "Applications tracked from saved to offer"] },
  { key: "switchers", label: "Career Switchers", headline: "See paths you never considered.", points: ["Matching that values transferable skills, not just titles", "Stretch opportunities flagged honestly", "Materials that translate your experience for a new field"] },
  { key: "senior", label: "Senior Professionals", headline: "Signal over noise, at your level.", points: ["Seniority-aware ranking and compensation alignment", "Hiring-confidence signals before you invest time", "Quiet scheduled runs — you hear only when it matters"] },
  { key: "students", label: "Students", headline: "Your first move, minus the chaos.", points: ["Entry-level roles and internships, clearly labelled", "Screening answers drafted for you to make your own", "A timeline that keeps deadlines in view"] },
  { key: "global", label: "Global Talent", headline: "Find work across borders.", points: ["Remote and relocation-friendly roles in one view", "Locations and currencies handled properly", "Follow-ups timed to the employer's timezone"] },
];

export function PersonaSection() {
  const [active, setActive] = useState(PERSONAS[0].key);
  const p = PERSONAS.find((x) => x.key === active)!;
  return (
    <section id="personas" className="bg-surface-2 py-20 md:py-28" aria-labelledby="personas-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <ScrollReveal className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="wj-eyebrow text-brand-700">Built for every kind of job seeker</p>
            <h2 id="personas-title" className="mt-3 text-h2 font-semibold text-ink">
              Different goals. <span className="wj-gradient-text">Same support.</span>
            </h2>
          </div>
          <div role="tablist" aria-label="Who WonderJobs is for" className="flex flex-wrap gap-2">
            {PERSONAS.map((x) => (
              <button key={x.key} role="tab" type="button" aria-selected={active === x.key} onClick={() => setActive(x.key)} className={cn("h-9 rounded-full border px-4 text-[13px] font-medium transition-colors", active === x.key ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white text-ink-2 hover:border-line-strong")}>
                {x.label}
              </button>
            ))}
          </div>
        </ScrollReveal>
        <div role="tabpanel" className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-[24px] bg-ink p-7 text-white md:col-span-1">
            <p className="text-[12px] uppercase tracking-wide text-white/60">{p.label}</p>
            <p className="mt-3 text-[26px] font-semibold leading-tight tracking-tight">{p.headline}</p>
            <p className="mt-4 text-[13px] text-white/70">You bring the ambition. Wonder brings the workflow.</p>
          </div>
          {p.points.map((pt, i) => (
            <div key={pt} className="wj-card flex flex-col justify-between p-6">
              {/* Purely decorative ordinal — the point itself is read from the paragraph below. brand-400 (not
                  the lighter brand-200, which is meant for dark backgrounds) keeps this ≥3:1 on the white card,
                  which 28px semibold qualifies for as WCAG "large text". */}
              <span className="text-[28px] font-semibold text-brand-400" aria-hidden="true">
                0{i + 1}
              </span>
              <p className="mt-6 text-[16px] font-medium text-ink">{pt}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[12px] text-ink-4">Example scenarios, not customer quotes. Testimonials appear here once real ones exist.</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ providers */
export function ProviderSection() {
  const ids: AIProviderId[] = ["wonderjobs", "anthropic", "openai", "gemini"];
  return (
    <section id="ai" className="relative overflow-hidden bg-[#090b22] py-20 text-white md:py-28" aria-labelledby="ai-title">
      <div className="absolute inset-0 opacity-60" aria-hidden>
        <svg className="h-full w-full" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="ai-rib" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#6d4cf5" stopOpacity="0.9" />
              <stop offset="1" stopColor="#3b7bff" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M-100 ${420 + i * 40} C 300 ${300 + i * 30}, 700 ${560 - i * 20}, 1300 ${380 + i * 50}`} fill="none" stroke="url(#ai-rib)" strokeWidth={26 - i * 6} strokeLinecap="round" opacity={0.35 - i * 0.08} />
          ))}
        </svg>
      </div>
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <ScrollReveal>
          <p className="wj-eyebrow text-brand-200">Your AI, your choice</p>
          <h2 id="ai-title" className="mt-3 text-h2 font-semibold">
            Bring your own AI.
            <br />
            <span className="wj-gradient-text">Or let us handle it.</span>
          </h2>
          <p className="mt-5 max-w-md text-[16px] text-white/75">Use WonderJobs AI or connect your own API key. WonderJobs supports Anthropic, OpenAI and Gemini — keys are encrypted, never shown again, and billed only by your provider.</p>
          <Button href="/app/settings/ai" variant="glass" size="lg" className="mt-8 rounded-full text-ink" iconRight={<ArrowRight className="size-4" aria-hidden />}>
            Learn more
          </Button>
        </ScrollReveal>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2" aria-label="Supported AI providers">
          {ids.map((id, i) => (
            <ScrollReveal as="li" key={id} delay={i * 70}>
              <div className="flex h-full flex-col items-center rounded-[22px] border border-white/10 bg-white/5 p-5 text-center backdrop-blur">
                <ProviderMark id={id} size={44} className="border-white/10 bg-white" />
                <span className="mt-3 text-[14px] font-semibold">{AI_PROVIDERS[id].name}</span>
                <span className="text-[12px] text-white/60">{AI_PROVIDERS[id].tagline}</span>
              </div>
            </ScrollReveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- extension */
export function ExtensionSection() {
  const fills = [
    { label: "First name", value: "Kunal" },
    { label: "Last name", value: "Chakraborty" },
    { label: "Email", value: "you@example.com" },
    { label: "Resume / CV", value: "Coinbase-Resume.docx", file: true },
  ];
  return (
    <section id="extension" className="bg-white py-20 md:py-28" aria-labelledby="extension-title">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <ScrollReveal>
          <p className="wj-eyebrow text-brand-600">Browser extension</p>
          <h2 id="extension-title" className="mt-3 text-h2 font-semibold tracking-tight">
            Apply without
            <br />
            <span className="wj-gradient-text">retyping yourself.</span>
          </h2>
          <p className="mt-5 max-w-md text-[16px] text-ink-2">
            WonderJobs tailors your resume and cover letter. The extension puts them straight into the employer&apos;s own form on Greenhouse, Lever and Ashby — and never submits anything for you.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button href="/extension" size="lg" className="rounded-full" iconRight={<ArrowRight className="size-4" aria-hidden />}>
              Get the extension
            </Button>
            <span className="text-[13px] text-ink-3">Free · Chrome, Edge &amp; Brave</span>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={90}>
          <div className="wj-card overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-danger-600/60" aria-hidden />
              <span className="size-2.5 rounded-full bg-warning-600/60" aria-hidden />
              <span className="size-2.5 rounded-full bg-success-600/60" aria-hidden />
              <span className="ml-2 truncate text-[12px] text-ink-3">boards.greenhouse.io/…/apply</span>
            </div>
            <div className="flex flex-col gap-3 p-5">
              {fills.map((f, i) => (
                <ScrollReveal key={f.label} delay={140 + i * 80}>
                  <div className="rounded-[12px] border border-line px-3 py-2">
                    <p className="text-[11px] font-medium text-ink-3">{f.label}</p>
                    <p className={cn("mt-0.5 text-[14px] font-medium", f.file ? "text-brand-700" : "text-ink")}>{f.value}</p>
                  </div>
                </ScrollReveal>
              ))}
              <ScrollReveal delay={480}>
                <p className="inline-flex items-center gap-1.5 rounded-full bg-success-100 px-3 py-1.5 text-[12px] font-semibold text-success-600">
                  <Zap className="size-3.5" aria-hidden /> Filled by WonderJobs
                </p>
              </ScrollReveal>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ final CTA */
export function FinalCTA() {
  return (
    <section id="cta" className="relative overflow-hidden bg-[#04061a] py-24 text-center text-white md:py-32" aria-labelledby="cta-title">
      <div className="absolute inset-0" aria-hidden>
        <HeroScene variant="night" id="cta" className="h-full w-full opacity-80" withFigure={false} />
        <div className="absolute inset-x-0 bottom-[-40%] mx-auto aspect-square w-[140%] rounded-full bg-[radial-gradient(circle_at_50%_0%,#3b7bff_0%,#1a1f5c_40%,transparent_70%)] opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#04061a]/60 via-transparent to-[#04061a]" />
      </div>
      <ScrollReveal className="relative mx-auto max-w-2xl px-4">
        <p className="wj-eyebrow text-brand-200">A brighter tomorrow starts today</p>
        <h2 id="cta-title" className="mt-3 text-h1 font-semibold">
          Ready to find what&apos;s next?
        </h2>
        <p className="mt-4 text-[17px] text-white/75">Stop searching harder. Start searching smarter.</p>
        <Button href="/sign-up" size="xl" className="mt-8 rounded-full" iconRight={<ArrowRight className="size-4" aria-hidden />}>
          Get Started Free
        </Button>
        <p className="mt-4 text-[12px] text-white/60">No credit card required</p>
        <p className="wj-handwritten mt-10 text-[20px] text-white/70">The future works for you.</p>
      </ScrollReveal>
    </section>
  );
}

/* --------------------------------------------------------------- footer */
const FOOTER: { title: string; links: { label: string; href: string; badge?: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Ask Wonder", href: "/#ask-wonder" },
      { label: "You stay in control", href: "/#control" },
      { label: "Features", href: "/#features" },
      { label: "Screens", href: "/#screens" },
      { label: "Who it's for", href: "/#personas" },
      { label: "Your AI, your keys", href: "/#ai" },
      { label: "Browser extension", href: "/extension" },
      { label: "Live demo", href: "/demo" },
      { label: "Pricing", href: "/#cta", badge: "Free" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Help center", href: "/help" },
      { label: "User guide", href: "/help#getting-started" },
      { label: "FAQ", href: "/help#faq" },
      { label: "Roadmap", href: "/help#roadmap" },
      { label: "Job sources", href: "/help#sources" },
      { label: "Learning", href: "/app/learning" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact us", href: "/#contact" },
      { label: "Careers", href: "/about#careers" },
      { label: "Press", href: "/#contact" },
      { label: "Security", href: "/security" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign in", href: "/sign-in" },
      { label: "Create account", href: "/sign-up" },
      { label: "Forgot password", href: "/forgot-password" },
      { label: "AI settings", href: "/app/settings/ai" },
      { label: "Get help", href: "/help" },
    ],
  },
];

const LEGAL = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Cookies", href: "/cookies" },
  { label: "Security", href: "/security" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-white pt-14" aria-label="Footer">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-4 sm:px-6 md:grid-cols-6">
        <div className="col-span-2">
          <WonderLogo />
          <p className="mt-2 text-[12px] text-ink-3">Find. Grow. Belong.</p>
          <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-ink-3">Tell Wonder what you want. It searches real sources, explains every match and prepares applications you approve. It never applies on your behalf.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button href="/sign-up" size="sm" className="rounded-full">
              Get started free
            </Button>
            <Button href="/demo" variant="outline" size="sm" className="rounded-full">
              Try the demo
            </Button>
          </div>
        </div>
        {FOOTER.map((c) => (
          <div key={c.title}>
            <p className="text-[13px] font-semibold text-ink">{c.title}</p>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
                    {l.label}
                    {l.badge && <span className="rounded-full bg-success-100 px-1.5 py-0.5 text-[10px] font-semibold text-success-600">{l.badge}</span>}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-12 flex max-w-7xl flex-col gap-3 border-t border-line px-4 py-6 text-[12px] text-ink-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} WonderJobs. All rights reserved.</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-1" aria-label="Legal">
          {LEGAL.map((l) => (
            <li key={l.label}>
              <a href={l.href} className="hover:text-ink">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
