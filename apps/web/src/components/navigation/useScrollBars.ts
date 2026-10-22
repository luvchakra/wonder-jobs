"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useUIStore } from "@/store/ui";
import { offsets, settle, slide } from "@/lib/scrollBars";

const PHONE = "(max-width: 767px)";

/**
 * Phones only: slides the top bar, then the bottom bar, away as the page scrolls down and back as it
 * scrolls up (lib/scrollBars.ts), through two CSS variables the bars and everything sitting above the
 * bottom bar read (`--wj-top-hidden`, `--wj-bottom-hidden`; `--wj-mobile-nav-h` follows the bottom bar).
 * Both are shown again on a new page, while a menu or a screen's own bottom action bar is open, and on a wider screen.
 */
export function useScrollBars() {
  const pathname = usePathname();
  const hold = useUIStore((s) => s.menu !== null || s.bottomBars > 0);
  useEffect(() => {
    const root = document.documentElement;
    const write = (h: number, top: number, bottom: number) => {
      const o = offsets(h, top, bottom);
      root.style.setProperty("--wj-top-hidden", `${o.top}px`);
      root.style.setProperty("--wj-bottom-hidden", `${o.bottom}px`);
    };
    const reset = () => {
      root.style.removeProperty("--wj-top-hidden");
      root.style.removeProperty("--wj-bottom-hidden");
    };
    const phone = window.matchMedia(PHONE);
    if (hold || !phone.matches) {
      reset();
      return;
    }
    const size = () => ({ top: document.querySelector<HTMLElement>("[data-top-bar]")?.offsetHeight ?? 0, bottom: document.querySelector<HTMLElement>("[data-bottom-bar]")?.offsetHeight ?? 0 });
    let hidden = 0;
    let lastY = window.scrollY;
    let frame = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const { top, bottom } = size();
        const y = window.scrollY;
        hidden = slide(hidden, y - lastY, y, top, bottom);
        lastY = y;
        write(hidden, top, bottom);
        clearTimeout(idle);
        idle = setTimeout(() => {
          hidden = settle(hidden, top, bottom);
          write(hidden, top, bottom);
        }, 180);
      });
    };
    const onMedia = () => {
      if (!phone.matches) reset();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    phone.addEventListener("change", onMedia);
    return () => {
      window.removeEventListener("scroll", onScroll);
      phone.removeEventListener("change", onMedia);
      cancelAnimationFrame(frame);
      clearTimeout(idle);
      reset();
    };
  }, [pathname, hold]);
}
