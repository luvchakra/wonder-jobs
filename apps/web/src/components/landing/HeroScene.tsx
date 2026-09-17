import { cn } from "@/lib/cn";

/**
 * Layered mountain/career scene drawn in SVG so every layer is real DOM that
 * parallax can move independently (sky, clouds, far/near mountains, terrain,
 * silhouette). Purely decorative; no external imagery.
 */
export type SceneVariant = "dawn" | "dusk" | "night";

const PALETTES: Record<SceneVariant, { sky: [string, string, string]; far: string; mid: string; near: string; ground: string; sun: string; haze: string }> = {
  dawn: { sky: ["#e9ecfb", "#cfd8ff", "#f7e6ff"], far: "#b9c2f2", mid: "#8b93d8", near: "#5b62b3", ground: "#2f3474", sun: "#fff4d6", haze: "rgba(255,255,255,0.55)" },
  dusk: { sky: ["#1b1f4a", "#5b4bb8", "#f2a97d"], far: "#5a4f9e", mid: "#3d3577", near: "#26214f", ground: "#141233", sun: "#ffd7a3", haze: "rgba(255,200,150,0.25)" },
  night: { sky: ["#070a1f", "#131a4a", "#2c2a6e"], far: "#2a2f66", mid: "#1c204d", near: "#12153a", ground: "#0a0c24", sun: "#f5f3ff", haze: "rgba(120,110,255,0.18)" },
};

export function HeroScene({ variant = "dawn", className, layerClass, withFigure = true, id = "hs" }: { variant?: SceneVariant; className?: string; layerClass?: (layer: "sky" | "clouds" | "far" | "mid" | "near" | "ground" | "figure") => string | undefined; withFigure?: boolean; id?: string }) {
  const p = PALETTES[variant];
  const lc = (l: Parameters<NonNullable<typeof layerClass>>[0]) => cn("absolute inset-0 h-full w-full", layerClass?.(l));
  return (
    <div className={cn("relative overflow-hidden", className)} aria-hidden="true">
      <svg className={lc("sky")} viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={p.sky[0]} />
            <stop offset="0.6" stopColor={p.sky[1]} />
            <stop offset="1" stopColor={p.sky[2]} />
          </linearGradient>
          <radialGradient id={`${id}-sun`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={p.sun} stopOpacity="0.95" />
            <stop offset="1" stopColor={p.sun} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1200" height="700" fill={`url(#${id}-sky)`} />
        <circle cx="880" cy="250" r="220" fill={`url(#${id}-sun)`} />
        {variant === "night" && (
          <g fill="#fff" opacity="0.8">
            {Array.from({ length: 40 }).map((_, i) => (
              <circle key={i} cx={(i * 197) % 1200} cy={(i * 89) % 320} r={(i % 3) * 0.5 + 0.6} />
            ))}
          </g>
        )}
      </svg>
      <svg className={lc("clouds")} viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
        <g fill={p.haze}>
          <ellipse cx="220" cy="300" rx="260" ry="46" />
          <ellipse cx="640" cy="360" rx="330" ry="52" />
          <ellipse cx="1010" cy="320" rx="240" ry="40" />
          <ellipse cx="420" cy="410" rx="380" ry="44" />
        </g>
      </svg>
      <svg className={lc("far")} viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
        <path fill={p.far} d="M0 460 L120 380 L210 420 L330 300 L420 370 L520 290 L640 380 L760 310 L860 360 L960 280 L1080 370 L1200 330 L1200 700 L0 700 Z" />
      </svg>
      <svg className={lc("mid")} viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
        <path fill={p.mid} d="M0 540 L90 470 L200 500 L300 420 L400 480 L470 430 L560 500 L680 410 L790 470 L900 400 L1000 470 L1100 430 L1200 490 L1200 700 L0 700 Z" />
        <path fill="#ffffff" opacity="0.18" d="M300 420 L330 450 L280 452 Z M680 410 L712 446 L660 448 Z M900 400 L930 436 L880 438 Z" />
      </svg>
      <svg className={lc("near")} viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
        <path fill={p.near} d="M0 620 L110 560 L230 590 L360 520 L470 580 L600 540 L720 600 L840 550 L960 590 L1080 540 L1200 590 L1200 700 L0 700 Z" />
      </svg>
      <svg className={lc("ground")} viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
        <path fill={p.ground} d="M0 700 L0 660 L160 640 L330 655 L520 630 L700 650 L880 625 L1040 645 L1200 630 L1200 700 Z" />
      </svg>
      {withFigure && (
        <svg className={lc("figure")} viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
          {/* candidate silhouette with backpack, standing on the near ridge */}
          <g fill={p.ground} transform="translate(905 470) scale(1.35)">
            <ellipse cx="0" cy="118" rx="46" ry="10" opacity="0.5" />
            <circle cx="0" cy="0" r="11" />
            <path d="M-8 12 C -14 14 -18 22 -18 34 L -18 72 L -12 72 L -12 46 L 12 46 L 12 72 L 18 72 L 18 34 C 18 22 14 14 8 12 Z" />
            <path d="M-12 72 L -16 116 L -6 116 L -2 80 L 2 80 L 6 116 L 16 116 L 12 72 Z" />
            <path d="M-18 22 C -30 24 -32 40 -30 60 L -18 62 Z" />
            <path d="M18 24 L 30 44 L 26 47 L 16 34 Z" />
            <rect x="-34" y="26" width="18" height="40" rx="8" />
          </g>
        </svg>
      )}
    </div>
  );
}
