"use client";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarClock, CheckCircle2, Hand, MessageCircleQuestion, Radar, Search, ShieldCheck, Sparkles } from "lucide-react";
import { AUTOMATION_LEVEL_META, defaultPolicy, resolveCapability, type AutomationLevel, type Capability } from "@/domain/automation/policy";
import { LOOK_FREQUENCY_META, type LookFrequency } from "@/domain/workflow/simpleSchedule";
import { ScrollReveal } from "@/components/common/ScrollReveal";
import { Button } from "@/components/common/Button";
import { useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { useSectionParallax } from "./useSectionParallax";

/* ------------------------------------------------------------ typing */

/**
 * Types `text` out character by character once `active` turns true, then reports completion. Under
 * reduced motion the full text appears at once — the content is identical, only the motion goes.
 */
export function useTyped(text: string, active: boolean, speed = 34) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reduced) {
      const t = setTimeout(() => setN(text.length), 0);
      return () => clearTimeout(t);
    }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => {
      clearInterval(id);
      setN(0);
    };
  }, [text, active, speed, reduced]);
  return { shown: text.slice(0, n), done: n >= text.length };
}

/* --------------------------------------------------------- Ask Wonder */

/**
 * Real Ask Wonder intents (`domain/wonder/intent.ts`) with answers shaped exactly like the ones the
 * resolver returns. Illustrative numbers: in the product, every count is resolved from the
 * candidate's own jobs and applications before it's shown.
 */
const ASKS: { q: string; label: string; hint: string; to: string }[] = [
  { q: "What should I focus on today?", label: "Today: 2 applications need you · 3 new strong matches this week", hint: "Follow-up due soon · Interview coming up", to: "Home" },
  { q: "Find me IAM jobs in Mumbai", label: "Find opportunities: “IAM jobs in Mumbai”", hint: "You'll see exactly what Wonder will search for before it starts.", to: "Find" },
  { q: "Why didn't you show the Razorpay role?", label: "Hidden because it's outside your preferred locations", hint: "Open it to show it anyway, or change the preference.", to: "The job" },
  { q: "Prepare the strongest two", label: "Prepare packs for your 2 strongest matches", hint: "Wonder prepares; nothing is sent to an employer.", to: "Strong matches" },
  { q: "Show my application progress", label: "3 applications active · 1 interview this week · 1 follow-up due", hint: "Everything in one timeline.", to: "Applications" },
];

export function AskWonderSection() {
  const ref = useSectionParallax<HTMLElement>();
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [inView, setInView] = useState(false);
  const ask = ASKS[i];
  const { shown, done } = useTyped(ask.q, inView);

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  // Once an answer is on screen, move to the next question after a beat — only while visible, and
  // never on its own under reduced motion (the chips below still switch it).
  useEffect(() => {
    if (!done || !inView || reduced) return;
    const t = setTimeout(() => setI((x) => (x + 1) % ASKS.length), 3400);
    return () => clearTimeout(t);
  }, [done, inView, reduced]);

  return (
    <section ref={ref} id="ask-wonder" className="relative overflow-hidden bg-white py-20 md:py-28" aria-labelledby="ask-title">
      {/* Soft depth: three blurred orbs drifting at different rates. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div data-depth="1.4" className="absolute -left-24 top-10 size-[340px] rounded-full bg-brand-200/40 blur-3xl will-change-transform" />
        <div data-depth="-0.8" className="absolute right-[-80px] top-1/3 size-[280px] rounded-full bg-[#bcd3ff]/50 blur-3xl will-change-transform" />
        <div data-depth="0.6" className="absolute bottom-[-120px] left-1/3 size-[320px] rounded-full bg-[#fbe8ff]/70 blur-3xl will-change-transform" />
      </div>

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <ScrollReveal>
          <p className="wj-eyebrow text-brand-700">Ask Wonder</p>
          <h2 id="ask-title" className="mt-3 text-h2 font-semibold text-ink">
            Just ask. <span className="wj-gradient-text">Wonder takes you there.</span>
          </h2>
          <p className="mt-4 max-w-md text-[16px] text-ink-2">Type what you want in plain words. Wonder turns it into the right action, answered from your own jobs and applications — not a chat reply to read and act on yourself.</p>
          <ul className="mt-7 space-y-3 text-[14.5px] text-ink-2">
            {[
              "Every answer comes from your real data, never a guess",
              "It opens the right place — it never acts behind your back",
              "Works from anywhere: press ⌘K or tap the search bar",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden /> {t}
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-wrap gap-2" role="group" aria-label="Try an example question">
            {ASKS.map((a, n) => (
              <button key={a.q} type="button" onClick={() => setI(n)} aria-pressed={n === i} className={cn("rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors", n === i ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-white text-ink-2 hover:border-line-strong")}>
                {a.q}
              </button>
            ))}
          </div>
        </ScrollReveal>

        <ScrollReveal delay={120}>
          <div data-depth="0.35" className="will-change-transform">
            <div className="wj-card overflow-hidden p-0 shadow-xl">
              <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-3">
                <MessageCircleQuestion className="size-4 text-brand-600" aria-hidden />
                <span className="text-[13px] font-semibold text-ink">Ask Wonder</span>
                <kbd className="ml-auto rounded-[6px] border border-line bg-white px-1.5 py-0.5 text-[10px] text-ink-3">⌘K</kbd>
              </div>
              <div className="p-5">
                <div className="flex h-12 items-center gap-2 rounded-[14px] border-2 border-brand-300 bg-white px-3.5 text-[15px] text-ink shadow-[0_0_0_4px_rgba(109,76,245,0.08)]">
                  <Search className="size-4 shrink-0 text-ink-3" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {shown}
                    <span className={cn("ml-px inline-block h-[1.1em] w-[2px] translate-y-[3px] bg-brand-500", !done && "wj-animate-pulse-dot")} aria-hidden />
                  </span>
                </div>
                {/* The whole exchange is announced once, when the answer lands — not letter by letter. */}
                <div className="wj-sr-only" aria-live="polite">
                  {done ? `${ask.q}: ${ask.label}. ${ask.hint}` : ""}
                </div>
                <div className={cn("mt-4 transition-all duration-500", done ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")} aria-hidden>
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-4">Actions</p>
                  <div className="mt-1.5 flex items-center gap-3 rounded-[14px] bg-brand-50 px-3.5 py-3 text-brand-700">
                    <Sparkles className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-ink">{ask.label}</span>
                      <span className="block text-[12.5px] text-ink-3">{ask.hint}</span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-1 text-[12px] font-semibold sm:inline-flex">
                      {ask.to} <ArrowRight className="size-3.5" />
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-ink-3">
                    <Search className="size-4 shrink-0" />
                    <span className="text-[13px]">Search jobs for “{ask.q}”</span>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-[12px] text-ink-4">Example answers. In your account, every number comes from your own jobs and applications.</p>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- control */

const LEVELS: AutomationLevel[] = ["assist", "guided", "autonomous", "continuous"];

/**
 * What each level means in practice, computed by the app's own gate (`resolveCapability`) against the
 * default policy — so this table can't claim something the product doesn't do.
 */
const GATE_ROWS: { label: string; capability: Capability }[] = [
  { label: "Search and compare jobs", capability: "search_jobs" },
  { label: "Draft a tailored résumé", capability: "generate_resume" },
  { label: "Fill the employer's application form", capability: "fill_application" },
  { label: "Open the employer's application page", capability: "submit_application" },
];
const GATE_TEXT = { run: "On its own", ask: "Asks you first", skip: "Off" } as const;
const DEFAULT_POLICY = defaultPolicy();
const FREQUENCIES: LookFrequency[] = ["daily", "weekly", "keep_watch", "manual"];

export function ControlSection() {
  const ref = useSectionParallax<HTMLElement>();
  const [level, setLevel] = useState<AutomationLevel>("guided");
  const [often, setOften] = useState<LookFrequency>("keep_watch");
  const levelIndex = LEVELS.indexOf(level);
  return (
    <section ref={ref} id="control" className="relative overflow-hidden bg-[#0e1030] py-20 text-white md:py-28" aria-labelledby="control-title">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div data-depth="1.2" className="absolute -right-32 -top-24 size-[420px] rounded-full bg-[radial-gradient(circle,#6d4cf5_0%,transparent_65%)] opacity-50 will-change-transform" />
        <div data-depth="-0.9" className="absolute -bottom-40 -left-24 size-[460px] rounded-full bg-[radial-gradient(circle,#3b7bff_0%,transparent_65%)] opacity-40 will-change-transform" />
        <svg data-depth="0.5" className="absolute inset-x-0 top-[14%] h-40 w-full opacity-20 will-change-transform" viewBox="0 0 1200 160" preserveAspectRatio="none">
          <path d="M0 110 C 260 30, 520 150, 760 70 S 1100 40, 1200 90" fill="none" stroke="url(#ctl-line)" strokeWidth="2" />
          <defs>
            <linearGradient id="ctl-line" x1="0" x2="1">
              <stop offset="0" stopColor="#a996ff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#a996ff" />
              <stop offset="1" stopColor="#6fa0ff" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <p className="wj-eyebrow text-brand-200">You stay in control</p>
          <h2 id="control-title" className="mt-3 text-h2 font-semibold">
            Wonder does the work. <span className="wj-gradient-text">The final action is yours.</span>
          </h2>
          <p className="mt-4 text-[16px] text-white/75">Choose how much Wonder handles. Whatever you pick, it never submits an application, messages a recruiter or sends an email for you.</p>
        </ScrollReveal>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <ScrollReveal>
            <div className="h-full rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur md:p-7">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-white/80">
                <Hand className="size-4" aria-hidden /> How much should Wonder handle?
              </div>
              <div className="relative mt-5">
                {/* The track: the fill grows with the chosen level, so "more handling" reads left to right. */}
                <div className="absolute inset-x-[12.5%] top-[18px] h-1 rounded-full bg-white/10" aria-hidden>
                  <div className="h-full rounded-full wj-gradient-bg transition-[width] duration-500" style={{ width: `${(levelIndex / (LEVELS.length - 1)) * 100}%` }} />
                </div>
                <div role="radiogroup" aria-label="How much should Wonder handle?" className="relative grid grid-cols-4 gap-2">
                  {LEVELS.map((l, n) => (
                    <button key={l} type="button" role="radio" aria-checked={level === l} onClick={() => setLevel(l)} className="group flex flex-col items-center gap-2 text-center">
                      <span className={cn("flex size-10 items-center justify-center rounded-full border-2 text-[13px] font-bold transition-all duration-300", n <= levelIndex ? "border-brand-300 bg-brand-500 text-white" : "border-white/25 bg-[#161a45] text-white/60", level === l && "scale-110 shadow-[0_0_0_6px_rgba(109,76,245,0.25)]")}>{n + 1}</span>
                      <span className={cn("text-[12.5px] font-semibold leading-tight transition-colors sm:text-[13.5px]", level === l ? "text-white" : "text-white/60 group-hover:text-white/80")}>{AUTOMATION_LEVEL_META[l].label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-6 min-h-[96px] rounded-[18px] bg-white/[0.07] p-4" aria-live="polite">
                <p className="flex items-center gap-2 text-[15px] font-semibold">
                  {AUTOMATION_LEVEL_META[level].label}
                  {AUTOMATION_LEVEL_META[level].recommended && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10.5px] font-semibold">Recommended</span>}
                </p>
                <p className="mt-1 text-[14px] text-white/75">{AUTOMATION_LEVEL_META[level].description}</p>
              </div>
              <table className="mt-5 w-full text-left text-[13.5px]">
                <caption className="wj-sr-only">What Wonder does at the {AUTOMATION_LEVEL_META[level].label} level</caption>
                <tbody>
                  {GATE_ROWS.map((r) => {
                    const d = resolveCapability(r.capability, DEFAULT_POLICY, level);
                    return (
                      <tr key={r.capability} className="border-t border-white/10">
                        <th scope="row" className="py-2.5 pr-3 font-medium text-white/80">
                          {r.label}
                        </th>
                        <td className="py-2.5 text-right">
                          <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold transition-colors duration-300", d === "run" ? "bg-success-600/25 text-[#8ff0b8]" : "bg-white/10 text-white/80")}>{GATE_TEXT[d]}</span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-white/10">
                    <th scope="row" className="py-2.5 pr-3 font-medium text-white/80">
                      Search on a schedule
                    </th>
                    <td className="py-2.5 text-right">
                      <span className={cn("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold transition-colors duration-300", level === "continuous" ? "bg-success-600/25 text-[#8ff0b8]" : "bg-white/10 text-white/80")}>{level === "continuous" ? "On its own" : "When you ask"}</span>
                    </td>
                  </tr>
                  <tr className="border-t border-white/10">
                    <th scope="row" className="py-2.5 pr-3 font-medium text-white/80">
                      Submit your application
                    </th>
                    <td className="py-2.5 text-right">
                      <span className="inline-block whitespace-nowrap rounded-full bg-brand-500/30 px-2.5 py-0.5 text-[12px] font-semibold text-brand-100">Never — your click</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-3 text-[12px] text-white/50">With the default rules. Each action can be set to Automatic, Ask me or Off in What Wonder can do.</p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 gap-6">
            <ScrollReveal delay={90}>
              <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-white/80">
                  <CalendarClock className="size-4" aria-hidden /> How often should Wonder look?
                </div>
                <div role="radiogroup" aria-label="How often should Wonder look?" className="mt-4 grid grid-cols-2 gap-2">
                  {FREQUENCIES.map((f) => (
                    <button key={f} type="button" role="radio" aria-checked={often === f} onClick={() => setOften(f)} className={cn("rounded-[14px] border px-3 py-2.5 text-left text-[13px] font-medium transition-colors", often === f ? "border-brand-300 bg-brand-500/25 text-white" : "border-white/10 text-white/70 hover:border-white/25")}>
                      {LOOK_FREQUENCY_META[f].label}
                    </button>
                  ))}
                </div>
                <p className="mt-3 min-h-[40px] text-[13px] text-white/70" aria-live="polite">
                  {LOOK_FREQUENCY_META[often].description}
                </p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={160}>
              <ul className="space-y-3 rounded-[28px] border border-white/10 bg-white/[0.06] p-6 text-[14px] text-white/80 backdrop-blur">
                {[
                  { icon: Radar, t: "Quiet by default", s: "Keep watch only speaks up when something is worth your attention." },
                  { icon: ShieldCheck, t: "Nothing without you", s: "Wonder can fill a form; submitting it is always your click, on the employer's site." },
                  { icon: Sparkles, t: "See how Wonder worked", s: "Sources, evidence and every step — one click away when you want it." },
                ].map((r) => (
                  <li key={r.t} className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-white/10 text-brand-200">
                      <r.icon className="size-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-semibold text-white">{r.t}</span>
                      <span className="block text-[13px] text-white/65">{r.s}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </ScrollReveal>
          </div>
        </div>

        <ScrollReveal className="mt-10 text-center">
          <Button href="/demo?next=/app/automation/settings" variant="glass" size="lg" className="rounded-full text-ink" iconRight={<ArrowRight className="size-4" aria-hidden />}>
            See what Wonder can do
          </Button>
        </ScrollReveal>
      </div>
    </section>
  );
}
