"use client";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ArrowRight, Bot, Briefcase, Check, CheckCircle2, ExternalLink, FileText, Loader2, Mail, MonitorSmartphone, Radar, Search, Send, Sparkles, Target } from "lucide-react";
import { ScrollReveal } from "@/components/common/ScrollReveal";
import { Button } from "@/components/common/Button";
import { Input, Textarea, Field, Select } from "@/components/common/Input";
import { useLowPowerHint, useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------ showcase */
type Screen = { id: string; label: string; title: string; body: string; demo: string; desktop: React.ReactNode; phone: React.ReactNode };

/** Scroll-linked tilt/lift for the device frames (transforms only; off under reduced motion). */
function useDeviceMotion() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const lowPower = useLowPowerHint();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const scale = lowPower ? 0.3 : 1;
    const targets = [...el.querySelectorAll<HTMLElement>("[data-device]")];
    let raf = 0;
    const tick = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // 0 when the section enters from below, 1 when it has scrolled past the top.
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
      const centred = (p - 0.5) * 2; // -1..1
      for (const t of targets) {
        const k = Number(t.dataset.device) * scale;
        t.style.transform = `translate3d(0, ${Math.round(centred * -40 * k)}px, 0) rotateX(${(centred * -6 * k).toFixed(2)}deg) rotate(${(centred * 2 * k).toFixed(2)}deg)`;
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      for (const t of targets) t.style.transform = "";
    };
  }, [reduced, lowPower]);
  return ref;
}

const MATCHES = [
  { t: "Senior Product Designer", c: "Northwind Labs", fit: 94, tag: "Strong", loc: "Remote · India", why: "Strong overlap with your skills" },
  { t: "Staff Product Designer", c: "Halcyon", fit: 88, tag: "Strong", loc: "Bengaluru · Hybrid", why: "Seniority aligns · location works for you" },
  { t: "Design Lead, Growth", c: "Cobalt Pay", fit: 71, tag: "Worth considering", loc: "Remote · APAC", why: "A step up — a growth move" },
];

function DesktopHome() {
  return (
    <div className="grid grid-cols-[150px_1fr] text-[10px]">
      <aside className="border-r border-line bg-surface-2 p-3">
        <p className="text-[11px] font-semibold text-ink">WonderJobs</p>
        <ul className="mt-3 space-y-1.5 text-ink-3">
          {["Home", "Jobs", "Applications", "Career", "Wonder"].map((i, n) => (
            <li key={i} className={cn("rounded-[6px] px-2 py-1", n === 0 && "bg-brand-50 font-semibold text-brand-700")}>
              {i}
            </li>
          ))}
        </ul>
      </aside>
      <div className="p-4">
        <p className="text-ink-3">Good morning, Priya</p>
        <p className="mt-0.5 text-[15px] font-semibold text-ink">
          Wonder found <span className="wj-gradient-text">7 things</span> worth your attention.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            ["3", "strong matches"],
            ["2", "follow-ups due"],
            ["1", "interview tomorrow"],
          ].map(([n, l]) => (
            <div key={l} className="rounded-[10px] border border-line bg-white p-2">
              <p className="text-[16px] font-semibold text-ink">{n}</p>
              <p className="text-ink-3">{l}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-[10px] border border-line bg-white p-2.5">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-ink">Wonder is finding opportunities</p>
            <span className="rounded-full bg-success-100 px-1.5 py-0.5 text-[9px] font-semibold text-success-600">Live</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-soft">
            <div className="h-full w-[62%] rounded-full wj-gradient-bg" />
          </div>
          <p className="mt-1 text-ink-3">412 found so far · comparing with your career profile</p>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-ink-3">
          <Radar className="size-3 text-success-600" aria-hidden /> Wonder is working · Next search tomorrow at 8:00
        </p>
      </div>
    </div>
  );
}

function DesktopJobs() {
  return (
    <div className="p-4 text-[10px]">
      <div className="flex items-center gap-2">
        <div className="flex h-7 flex-1 items-center gap-1.5 rounded-[8px] border border-line bg-white px-2 text-ink-3">
          <Search className="size-3" aria-hidden /> Senior product designer, remote
        </div>
        {["Strong fit", "Fresh", "Remote"].map((f) => (
          <span key={f} className="rounded-full border border-line px-2 py-1 text-ink-2">
            {f}
          </span>
        ))}
      </div>
      <ul className="mt-3 space-y-2">
        {MATCHES.map((m) => (
          <li key={m.t} className="flex items-center gap-3 rounded-[10px] border border-line bg-white p-2.5">
            <span className="flex size-8 items-center justify-center rounded-[8px] bg-brand-50 text-brand-600">
              <Briefcase className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-ink">{m.t}</span>
              <span className="block text-ink-3">
                {m.c} · {m.loc}
              </span>
              <span className="mt-0.5 block text-[9.5px] text-success-600">✓ {m.why}</span>
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold", m.fit >= 82 ? "bg-success-100 text-success-600" : "bg-brand-50 text-brand-700")}>
              {m.fit}% · {m.tag}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DesktopFind() {
  const steps: [string, "done" | "active" | "todo", string?][] = [
    ["Understanding your career goals", "done"],
    ["Searching the market", "done", "412 found"],
    ["Removing duplicates", "done", "32 removed"],
    ["Comparing with your career profile", "active"],
    ["Prioritizing what deserves your attention", "todo"],
  ];
  return (
    <div className="p-4 text-[10px]">
      <p className="text-ink-3">Search · just now</p>
      <p className="text-[12px] font-semibold text-ink">“Senior product designer roles, remote or Bengaluru”</p>
      <div className="mt-3 grid grid-cols-[1fr_1fr] gap-3">
        <div className="rounded-[10px] border border-line bg-white p-2.5">
          <p className="text-[11px] font-semibold text-ink">Wonder is finding opportunities</p>
          <ol className="mt-2 space-y-1.5">
            {steps.map(([t, st, d]) => (
              <li key={t} className="flex items-center gap-1.5">
                <span className={cn("flex size-3.5 shrink-0 items-center justify-center rounded-full border-2", st === "done" ? "border-brand-500 bg-brand-500 text-white" : st === "active" ? "border-brand-500 text-brand-600" : "border-line-strong")}>{st === "done" ? <Check className="size-2" strokeWidth={4} /> : st === "active" ? <Loader2 className="size-2 wj-animate-spin" /> : null}</span>
                <span className={st === "todo" ? "text-ink-4" : "text-ink"}>{t}</span>
                {d && <span className="ml-auto text-ink-3">{d}</span>}
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-[10px] border border-brand-200 bg-brand-50/60 p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-brand-700">Your input</p>
          <p className="mt-0.5 text-[11px] font-semibold text-ink">Wonder needs your input</p>
          <p className="mt-0.5 text-ink-3">3 prepared applications are ready. Review them, edit anything you like, then continue.</p>
          <div className="mt-2 flex gap-1.5">
            <span className="rounded-[6px] wj-gradient-bg px-2 py-1 text-[9px] font-semibold text-white">Continue</span>
            <span className="rounded-[6px] border border-line bg-white px-2 py-1 text-[9px] font-semibold text-ink">Stop</span>
          </div>
        </div>
      </div>
      <p className="mt-3 text-ink-3">See how Wonder worked ▾ — sources, evidence and every step, one click away.</p>
    </div>
  );
}

function DesktopApplications() {
  const rows = [
    ["Northwind Labs", "Senior Product Designer", "Interview · Thu 10:00", "bg-blue-100 text-blue-600"],
    ["Halcyon", "Staff Product Designer", "Submitted · follow up in 3 days", "bg-brand-50 text-brand-700"],
    ["Cobalt Pay", "Design Lead, Growth", "Application ready · your review", "bg-warning-100 text-warning-600"],
  ];
  return (
    <div className="p-4 text-[10px]">
      <p className="text-[12px] font-semibold text-ink">Applications</p>
      <div className="mt-2 grid grid-cols-4 gap-2 text-center">
        {[
          ["6", "Drafted"],
          ["4", "Submitted"],
          ["2", "Interviews"],
          ["1", "Offer"],
        ].map(([n, l]) => (
          <div key={l} className="rounded-[10px] border border-line bg-white p-2">
            <p className="text-[14px] font-semibold text-ink">{n}</p>
            <p className="text-ink-3">{l}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {rows.map(([c, t, s, cls]) => (
          <li key={t} className="flex items-center gap-2 rounded-[10px] border border-line bg-white px-2.5 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-ink">{t}</span>
              <span className="block text-ink-3">{c}</span>
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold", cls)}>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PhoneShell({ children, title, tab = 0 }: { children: React.ReactNode; title: string; tab?: number }) {
  return (
    <div className="w-[230px] rounded-[34px] border-[6px] border-ink bg-ink p-1 shadow-xl" aria-label={`Preview of ${title} on mobile`}>
      <div className="relative h-[440px] overflow-hidden rounded-[26px] bg-surface-2">
        <div className="absolute left-1/2 top-2 h-4 w-16 -translate-x-1/2 rounded-full bg-ink" aria-hidden />
        <div className="px-3 pb-3 pt-8 text-[10px]">{children}</div>
        <div className="absolute inset-x-0 bottom-0 flex justify-around border-t border-line bg-white px-2 py-2 text-[8px] text-ink-3">
          {["Home", "Jobs", "Apps", "Career", "Wonder"].map((n, i) => (
            <span key={n} className={cn(i === tab && "font-semibold text-brand-600")}>
              {n}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PhoneHome() {
  return (
    <PhoneShell title="the dashboard">
      <p className="text-ink-3">Good morning, Priya</p>
      <p className="mt-0.5 text-[14px] font-semibold leading-tight text-ink">7 things worth your attention.</p>
      <div className="mt-3 rounded-[12px] wj-gradient-bg p-2.5 text-white">
        <p className="flex items-center gap-1 font-semibold">
          <Bot className="size-3" aria-hidden /> Find opportunities
        </p>
        <p className="mt-0.5 text-white/85">Work with me · keeps watch daily</p>
      </div>
      <ul className="mt-3 space-y-1.5">
        {["3 new strong matches", "2 follow-ups due", "1 interview tomorrow"].map((t) => (
          <li key={t} className="flex items-center gap-2 rounded-[10px] bg-white px-2.5 py-2 font-medium text-ink">
            <CheckCircle2 className="size-3 text-brand-500" aria-hidden /> {t}
          </li>
        ))}
      </ul>
    </PhoneShell>
  );
}

function PhoneJob() {
  return (
    <PhoneShell title="a job match" tab={1}>
      <span className="rounded-full bg-success-100 px-2 py-0.5 text-[9px] font-semibold text-success-600">94% · Strong Opportunity</span>
      <p className="mt-2 text-[13px] font-semibold leading-tight text-ink">Senior Product Designer</p>
      <p className="text-ink-3">Northwind Labs · Remote · India</p>
      <p className="mt-3 font-semibold text-ink">Why it fits</p>
      <ul className="mt-1 space-y-1">
        {[
          ["Skills", 96],
          ["Seniority", 92],
          ["Location", 100],
          ["Pay", 84],
        ].map(([l, v]) => (
          <li key={String(l)} className="flex items-center gap-2">
            <span className="w-12 text-ink-3">{l}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white">
              <span className="block h-full rounded-full wj-gradient-bg" style={{ width: `${v}%` }} />
            </span>
            <span className="w-6 text-right text-ink-2">{v}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 rounded-[10px] wj-gradient-bg px-2.5 py-1.5 text-center font-semibold text-white">Prepare application</div>
    </PhoneShell>
  );
}

function PhoneFind() {
  const steps = ["Searching the market", "Removing duplicates", "Checking relevant roles", "Comparing with your profile", "Prioritizing for you"];
  return (
    <PhoneShell title="a search in progress" tab={4}>
      <p className="text-[13px] font-semibold leading-tight text-ink">Wonder is finding opportunities</p>
      <p className="text-ink-3">412 found so far</p>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cn("flex size-4 items-center justify-center rounded-full border-2", i < 2 ? "border-brand-500 bg-brand-500 text-white" : i === 2 ? "border-brand-500 text-brand-600" : "border-line-strong")}>{i < 2 ? <Check className="size-2.5" strokeWidth={4} /> : i === 2 ? <Loader2 className="size-2.5 wj-animate-spin" /> : null}</span>
            <span className={cn(i <= 2 ? "text-ink" : "text-ink-4")}>{s}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex gap-1.5">
        <span className="flex-1 rounded-full bg-white px-2 py-1.5 text-center font-semibold text-ink">Pause</span>
        <span className="flex-1 rounded-full bg-white px-2 py-1.5 text-center font-semibold text-ink">Stop</span>
      </div>
    </PhoneShell>
  );
}

function PhoneApplication() {
  return (
    <PhoneShell title="an application" tab={2}>
      <p className="flex items-center gap-1 text-[13px] font-semibold text-ink">
        <CheckCircle2 className="size-3.5 text-success-600" aria-hidden /> Application ready
      </p>
      <p className="text-ink-3">Senior Product Designer · Northwind Labs</p>
      <ol className="mt-3 space-y-2">
        {[
          ["Tailored résumé", "Edited by you"],
          ["Cover letter", "AI-generated draft"],
          ["Reviewed by you", "Ready to hand off"],
          ["Interview", "Thu 10:00 · prep pack ready"],
        ].map(([t, s], i) => (
          <li key={t} className="flex gap-2">
            <span className={cn("mt-0.5 size-3 shrink-0 rounded-full", i < 3 ? "bg-brand-500" : "border-2 border-brand-500")} />
            <span>
              <span className="block font-semibold text-ink">{t}</span>
              <span className="block text-ink-3">{s}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex items-center gap-1.5 rounded-[10px] bg-white px-2.5 py-2 text-ink">
        <FileText className="size-3 text-brand-600" aria-hidden /> The final action is yours
      </div>
    </PhoneShell>
  );
}

const SCREENS: Screen[] = [
  { id: "home", label: "Home", title: "What deserves your attention today", body: "Strong matches, follow-ups and interviews, ranked by what needs you first — plus your progress, and when Wonder looks next.", demo: "/demo?next=/app", desktop: <DesktopHome />, phone: <PhoneHome /> },
  { id: "find", label: "Find", title: "Real progress, in plain words", body: "Wonder shows what it's doing and what it has found so far. Pause or stop any time — everything already found stays. When it needs you, it says why.", demo: "/demo?next=/app/runs/new", desktop: <DesktopFind />, phone: <PhoneFind /> },
  { id: "jobs", label: "Decide", title: "Every match explains itself", body: "Real postings, de-duplicated and compared with your Career Profile. Each card says why Wonder surfaced it and what to weigh.", demo: "/demo?next=/app/jobs", desktop: <DesktopJobs />, phone: <PhoneJob /> },
  { id: "applications", label: "Apply", title: "Your Application Pack, then your click", body: "Tailored materials, each labelled AI draft or your edit. Wonder opens the employer's page — submitting is always yours.", demo: "/demo?next=/app/applications", desktop: <DesktopApplications />, phone: <PhoneApplication /> },
];

/** Desktop + mobile frames, switchable by screen, with scroll-linked lift. Every screen deep-links into the demo. */
export function ShowcaseSection() {
  const [active, setActive] = useState(0);
  const ref = useDeviceMotion();
  const screen = SCREENS[active];
  return (
    <section id="screens" className="relative overflow-hidden bg-[#f6f7fd] py-20 md:py-28" aria-labelledby="screens-title">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-line to-transparent" aria-hidden />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <p className="wj-eyebrow text-brand-700">On your desk and in your pocket</p>
          <h2 id="screens-title" className="mt-3 text-h2 font-semibold text-ink">
            The same Wonder, <span className="wj-gradient-text">on every screen.</span>
          </h2>
          <p className="mt-4 text-[16px] text-ink-2">Start a search from your laptop, review your Application Pack on the train. Everything syncs to your account.</p>
        </ScrollReveal>

        <div className="mt-10 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Product screens">
          {SCREENS.map((s, i) => (
            <button key={s.id} type="button" role="tab" id={`screen-tab-${s.id}`} aria-selected={i === active} aria-controls="screen-panel" onClick={() => setActive(i)} className={cn("rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors", i === active ? "bg-ink text-white" : "bg-white text-ink-2 hover:text-ink border border-line")}>
              {s.label}
            </button>
          ))}
        </div>

        <div ref={ref} id="screen-panel" role="tabpanel" aria-labelledby={`screen-tab-${screen.id}`} className="mt-10 grid items-center gap-10 lg:grid-cols-[1fr_360px]" style={{ perspective: "1400px" } as CSSProperties}>
          <div className="relative">
            <div data-device="1" className="will-change-transform">
              <div className="overflow-hidden rounded-[18px] border border-line bg-white shadow-xl" aria-label={`Preview of ${screen.label} on desktop`}>
                <div className="flex items-center gap-1.5 border-b border-line bg-surface-2 px-3 py-2">
                  <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="size-2.5 rounded-full bg-[#febc2e]" />
                  <span className="size-2.5 rounded-full bg-[#28c840]" />
                  <span className="ml-3 flex-1 rounded-[6px] bg-white px-2 py-0.5 text-[10px] text-ink-4">wonderjobs.app{screen.demo.replace("/demo?next=", "")}</span>
                </div>
                <div className="min-h-[300px]">{screen.desktop}</div>
              </div>
            </div>
            <div data-device="1.6" className="absolute -bottom-8 right-2 hidden will-change-transform sm:block lg:hidden">
              <div className="scale-[0.8] origin-bottom-right">{screen.phone}</div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-6 lg:items-start">
            <div data-device="1.6" className="hidden will-change-transform lg:block">
              {screen.phone}
            </div>
            <div className="text-center lg:text-left">
              <h3 className="text-[20px] font-semibold text-ink">{screen.title}</h3>
              <p className="mt-2 text-[14.5px] text-ink-2">{screen.body}</p>
              <Button href={screen.demo} variant="dark" size="md" className="mt-4 rounded-full" iconRight={<ExternalLink className="size-4" aria-hidden />}>
                Open {screen.label} in the demo
              </Button>
            </div>
          </div>
        </div>
        <p className="mt-16 flex items-center justify-center gap-2 text-[13px] text-ink-3">
          <MonitorSmartphone className="size-4" aria-hidden /> Installable on iOS and Android as a web app. Desktop, tablet and phone layouts are all first-class.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- contact */
const TOPICS = [
  { value: "general", label: "General question" },
  { value: "support", label: "I need help with my account" },
  { value: "feedback", label: "Feedback or a feature request" },
  { value: "partnership", label: "Partnership or job source" },
  { value: "press", label: "Press" },
];

export function ContactSection() {
  const [form, setForm] = useState({ name: "", email: "", topic: "general", message: "", company: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { stored: boolean }>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, page: location.pathname }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; stored?: boolean };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setDone({ stored: data.stored !== false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="contact" className="bg-white py-20 md:py-28" aria-labelledby="contact-title">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <ScrollReveal>
          <p className="wj-eyebrow text-brand-700">Contact us</p>
          <h2 id="contact-title" className="mt-3 text-h2 font-semibold text-ink">
            Talk to a <span className="wj-gradient-text">human.</span>
          </h2>
          <p className="mt-4 text-[16px] text-ink-2">Questions, feedback, a job source we should add, or something that isn&apos;t working. Messages land with the team and we reply by email.</p>
          <ul className="mt-8 space-y-4 text-[14.5px] text-ink-2">
            {[
              { icon: Sparkles, t: "Quick answers first", s: "The help center answers most questions instantly.", href: "/help", cta: "Open the help center" },
              { icon: Target, t: "Try before you ask", s: "The demo runs on sample data. No account needed.", href: "/demo", cta: "Open the demo" },
              { icon: Mail, t: "Typical reply time", s: "Within two working days.", href: null, cta: null },
            ].map((r) => (
              <li key={r.t} className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-brand-50 text-brand-600">
                  <r.icon className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold text-ink">{r.t}</span>
                  <span className="block text-ink-3">{r.s}</span>
                  {r.href && (
                    <a href={r.href} className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-600 hover:underline">
                      {r.cta} <ArrowRight className="size-3.5" aria-hidden />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </ScrollReveal>
        <ScrollReveal delay={100}>
          {done ? (
            <div role="status" className="rounded-[24px] border border-line bg-surface-2 p-8">
              <p className="flex items-center gap-2 text-[18px] font-semibold text-ink">
                <CheckCircle2 className="size-5 text-success-600" aria-hidden /> {done.stored ? "Message received" : "Message noted"}
              </p>
              <p className="mt-2 text-[14.5px] text-ink-2">
                {done.stored ? `Thanks, ${form.name.trim()}. We'll reply to ${form.email.trim()} within two working days.` : "This deployment has no database connected, so the message was logged on the server instead of stored. The operator can see it in the server logs."}
              </p>
              <button type="button" onClick={() => setDone(null)} className="mt-4 text-[13px] font-semibold text-brand-600 hover:underline">
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="rounded-[24px] border border-line bg-surface-2 p-6 md:p-8" noValidate aria-label="Contact form">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your name" htmlFor="contact-name" required>
                  <Input id="contact-name" name="name" autoComplete="name" value={form.name} onChange={set("name")} required maxLength={120} placeholder="Priya Sharma" />
                </Field>
                <Field label="Email" htmlFor="contact-email" required>
                  <Input id="contact-email" name="email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set("email")} required maxLength={200} placeholder="you@example.com" />
                </Field>
              </div>
              <Field label="Topic" htmlFor="contact-topic" className="mt-4">
                <Select id="contact-topic" name="topic" value={form.topic} onChange={set("topic")}>
                  {TOPICS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Message" htmlFor="contact-message" className="mt-4" required hint="At least 10 characters.">
                <Textarea id="contact-message" name="message" value={form.message} onChange={set("message")} required minLength={10} maxLength={4000} rows={5} placeholder="Tell us what's on your mind…" />
              </Field>
              {/* Honeypot: hidden from people, tempting for bots. */}
              <div className="wj-sr-only" aria-hidden>
                <label htmlFor="contact-company">Company</label>
                <input id="contact-company" name="company" tabIndex={-1} autoComplete="off" value={form.company} onChange={set("company")} />
              </div>
              {error && (
                <p role="alert" className="mt-4 rounded-[12px] bg-danger-100/60 px-3 py-2 text-[13px] text-danger-600">
                  {error}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[12px] text-ink-4">
                  By sending, you agree to our{" "}
                  <a href="/privacy" className="underline hover:text-ink">
                    privacy policy
                  </a>
                  .
                </p>
                <Button type="submit" size="lg" loading={busy} disabled={busy || form.name.trim().length < 2 || !form.email.includes("@") || form.message.trim().length < 10} className="rounded-full" iconRight={<Send className="size-4" aria-hidden />}>
                  Send message
                </Button>
              </div>
            </form>
          )}
        </ScrollReveal>
      </div>
    </section>
  );
}
