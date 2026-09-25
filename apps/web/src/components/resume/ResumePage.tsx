"use client";
import { memo } from "react";
import type { DrawItem, LaidOutPage, ResumeLayout } from "@/domain/resume/layout";
import { FONT_FILES, type FontKey } from "@/domain/resume/fonts";

const ORDER: Record<DrawItem["kind"], number> = { rect: 0, line: 1, text: 2 };

/** The résumé fonts, once per page that previews résumés — the same files the PDF embeds. */
export function ResumeFonts() {
  const css = (Object.keys(FONT_FILES) as FontKey[]).map((k) => `@font-face{font-family:"wj-${k}";src:url(${FONT_FILES[k]}) format("truetype");font-display:block;}`).join("");
  return <style>{css}</style>;
}

/**
 * One A4 page, drawn from the same positioned items as the PDF. SVG keeps every glyph exactly where
 * the layout engine put it at any zoom, and its text stays real, selectable text.
 */
export const ResumePage = memo(function ResumePage({ layout, page, index, label, className }: { layout: ResumeLayout; page: LaidOutPage; index: number; label?: string; className?: string }) {
  const items = [...page.items].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className={className} role="img" aria-label={label ?? `Résumé page ${index + 1} of ${layout.pages.length}`} style={{ background: "#fff", fontKerning: "none", textRendering: "geometricPrecision" }}>
      {items.map((it, i) => {
        if (it.kind === "rect") return <rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} rx={it.radius} fill={it.fill ?? "none"} stroke={it.stroke} strokeWidth={it.stroke ? 0.6 : undefined} />;
        if (it.kind === "line") return <line key={i} x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} stroke={it.color} strokeWidth={it.width} />;
        const t = (
          // textLength pins each run to the width the layout measured, so the browser's own text shaping
          // can't drift from the PDF at any zoom or font size.
          <text key={i} x={it.x} y={it.y} fontSize={it.size} fill={it.color} style={{ whiteSpace: "pre" }} textLength={it.width > 0 ? it.width : undefined} lengthAdjust="spacing">
            {it.segments.map((s, j) => (
              <tspan key={j} fontFamily={`wj-${s.font}`}>
                {s.text}
              </tspan>
            ))}
          </text>
        );
        return it.link ? (
          <a key={i} href={it.link} target="_blank" rel="noreferrer">
            {t}
          </a>
        ) : (
          t
        );
      })}
    </svg>
  );
});
