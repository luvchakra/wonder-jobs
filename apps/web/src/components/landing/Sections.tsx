"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Dna, FileText, Search, Sparkles, Target, ShieldCheck, Zap, Eye, Radar } from "lucide-react";
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
  { icon: Zap, t: "Automate the repetitive work", s: "Save time. Stay focused." },
  { icon: Eye, t: "Get clear, unbiased insights", s: "Understand why a job fits." },
  { icon: ShieldCheck, t: "Stay in control", s: "Review, adjust, or take over — anytime." },
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
  { key: "search", t: "Search", s: "Across platforms", body: "Wonder scans every connected source and collapses duplicates, so you see each role once.", stat: "1,842 → 1,124 unique" },
  { key: "analyze", t: "Analyze", s: "Understand & match", body: "Every posting is read for skills, seniority, location and pay — then scored against your Career DNA.", stat: "94% match · Strong Opportunity" },
  { key: "prepare", t: "Prepare", s: "Tailor your application", body: "Resume, cover letter and screening answers, drafted for the role and left for you to edit.", stat: "3 applications ready for review" },
  { key: "track", t: "Track", s: "Keep everything in one place", body: "Submissions, follow-ups and interviews on one timeline — and Wonder learns what works.", stat: "Interview rate 3.2× higher" },
];

export function JourneySection() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
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
    <section id="how-it-works" className="relative overflow-hidden bg-[#0e1030] py-20 text-white md:py-28" aria-labelledby="journey-title">
      <div className="absolute inset-0" aria-hidden>
        <HeroScene variant="dusk" id="journey" className="h-full w-full opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0e1030] via-[#0e1030]/40 to-[#0e1030]" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <ScrollReveal className="max-w-xl">
          <p className="wj-eyebrow text-brand-200">From search to success</p>
          <h2 id="journey-title" className="mt-3 text-h2 font-semibold">
            A smoother journey to what&apos;s <span className="wj-gradient-text">next.</span>
          </h2>
          <p className="mt-4 text-[16px] text-white/75">Wonder runs the entire job-search process — from discovery to application prep — so you can focus on what really matters: your future.</p>
        </ScrollReveal>
        <p className="wj-handwritten mt-6 text-[20px] text-white/80 md:absolute md:right-16 md:top-0 md:rotate-[-6deg]">Same you. Bigger possibilities.</p>

        <div className="mt-14 grid grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <ol className="relative space-y-10 lg:space-y-24" aria-label="Journey stages">
            <svg className="absolute left-5 top-6 hidden h-[calc(100%-3rem)] w-px lg:block" aria-hidden>
              <line x1="0" y1="0" x2="0" y2="100%" stroke="rgba(255,255,255,0.25)" strokeDasharray="4 6" />
            </svg>
            {JOURNEY.map((j, i) => (
              <li
                key={j.key}
                data-index={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className="relative flex gap-5"
              >
                <span className={cn("relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border text-[13px] font-bold transition-colors duration-300", active >= i ? "border-brand-400 bg-brand-500 text-white" : "border-white/30 bg-white/5 text-white/60")}>{i + 1}</span>
                <button type="button" onClick={() => setActive(i)} className="text-left">
                  <span className={cn("block text-[22px] font-semibold transition-colors", active === i ? "text-white" : "text-white/70")}>{j.t}</span>
                  <span className="block text-[13px] text-brand-200">{j.s}</span>
                  <span className={cn("mt-2 block max-w-sm text-[14px] transition-opacity duration-300", active === i ? "text-white/80 opacity-100" : "text-white/60 opacity-70")}>{j.body}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="relative mx-auto h-[380px] max-w-md" aria-live="polite">
              {JOURNEY.map((j, i) => (
                <div key={j.key} className={cn("absolute inset-0 transition-all duration-500", active === i ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0")} aria-hidden={active !== i}>
                  <StageCard index={i} stat={j.stat} title={j.t} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StageCard({ index, stat, title }: { index: number; stat: string; title: string }) {
  const icons = [Search, BarChart3, FileText, Sparkles];
  const Icon = icons[index];
  return (
    <div className="wj-glass h-full rounded-[28px] p-6 text-ink">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-[14px] bg-brand-500 text-white">
          <Icon className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-[12px] text-ink-3">Stage {index + 1}</p>
          <p className="text-[18px] font-semibold">{title}</p>
        </div>
      </div>
      <div className="mt-5 rounded-[18px] bg-white/80 p-4">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Live example</p>
        <p className="mt-1 text-[20px] font-semibold tracking-tight">{stat}</p>
        <div className="mt-4 space-y-2">
          {[92, 68, 44].map((w, i) => (
            <div key={i} className="h-2 rounded-full bg-bg-soft">
              <div className="h-2 rounded-full bg-brand-400" style={{ width: `${Math.max(20, w - index * 8)}%` }} />
            </div>
          ))}
        </div>
      </div>
      <p className="mt-5 text-[13px] text-ink-3">Every stage shows progress, counts and evidence. Never hidden reasoning.</p>
    </div>
  );
}

/* ------------------------------------------------------------ features */
const FEATURES = [
  { icon: Dna, t: "Career DNA", s: "A deeper understanding of you", href: "/app/career-dna" },
  { icon: Zap, t: "Wonder Runs", s: "On-demand or scheduled automation", href: "/app/runs" },
  { icon: Target, t: "AI-Powered Matching", s: "Find opportunities that actually fit", href: "/app/jobs" },
  { icon: FileText, t: "Application Prep", s: "Tailored resumes, answers and more", href: "/app/applications" },
  { icon: BarChart3, t: "Track & Learn", s: "Turn activity into insights", href: "/app/insights" },
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
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((f, i) => (
            <ScrollReveal as="li" key={f.t} delay={i * 60}>
              <Link href={f.href} className="wj-elevate flex h-full flex-col rounded-[22px] border border-line bg-surface-2 p-5">
                <span className="flex size-10 items-center justify-center rounded-[12px] bg-brand-50 text-brand-600">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <span className="mt-4 text-[16px] font-semibold text-ink">{f.t}</span>
                <span className="mt-1 text-[13px] text-ink-3">{f.s}</span>
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
          <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-ink-3">An AI job-search agent that searches real sources, explains every match and prepares applications you approve. It never applies on your behalf.</p>
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
