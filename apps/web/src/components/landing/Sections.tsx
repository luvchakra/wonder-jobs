"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bell, CalendarDays, CheckCircle2, Dna, FileText, GitCompareArrows, Hand, KeyRound, LayoutList, LayoutTemplate, MessageCircleQuestion, MousePointerClick, Search, Smartphone, Sparkles, Target, ShieldCheck, Zap, Eye, Radar } from "lucide-react";
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
/** Employer boards JobsLake reads directly (its built-in ATS sources), then the open feeds. */
const EMPLOYER_BOARDS = ["Greenhouse", "Lever", "Ashby"];

export function SourceLogoStrip() {
  const sources = [...EMPLOYER_BOARDS, ...JOB_SOURCES.filter((s) => s.integrated && s.id !== "careers").map((s) => s.name)];
  return (
    <section className="bg-white py-14" aria-labelledby="sources-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <ScrollReveal>
          <p id="sources-title" className="wj-eyebrow text-center">
            Live jobs from employers&apos; own boards, SmartRecruiters, The Muse, Adzuna India and open remote feeds. De-duplicated, the source named on every listing.
          </p>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4" aria-label="Connected job sources">
            {sources.map((name) => (
              <li key={name} className="text-[20px] font-semibold tracking-tight text-ink-3" style={{ fontFamily: "var(--font-sans)" }}>
                {name}
              </li>
            ))}
            <li className="text-[13px] text-ink-4">+ companies&apos; own career sites on Greenhouse, Lever, Ashby, SmartRecruiters and JazzHR, each added only after a real test</li>
          </ul>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- agent */
const AGENT_POINTS = [
  { icon: Radar, t: "Search everywhere", s: "Type any role — “psychology in Mumbai” — and every source answers it, in any form of the word." },
  { icon: Target, t: "Know the pay and the level", s: "Designation, remuneration and source on every listing — “Not listed” when the employer didn't say." },
  { icon: Zap, t: "Prepare in minutes", s: "An Application Pack and a résumé from eight ATS-friendly templates." },
  { icon: MousePointerClick, t: "Apply without retyping", s: "Wonder fills the employer's form — on your computer or your phone. You answer what's yours and submit." },
  { icon: Eye, t: "See the why", s: "Every match explains itself — and so does every hidden one." },
  { icon: ShieldCheck, t: "Stay in control", s: "Wonder prepares. It submits only where you switch that on." },
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
/**
 * Search to submitted, step by step. Each step shows the real screen (the app in demo mode with its
 * sample data — captured from the product, not drawn) except the employer's form, which is drawn because
 * it's the employer's page, not ours, and says so.
 */
type JourneyStep = { key: string; t: string; s: string; body: string; shot?: { src: string; w: number; h: number; alt: string }; plan?: string };
const JOURNEY: JourneyStep[] = [
  { key: "ask", t: "Tell Wonder the role", s: "Or upload your CV and let it read the rest", body: "Type a role and a place, say it, or let your Career Profile decide. One tap searches.", shot: { src: "/landing/step-1-search.webp", w: 780, h: 620, alt: "The Find screen: what you're looking for, the search box, and the jobs found" } },
  { key: "search", t: "It searches real job sources", s: "Employers' own career sites, job boards and feeds", body: "Every listing shows the designation, the pay and where it was found — duplicates merged, closed postings dropped.", shot: { src: "/landing/step-2-listing.webp", w: 716, h: 446, alt: "A job listing with designation, salary and source" } },
  { key: "why", t: "Every match explains itself", s: "Why it fits, and what to weigh", body: "Wonder compares each posting with your profile and says why it ranked it there — and what might make you hesitate.", shot: { src: "/landing/step-3-why.webp", w: 716, h: 500, alt: "Wonder's take: why this job fits and why you might hesitate" } },
  { key: "apply", t: "Tap Apply with Wonder", s: "Résumé, details and answers, checked first", body: "Wonder checks what the form will need, picks your résumé, and lists what stays yours to answer. Then one button: Start application.", shot: { src: "/landing/step-4-ready.webp", w: 716, h: 958, alt: "Ready to apply: résumé, contact details and answers checked, with a Start application button" }, plan: "Pro" },
  { key: "fill", t: "Wonder fills the employer's form", s: "On your computer, or right in the app on your phone", body: "The browser helper fills the form on the employer's own site — on a phone, the page opens inside WonderJobs. You review and press Submit, or turn on Submit for me.", plan: "Pro" },
  { key: "track", t: "Track it in Pipeline", s: "Follow-ups, interviews and outcomes", body: "Preparing, applied, interview, outcome — with the next step on every card, and a nudge when something needs you.", shot: { src: "/landing/step-6-pipeline.webp", w: 780, h: 606, alt: "Pipeline: counts by stage and an application with its next step" } },
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
    <section ref={parallax} id="how-it-works" className="relative overflow-clip bg-[#0e1030] py-20 text-white md:py-28" aria-labelledby="journey-title">
      <div className="absolute inset-0" aria-hidden>
        <div data-depth="0.8" className="absolute inset-0 will-change-transform">
          <HeroScene variant="dusk" id="journey" className="h-full w-full opacity-70" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-[#0e1030] via-[#0e1030]/40 to-[#0e1030]" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <ScrollReveal className="max-w-xl">
          <p className="wj-eyebrow text-brand-200">How it works</p>
          <h2 id="journey-title" className="mt-3 text-h2 font-semibold">
            From search to submitted. <span className="wj-gradient-text">A few taps.</span>
          </h2>
          <p className="mt-4 text-[16px] text-white/75">Find, Saved, Pipeline and You — that is the whole app. Wonder searches, explains and fills; you decide and submit.</p>
        </ScrollReveal>

        <div className="mt-14 grid grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <ol className="relative space-y-12 lg:space-y-24" aria-label="How WonderJobs works">
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
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => setActive(i)} aria-pressed={active === i} className="text-left">
                    <span className={cn("flex flex-wrap items-center gap-2 text-[22px] font-semibold transition-colors", active === i ? "text-white" : "text-white/70")}>
                      {j.t}
                      {j.plan && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-100">{j.plan}</span>}
                    </span>
                    <span className="block text-[13px] text-brand-200">{j.s}</span>
                    <span className={cn("mt-2 block max-w-sm text-[14px] transition-opacity duration-300", active === i ? "text-white/80 opacity-100" : "text-white/60 opacity-70")}>{j.body}</span>
                  </button>
                  {/* On a phone each step carries its own screen; on a wide screen they share the sticky frame. */}
                  <div className="mt-5 lg:hidden">
                    <StepScreen step={j} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
            <div className="relative mx-auto h-[560px] max-w-md">
              {JOURNEY.map((j, i) => (
                <div key={j.key} className={cn("absolute inset-0 flex items-center justify-center transition-all duration-500", active === i ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-4 scale-[0.98] opacity-0")} aria-hidden={active !== i}>
                  <StepScreen step={j} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** One step's screen: the real app (sample data) in a card, or — for the employer's form — a labelled drawing. */
function StepScreen({ step }: { step: JourneyStep }) {
  return (
    <figure className="mx-auto w-full max-w-[380px]">
      <div className="overflow-hidden rounded-[24px] bg-[#f5f5fb] p-2 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
        {step.shot ? <Image src={step.shot.src} width={step.shot.w} height={step.shot.h} alt={step.shot.alt} className="h-auto max-h-[500px] w-full rounded-[18px] object-contain" sizes="380px" /> : <FormFillDrawing />}
      </div>
      <figcaption className="mt-2 text-center text-[11px] text-white/55">{step.shot ? "The real app · sample data" : "Illustration · the employer's own form"}</figcaption>
    </figure>
  );
}

/** The employer's form as the helper leaves it: filled from the candidate's own data, the rest left for them. */
function FormFillDrawing() {
  const rows: [string, string, "filled" | "yours"][] = [
    ["Full name", "From your profile", "filled"],
    ["Email · Phone", "From your profile", "filled"],
    ["Résumé", "Your chosen résumé, attached", "filled"],
    ["Notice period", "Your saved answer", "filled"],
    ["Work authorization", "Yours to answer", "yours"],
  ];
  return (
    <div className="rounded-[18px] bg-white p-4 text-ink">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">careers.example.com · Apply</p>
      <ul className="mt-3 space-y-2">
        {rows.map(([label, note, state]) => (
          <li key={label} className={cn("flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2", state === "filled" ? "border-success-600/20 bg-success-100/40" : "border-warning-600/25 bg-warning-100/60")}>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">{label}</span>
              <span className="block text-[11px] text-ink-3">{note}</span>
            </span>
            {state === "filled" ? <CheckCircle2 className="size-4 shrink-0 text-success-600" aria-label="Filled" /> : <Hand className="size-4 shrink-0 text-warning-600" aria-label="Yours to answer" />}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[11px] text-ink-3">You review, then submit</span>
        <span className="rounded-full wj-gradient-bg px-4 py-1.5 text-[12px] font-semibold text-white">Submit</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ features */
/** `cta` overrides "See it in the demo" for features the demo can't show (it has no account to link). */
const FEATURES: { icon: typeof Search; t: string; s: string; href: string; cta?: string; id?: string; plan?: string }[] = [
  { icon: Search, t: "Jobs on the first screen", s: "Signed in, your jobs are already there — searched, ranked by fit, with each company's logo. Type or say anything else to search for it.", href: "/sign-up" },
  { icon: MousePointerClick, t: "Apply with Wonder", s: "Fills the employer's form with your details, résumé and saved answers, and leaves what's yours to answer. You submit — or turn on Submit for me.", href: "/sign-up", plan: "Pro" },
  { icon: Smartphone, t: "Apply from your phone", s: "No extension on a phone? The employer's page opens inside WonderJobs, Wonder fills it there, and you press submit.", href: "/sign-up", plan: "Pro" },
  { icon: Target, t: "Why it fits", s: "Every match explains itself: why it surfaced, what to weigh, what to do next.", href: "/sign-up" },
  { icon: Radar, t: "Scheduled searches", s: "Ready-made schedules — a weekday shortlist, a weekly roundup, remote only — that run while you're away and tell you only when it's worth it.", href: "/sign-up" },
  { icon: Bell, t: "Notifications with a next step", s: "A search finished, a draft is ready, a saved job closed — each notice says what happened and takes you straight to what to do.", href: "/sign-up" },
  { icon: MessageCircleQuestion, t: "Ask Wonder", s: "“What should I focus on today?” — answered from your own applications, matches and follow-ups.", href: "/sign-up" },
  { icon: FileText, t: "Application Pack", s: "Résumé, cover letter and answers in one place — each labelled AI draft or yours, and yours to download as Word.", href: "/sign-up" },
  { icon: LayoutTemplate, id: "templates", t: "Résumé templates", s: "ATS-friendly designs drawn from your own facts — two on Free, all eight on Pro. Preview, then download PDF or Word.", href: "/sign-up" },
  { icon: LayoutList, t: "Pipeline", s: "Preparing, applied, interview, outcome — the next step on every card, follow-ups and interviews first.", href: "/sign-up" },
  { icon: GitCompareArrows, t: "Compare opportunities", s: "Put two to four roles side by side. Real differences, no fake winner.", href: "/sign-up" },
  { icon: Dna, t: "Career Profile", s: "Read from your CV — role, places, skills, history, links. Conflicts are shown side by side, never silently overwritten.", href: "/sign-up" },
  { icon: Sparkles, t: "Your own AI in one paste", s: "Paste a ChatGPT, Claude or Gemini key — Wonder tells which it is, checks it works, and your drafts use it. Or use WonderJobs AI, included.", href: "/sign-up" },
  { icon: CalendarDays, t: "Your calendar and phone", s: "One tap subscribes Google, Outlook or Apple Calendar to your interviews and follow-ups; install WonderJobs like an app for nudges.", href: "/help#calendar", cta: "How it works" },
  { icon: KeyRound, t: "JobsLake API", s: "Search the same live job sources from your own code with an API key. A free monthly allowance, then pay as you go.", href: "/api-reference", cta: "API reference" },
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
        </ScrollReveal>
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <ScrollReveal as="li" key={f.t} delay={(i % 3) * 70}>
              <Link id={f.id} href={f.href} className="wj-elevate group relative flex h-full scroll-mt-24 flex-col overflow-hidden rounded-[22px] border border-line bg-surface-2 p-6">
                <span className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-brand-100/60 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" aria-hidden />
                <span className="relative flex size-11 items-center justify-center rounded-[13px] bg-brand-50 text-brand-600 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-105">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <span className="relative mt-4 flex flex-wrap items-center gap-2 text-[17px] font-semibold text-ink">
                  {f.t}
                  {f.plan && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">{f.plan}</span>}
                </span>
                <span className="relative mt-1.5 flex-1 text-[14px] leading-relaxed text-ink-3">{f.s}</span>
                <span className="relative mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-600">
                  {f.cta ?? "Get started free"} <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
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
  { key: "seekers", label: "Job Seekers", headline: "Stop doom-scrolling job boards.", points: ["One search across every connected job source", "Strong matches surfaced first, with the reasons why", "Applications tracked from saved to offer"] },
  { key: "switchers", label: "Career Switchers", headline: "See paths you never considered.", points: ["Matching on your skills as they appear in each posting, not just titles", "Stretch opportunities flagged honestly", "A Career Shift résumé template built for changing role, function or industry"] },
  { key: "senior", label: "Senior Professionals", headline: "Signal over noise, at your level.", points: ["Seniority-aware ranking and compensation alignment", "Hiring-confidence signals before you invest time", "Keep watch — you hear only when a strong match turns up"] },
  { key: "students", label: "Students", headline: "Your first move, minus the chaos.", points: ["Seniority-aware matching, so entry-level roles aren't buried", "Screening answers drafted for you to make your own", "Follow-ups and interviews on one timeline, and in your own calendar"] },
  { key: "global", label: "Global Talent", headline: "Find work across borders.", points: ["Remote roles checked for whether they're actually open to your region", "Salaries shown in the posting's own currency", "Résumé templates designed to read cleanly in applicant-tracking systems"] },
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
          <p className="mt-5 max-w-md text-[16px] text-white/75">Use WonderJobs AI, included in every plan, or paste a key from ChatGPT, Claude or Gemini — Wonder recognises it, checks it works, and your drafts use it from then on. Keys are encrypted, never shown again, and billed only by your provider.</p>
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
    { label: "First name", value: "Alex" },
    { label: "Last name", value: "Morgan" },
    { label: "Email", value: "alex.morgan@example.com" },
    { label: "Resume / CV", value: "Alex_Morgan_Resume.pdf", file: true },
  ];
  return (
    <section id="extension" className="bg-white py-20 md:py-28" aria-labelledby="extension-title">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <ScrollReveal>
          <p className="wj-eyebrow text-brand-600">Apply with Wonder</p>
          <h2 id="extension-title" className="mt-3 text-h2 font-semibold tracking-tight">
            Apply without
            <br />
            <span className="wj-gradient-text">retyping yourself.</span>
          </h2>
          <p className="mt-5 max-w-md text-[16px] text-ink-2">
            Wonder fills the employer&apos;s own form on Greenhouse, Lever, Ashby and Workday — and helps on SmartRecruiters and Workable — with your details, résumé and the answers you approved. Work authorization, sponsorship and demographic questions are left for you; sign-in, verification and payment pages pause it. You press submit — or turn on Submit for me, and the helper presses it once every required field holds your own answer.
          </p>
          <ul className="mt-5 space-y-2 text-[14px] text-ink-2">
            {["No portal passwords — you sign in on the employer's site", "Stop any time, from the page or from WonderJobs", "No helper? Guided mode puts every value one tap from your clipboard, and remembers your answers"].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden /> {t}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button href="/extension" size="lg" className="rounded-full" iconRight={<ArrowRight className="size-4" aria-hidden />}>
              Get the browser helper
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
              <ScrollReveal delay={460}>
                <div className="rounded-[12px] border border-dashed border-warning-600/50 bg-warning-100/40 px-3 py-2">
                  <p className="text-[11px] font-medium text-ink-3">Are you legally authorized to work in this country?</p>
                  <p className="mt-0.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-warning-600">
                    <Hand className="size-3.5" aria-hidden /> Left for you to answer
                  </p>
                </div>
              </ScrollReveal>
              <ScrollReveal delay={540}>
                <p className="inline-flex items-center gap-1.5 rounded-full bg-success-100 px-3 py-1.5 text-[12px] font-semibold text-success-600">
                  <Zap className="size-3.5" aria-hidden /> 4 fields filled · you review and submit
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
        <p className="mt-4 text-[17px] text-white/75">Upload your CV. Your jobs are a minute away.</p>
        <Button href="/sign-up" size="xl" className="mt-8 rounded-full" iconRight={<ArrowRight className="size-4" aria-hidden />}>
          Get Started Free
        </Button>
        <p className="mt-4 text-[12px] text-white/60">Free plan, no card · Pro and Max when you need more</p>
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
      { label: "Résumé templates", href: "/#templates" },
      { label: "Apply with Wonder", href: "/#extension" },
      { label: "Browser helper", href: "/extension" },
      { label: "Pricing", href: "/#pricing" },
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
      { label: "Ask Wonder guide", href: "/help#ask-wonder" },
      { label: "Calendar & notifications", href: "/help#calendar" },
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
      { label: "Trust & compliance", href: "/#trust" },
      { label: "Report a vulnerability", href: "/security#report" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign in", href: "/sign-in" },
      { label: "Create account", href: "/sign-up" },
      { label: "Forgot password", href: "/forgot-password" },
      { label: "AI settings", href: "/app/settings/ai" },
      { label: "Plan & billing", href: "/app/profile#plan" },
      { label: "Your data (export / delete)", href: "/app/profile#your-data" },
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
          <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-ink-3">Tell Wonder what you want. It searches real sources, explains every match, builds your résumé and fills the employer&apos;s form. You submit — or let it, only if you turn that on.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button href="/sign-up" size="sm" className="rounded-full">
              Get started free
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
