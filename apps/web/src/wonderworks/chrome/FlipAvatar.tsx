"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/common/Avatar";
import { WonderStarMark } from "@/wonderworks/brand/Logo";

/** How often the avatar turns over to the mark, and how long the mark stays (owner, 2026-10-29). */
export const FLIP_EVERY_MS = 10_000;
export const LOGO_FOR_MS = 2_000;

/**
 * The top bar's avatar, which every 10 seconds turns over (a smooth 3D flip) to show the WonderWorks mark for 2 seconds,
 * then turns back. The bar has no separate logo. The timer stops while the page is hidden, and with reduced motion
 * the avatar stays put.
 */
export function FlipAvatar({ name, size = 34 }: { name: string; size?: number }) {
  const [logo, setLogo] = useState(false);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let every: ReturnType<typeof setInterval> | undefined;
    let back: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      clearInterval(every);
      clearTimeout(back);
      setLogo(false);
    };
    const start = () => {
      stop();
      every = setInterval(() => {
        setLogo(true);
        back = setTimeout(() => setLogo(false), LOGO_FOR_MS);
      }, FLIP_EVERY_MS);
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <span className="relative block perspective-[600px]" style={{ width: size, height: size }} data-face={logo ? "logo" : "avatar"}>
      <span className={cn("relative block size-full transition-transform duration-700 ease-in-out transform-3d motion-reduce:transition-none", logo && "rotate-y-180")}>
        <span className="absolute inset-0 backface-hidden">
          <Avatar name={name} size={size} self />
        </span>
        <span className="absolute inset-0 grid rotate-y-180 place-items-center rounded-full bg-soft-lavender backface-hidden" aria-hidden>
          <WonderStarMark className="h-1/2 w-auto" />
        </span>
      </span>
    </span>
  );
}
