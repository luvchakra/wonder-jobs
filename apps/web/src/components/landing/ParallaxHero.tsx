"use client";
import { useEffect, useRef, type CSSProperties } from "react";
import { ArrowRight, Play, CheckCircle2, Bookmark, CalendarDays, Mail, Briefcase } from "lucide-react";
import { HeroScene } from "./HeroScene";
import { Button } from "@/components/common/Button";
import { useLowPowerHint, useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/cn";

type Layer = "sky" | "clouds" | "far" | "mid" | "near" | "ground" | "figure";
/** Scroll factor per layer: 0 = fixed to page, 1 = moves with the page. Depth increases toward the viewer. */
const FACTORS: Record<Layer | "ui" | "copy", number> = { sky: 0.05, clouds: 0.12, far: 0.18, mid: 0.28, near: 0.4, ground: 0.5, figure: 0.46, ui: -0.12, copy: 0.15 };

/**
 * Real scroll-linked parallax (spec §28): each SVG layer is translated on a
 * requestAnimationFrame tick using transforms only (no layout work). Reduced
 * motion disables movement; low-power devices get a quarter of it.
 */
export function ParallaxHero() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const lowPower = useLowPowerHint();

  useEffect(() => {
    const el = root.current;
    if (!el || reduced) return;
    const scale = lowPower ? 0.25 : 1;
    const layers = [...el.querySelectorAll<HTMLElement>("[data-parallax]")];
    let raf = 0;
    let last = -1;
    const tick = () => {
      raf = 0;
      const y = window.scrollY;
      if (y === last) return;
      last = y;
      const h = el.offsetHeight || 1;
      const p = Math.min(1, y / h);
      for (const l of layers) {
        const f = Number(l.dataset.parallax) * scale;
        l.style.transform = `translate3d(0, ${Math.round(y * f)}px, 0)`;
        if (l.dataset.fade) l.style.opacity = String(Math.max(0, 1 - p * 1.4));
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      for (const l of layers) {
        l.style.transform = "";
        l.style.opacity = "";
      }
    };
  }, [reduced, lowPower]);

  const layerClass = () => cn("will-change-transform");
  return (
    <section ref={root} className="relative min-h-[100svh] overflow-hidden bg-[#eef0fb]" aria-labelledby="hero-title">
      {/* Layered scene: each SVG layer carries its own parallax factor */}
      <div className="absolute inset-0" aria-hidden>
        <HeroScene variant="dawn" className="absolute inset-0 h-full w-full" id="hero" layerClass={layerClass} withFigure={false} />
      </div>
      {/* Give each scene layer its factor without changing HeroScene's markup */}
      <ParallaxBinder />
      <div className="absolute inset-0 bg-gradient-to-r from-[#eef0fb] via-[#eef0fb]/70 to-transparent md:via-[#eef0fb]/30" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white to-transparent" aria-hidden />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 pb-24 pt-32 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:pt-40">
        <div data-parallax={FACTORS.copy} data-fade="1" className="will-change-transform">
          <p className="wj-eyebrow wj-hero-in text-brand-700" style={{ "--wj-i": 0 } as CSSProperties}>
            A brighter tomorrow, faster
          </p>
          <h1 id="hero-title" className="wj-hero-in mt-4 text-display font-semibold text-ink" style={{ "--wj-i": 1 } as CSSProperties}>
            Your next opportunity is out there.
            <br />
            <span className="wj-gradient-text">Wonder finds it.</span>
          </h1>
          <p className="wj-hero-in mt-6 max-w-lg text-[17px] leading-relaxed text-ink-2" style={{ "--wj-i": 2 } as CSSProperties}>
            WonderJobs is your AI job-search agent. It scans the market, finds opportunities that actually fit you, and helps you take the next step — with less effort and more clarity.
          </p>
          <div className="wj-hero-in mt-8 flex flex-wrap items-center gap-3" style={{ "--wj-i": 3 } as CSSProperties}>
            <Button href="/sign-up" size="xl" className="rounded-full" iconRight={<ArrowRight className="size-4" aria-hidden />}>
              Get Started Free
            </Button>
            <Button href="/demo" size="xl" variant="glass" className="rounded-full" icon={<Play className="size-4" aria-hidden />}>
              See the live demo
            </Button>
          </div>
          <ul className="wj-hero-in mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-ink-3" aria-label="Good to know" style={{ "--wj-i": 4 } as CSSProperties}>
            {["No credit card required", "Free plan available", "Built for people who want better opportunities"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-brand-500" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="wj-hero-in relative hidden min-h-[420px] md:block" style={{ "--wj-i": 3 } as CSSProperties}>
          <p className="wj-handwritten absolute left-0 top-0 rotate-[-8deg] text-[22px] text-ink" data-parallax={FACTORS.copy}>
            A better you is a few steps away.
          </p>
          <ul className="absolute right-0 top-2 space-y-1 text-right text-[12px] text-ink-3" data-parallax={FACTORS.copy}>
            <li>More opportunities</li>
            <li>More clarity</li>
            <li>More control</li>
            <li className="font-semibold text-ink">A brighter you</li>
          </ul>
          {/* Floating product UI */}
          <div data-parallax={FACTORS.ui} className="absolute bottom-0 left-6 w-[360px] will-change-transform">
            <div className="wj-float">
              <FloatingDashboardCard />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Assigns parallax factors to HeroScene's layer SVGs (they render in a known order). */
function ParallaxBinder() {
  useEffect(() => {
    const svgs = document.querySelectorAll<SVGElement>('section[aria-labelledby="hero-title"] > div > div > svg');
    const order: (Layer | undefined)[] = ["sky", "clouds", "far", "mid", "near", "ground", "figure"];
    svgs.forEach((svg, i) => {
      const key = order[i];
      if (key) svg.dataset.parallax = String(FACTORS[key]);
    });
  }, []);
  return null;
}

export function FloatingDashboardCard({ className }: { className?: string }) {
  return (
    <div className={cn("wj-glass rounded-[22px] p-5 shadow-lg", className)} aria-label="Preview of the WonderJobs dashboard">
      <p className="text-[12px] text-ink-2">Good morning, Alex 👋</p>
      <p className="mt-1 text-[22px] font-semibold leading-tight tracking-tight text-ink">
        Wonder found <span className="wj-gradient-text">7 things</span> worth your attention.
      </p>
      <ul className="mt-4 space-y-2">
        {[
          { icon: Briefcase, t: "3 new strong matches", s: "View opportunities", c: "bg-brand-50 text-brand-600" },
          { icon: Mail, t: "2 follow-ups due", s: "Take action", c: "bg-blue-100 text-blue-600" },
          { icon: CalendarDays, t: "1 interview tomorrow", s: "Be prepared", c: "bg-[#fbe8ff] text-pink-500" },
          { icon: Bookmark, t: "1 saved job has changed", s: "See what's new", c: "bg-success-100 text-success-600" },
        ].map((r) => (
          <li key={r.t} className="flex items-center gap-3 rounded-[14px] bg-white px-3 py-2">
            <span className={cn("flex size-8 items-center justify-center rounded-[10px]", r.c)}>
              <r.icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink">{r.t}</span>
              <span className="block text-[11px] text-ink-3">{r.s}</span>
            </span>
          </li>
        ))}
      </ul>
      <a href="/demo" className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600">
        Open the demo <ArrowRight className="size-3.5" aria-hidden />
      </a>
    </div>
  );
}
