/**
 * Text measurement for the résumé layout engine, from the advance widths of the exact font files the
 * preview and the PDF use (scripts/resume-fonts.py). Kerning and ligatures are removed from those
 * files, so a line measured here is the same width on screen and on paper.
 */
import { FONT_METRICS } from "./fontMetrics.generated";
import type { FontFamilyKey } from "./templates";

export type Weight = 400 | 600 | 700;
export type FontKey = keyof typeof FONT_METRICS;

/** Plex ships 400/600; a bold request uses its 600. */
export function fontKey(family: FontFamilyKey, weight: Weight): FontKey {
  const w = family === "plex" && weight === 700 ? 600 : weight;
  return `${family}-${w}` as FontKey;
}

const tables = new Map<FontKey, Map<number, number>>();
function table(key: FontKey): Map<number, number> {
  let t = tables.get(key);
  if (!t) {
    t = new Map();
    for (const [start, widths] of FONT_METRICS[key].runs as unknown as [number, number[]][]) widths.forEach((w, i) => t!.set(start + i, w));
    tables.set(key, t);
  }
  return t;
}

export function hasGlyph(key: FontKey, cp: number) {
  return table(key).has(cp);
}

/** Inter has the widest coverage; a glyph missing from a template's font is drawn in Inter of the same weight. */
export function fallbackKey(key: FontKey): FontKey {
  const w = key.split("-")[1];
  return `inter-${w === "600" || w === "700" ? w : "400"}` as FontKey;
}

export interface TextSegment {
  text: string;
  font: FontKey;
}

/** Splits text into runs drawable by one font; characters no font has become "?" and are reported. */
export function segment(text: string, key: FontKey, missing?: Set<string>): TextSegment[] {
  const out: TextSegment[] = [];
  const fb = fallbackKey(key);
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    let k: FontKey = key;
    let c = ch;
    if (!hasGlyph(key, cp)) {
      if (hasGlyph(fb, cp)) k = fb;
      else {
        missing?.add(ch);
        c = "?";
      }
    }
    const last = out[out.length - 1];
    if (last && last.font === k) last.text += c;
    else out.push({ text: c, font: k });
  }
  return out;
}

export function widthOf(text: string, key: FontKey, size: number): number {
  let units = 0;
  for (const s of segment(text, key)) {
    const t = table(s.font);
    const fallback = FONT_METRICS[s.font].fallback;
    for (const ch of s.text) units += t.get(ch.codePointAt(0)!) ?? fallback;
  }
  return (units * size) / 1000;
}

export function ascent(key: FontKey, size: number) {
  return (FONT_METRICS[key].ascender * size) / 1000;
}

/** Greedy word wrap; a word wider than the line (a long URL, a 100-character employer) is broken by character. */
export function wrap(text: string, key: FontKey, size: number, width: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  const fits = (s: string) => widthOf(s, key, size) <= width + 0.01;
  for (const w of words) {
    const tryLine = cur ? `${cur} ${w}` : w;
    if (fits(tryLine)) {
      cur = tryLine;
      continue;
    }
    if (cur) lines.push(cur);
    if (fits(w)) {
      cur = w;
      continue;
    }
    // Break an over-long word.
    let piece = "";
    for (const ch of w) {
      if (fits(piece + ch)) piece += ch;
      else {
        lines.push(piece);
        piece = ch;
      }
    }
    cur = piece;
  }
  if (cur || !lines.length) lines.push(cur);
  return lines;
}

export const FONT_FILES: Record<FontKey, string> = Object.fromEntries((Object.keys(FONT_METRICS) as FontKey[]).map((k) => [k, `/fonts/resume/${k}.ttf`])) as Record<FontKey, string>;
