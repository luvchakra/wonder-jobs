"use client";
import { useEffect, useRef } from "react";
import { useLowPowerHint, useReducedMotion } from "@/lib/motion";

/**
 * Scroll-linked depth for any landing section: every descendant with `data-depth="<n>"` drifts by
 * `n × 60px` across the section's pass through the viewport (negative = against the scroll). Transforms
 * only, one rAF per scroll, off under reduced motion and a quarter strength on low-power devices — the
 * same contract as the hero's parallax.
 */
export function useSectionParallax<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();
  const lowPower = useLowPowerHint();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const scale = lowPower ? 0.25 : 1;
    const targets = [...el.querySelectorAll<HTMLElement>("[data-depth]")];
    let raf = 0;
    const tick = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      if (r.bottom < -200 || r.top > vh + 200) return;
      // -1 as the section enters from below, 0 centred, 1 as it leaves at the top.
      const p = Math.max(-1, Math.min(1, ((vh - r.top) / (vh + r.height)) * 2 - 1));
      for (const t of targets) t.style.transform = `translate3d(0, ${(p * -60 * Number(t.dataset.depth) * scale).toFixed(1)}px, 0)`;
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
