/**
 * The résumé layout engine (spec §35–38, §83). Turns a ResumeDocument + a template's design tokens
 * into positioned pages: every line of text, rule and chip at an exact point on an A4 page. The
 * preview (SVG) and the PDF both draw these pages, so what the candidate sees is what they download.
 *
 * Pagination is deterministic: headings and entry headers keep with what follows, a paragraph never
 * leaves a single line at the bottom or top of a page, and nothing is dropped to make content fit.
 * Diagnostics report any overflow, overlap, out-of-bounds content, orphaned heading or empty page.
 */
import { formatMonth, formatRange } from "@/domain/career/history";
import { ascent, fontKey, printableText, segment, widthOf, wrap, type FontKey, type TextSegment, type Weight } from "./fonts";
import { FONT_METRICS } from "./fontMetrics.generated";
import type { ResumeBullet, ResumeDocument, ResumeSection } from "./document";
import type { FontFamilyKey, ResumeTemplate, TemplateDesign } from "./templates";

export const A4 = { width: 595.28, height: 841.89 };

export type DrawItem =
  | { kind: "text"; x: number; y: number; segments: TextSegment[]; size: number; color: string; width: number; link?: string; role?: "heading" | "name" | "body" }
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; radius?: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number };

export interface LaidOutPage {
  items: DrawItem[];
}

export interface LayoutDiagnostics {
  overflowElements: string[];
  overlappingElements: string[];
  outOfBoundsElements: string[];
  orphanHeadings: string[];
  emptyPages: number[];
  missingGlyphs: string[];
  pageCount: number;
}

export interface ResumeLayout {
  width: number;
  height: number;
  pages: LaidOutPage[];
  diagnostics: LayoutDiagnostics;
}

/* ------------------------------------------------------------ primitives */

interface Row {
  h: number;
  draw: (top: number) => DrawItem[];
}

interface Block {
  kind: "header" | "heading" | "entry" | "text";
  label: string;
  rows: Row[];
  spaceBefore: number;
  keepWithNext?: boolean;
  unbreakable?: boolean;
}

interface Ctx {
  d: TemplateDesign;
  left: number;
  right: number;
  width: number;
  missing: Set<string>;
  /** Evidence ids of bullets already shown in Selected Achievements — not repeated under Experience. */
  shownBullets: Set<string>;
}

function lineHeight(ctx: Ctx, size: number) {
  return size * ctx.d.lineHeight;
}

function baseline(key: FontKey, size: number, lh: number, top: number) {
  const m = FONT_METRICS[key];
  const box = ((m.ascender - m.descender) * size) / 1000;
  return top + (lh - box) / 2 + ascent(key, size);
}

function text(ctx: Ctx, s: string, key: FontKey, size: number, x: number, top: number, lh: number, color: string, extra: { link?: string; role?: "heading" | "name" | "body" } = {}): DrawItem {
  return { kind: "text", x, y: baseline(key, size, lh, top), segments: segment(s, key, ctx.missing), size, color, width: widthOf(s, key, size), ...extra };
}

const F = (ctx: Ctx, which: keyof TemplateDesign["fonts"], w: Weight) => fontKey(ctx.d.fonts[which], w);

/** Wrapped paragraph → one row per line. */
function paragraphRows(ctx: Ctx, s: string, key: FontKey, size: number, color: string, indent = 0, firstLinePrefix?: { text: string; key: FontKey }): Row[] {
  s = printableText(s, key);
  const lh = lineHeight(ctx, size);
  const width = ctx.width - indent;
  const prefixW = firstLinePrefix ? widthOf(firstLinePrefix.text, firstLinePrefix.key, size) : 0;
  // Wrap the first line into the width left after the prefix, then the rest at full width.
  let lines: string[];
  if (prefixW) {
    const first = wrap(s, key, size, width - prefixW);
    const head = first[0] ?? "";
    const rest = s.replace(/\s+/g, " ").trim().slice(head.length).trim();
    lines = [head, ...(rest ? wrap(rest, key, size, width) : [])];
  } else lines = wrap(s, key, size, width);
  // No runt: a paragraph never ends on one lone word when the line above can spare one.
  const n = lines.length;
  if (n >= 2 && !lines[n - 1].includes(" ") && lines[n - 2].split(" ").length >= 4 && !(n === 2 && prefixW)) {
    const prev = lines[n - 2].split(" ");
    const moved = `${prev.pop()} ${lines[n - 1]}`;
    if (widthOf(moved, key, size) <= width) {
      lines[n - 2] = prev.join(" ");
      lines[n - 1] = moved;
    }
  }
  return lines.map((line, i) => ({
    h: lh,
    draw: (top) => {
      const items: DrawItem[] = [];
      let x = ctx.left + indent;
      if (i === 0 && firstLinePrefix) {
        items.push(text(ctx, firstLinePrefix.text, firstLinePrefix.key, size, x, top, lh, color));
        x += prefixW;
      }
      if (line) items.push(text(ctx, line, key, size, x, top, lh, color));
      return items;
    },
  }));
}

/**
 * Lines of whole items joined by `sep` ("Go · Java · Kubernetes"): an item never breaks across lines
 * unless it alone is wider than a line. `firstWidth` is the room on the first line (after a label).
 */
function itemLines(items: string[], sep: string, key: FontKey, size: number, width: number, firstWidth = width): string[] {
  const lines: string[] = [];
  let cur = "";
  const room = () => (lines.length ? width : firstWidth);
  for (const raw of items) {
    const it = printableText(raw, key);
    if (!it) continue;
    const tryLine = cur ? `${cur}${sep}${it}` : it;
    // Room is checked with the separator that would end this line, so it never pokes past the margin.
    if (widthOf(`${tryLine}${sep.trimEnd()}`, key, size) <= room() + 0.01) {
      cur = tryLine;
      continue;
    }
    if (cur) {
      // Keep the separator at the end of the line, so the list still reads as one list.
      lines.push(`${cur}${sep.trimEnd()}`);
      cur = "";
    }
    if (widthOf(it, key, size) <= room() + 0.01) cur = it;
    else {
      const parts = wrap(it, key, size, room());
      lines.push(...parts.slice(0, -1));
      cur = parts[parts.length - 1];
    }
  }
  if (cur || !lines.length) lines.push(cur);
  return lines;
}

/** Rows for a list of whole items (inline skills, a skill group after its label). */
function listRows(ctx: Ctx, items: string[], sep: string, key: FontKey, size: number, color: string, label?: { text: string; key: FontKey }): Row[] {
  const lh = lineHeight(ctx, size);
  const labelW = label ? widthOf(label.text, label.key, size) : 0;
  return itemLines(items, sep, key, size, ctx.width, ctx.width - labelW).map((line, i) => ({
    h: lh,
    draw: (top) => {
      const out: DrawItem[] = [];
      let x = ctx.left;
      if (i === 0 && label) {
        out.push(text(ctx, label.text, label.key, size, x, top, lh, color));
        x += labelW;
      }
      if (line) out.push(text(ctx, line, key, size, x, top, lh, color));
      return out;
    },
  }));
}

function bulletBlock(ctx: Ctx, b: ResumeBullet | string, label: string, spaceBefore: number): Block {
  const d = ctx.d;
  const key = F(ctx, "body", 400);
  const rows = paragraphRows(ctx, typeof b === "string" ? b : b.text, key, d.size.body, d.theme.text, d.space.bulletIndent);
  const lh = lineHeight(ctx, d.size.body);
  const first = rows[0];
  rows[0] = { h: first.h, draw: (top) => [text(ctx, "•", key, d.size.body, ctx.left + d.space.bulletIndent - 8, top, lh, d.theme.primary === "#000000" ? d.theme.text : d.theme.primary), ...first.draw(top)] };
  return { kind: "text", label, rows, spaceBefore };
}

/** A left text (wrapping) with a right-aligned text on its first line — entry titles with dates. */
function splitRows(ctx: Ctx, leftText: string, leftKey: FontKey, leftSize: number, leftColor: string, rightText: string | undefined, rightKey: FontKey, rightSize: number, rightColor: string, link?: string): Row[] {
  const lh = lineHeight(ctx, Math.max(leftSize, rightSize));
  const rw = rightText ? widthOf(rightText, rightKey, rightSize) : 0;
  // A long right-hand text (a location with a time zone, a long date note) gets its own line rather
  // than squeezing the title into a narrow column.
  const ownLine = rw > ctx.width * 0.42;
  const avail = ctx.width - (rw && !ownLine ? rw + 12 : 0);
  const lines = wrap(leftText, leftKey, leftSize, avail);
  const rows: Row[] = lines.map((line, i) => ({
    h: lh,
    draw: (top) => {
      const items: DrawItem[] = [text(ctx, line, leftKey, leftSize, ctx.left, top, lh, leftColor, { link: i === 0 ? link : undefined })];
      if (i === 0 && rightText && !ownLine) items.push(text(ctx, rightText, rightKey, rightSize, ctx.right - rw, top, lh, rightColor));
      return items;
    },
  }));
  if (rightText && ownLine) {
    const rlh = lineHeight(ctx, rightSize);
    for (const line of wrap(rightText, rightKey, rightSize, ctx.width)) {
      const w = widthOf(line, rightKey, rightSize);
      rows.push({ h: rlh, draw: (top) => [text(ctx, line, rightKey, rightSize, ctx.right - w, top, rlh, rightColor)] });
    }
  }
  return rows;
}

function chipsRows(ctx: Ctx, items: string[]): Row[] {
  const d = ctx.d;
  const size = d.size.small;
  const key = F(ctx, "body", 400);
  const padX = 6;
  const h = size * 1.95;
  const gap = 4;
  const rows: string[][] = [[]];
  let x = 0;
  for (const it of items) {
    const w = Math.min(ctx.width, widthOf(it, key, size) + padX * 2);
    if (x > 0 && x + w > ctx.width) {
      rows.push([]);
      x = 0;
    }
    rows[rows.length - 1].push(it);
    x += w + gap;
  }
  return rows.map((r) => ({
    h: h + gap,
    draw: (top) => {
      const out: DrawItem[] = [];
      let cx = ctx.left;
      for (const it of r) {
        // A chip wider than the line (one very long skill) wraps to its own line and is clipped by the line width check instead of overflowing.
        const label = widthOf(it, key, size) + padX * 2 > ctx.width ? wrap(it, key, size, ctx.width - padX * 2)[0] : it;
        const w = widthOf(label, key, size) + padX * 2;
        out.push({ kind: "rect", x: cx, y: top, w, h, fill: d.theme.tint, stroke: d.theme.tint === "#ffffff" ? d.theme.border : undefined, radius: 3 });
        out.push(text(ctx, label, key, size, cx + padX, top, h, d.theme.text));
        cx += w + gap;
      }
      return out;
    },
  }));
}

/**
 * A bulleted list in columns, filled down each column (so it reads in the candidate's order). Three
 * columns when every item fits one, otherwise two.
 */
function columnRows(ctx: Ctx, items: string[]): Row[] {
  const d = ctx.d;
  const size = d.size.body;
  const key = F(ctx, "body", 400);
  const lh = lineHeight(ctx, size);
  const gutter = 14;
  const colWidth = (n: number) => (ctx.width - gutter * (n - 1)) / n;
  const fits = (n: number) => items.every((it) => widthOf(it, key, size) <= colWidth(n) - d.space.bulletIndent);
  const cols = items.length >= 9 && fits(3) ? 3 : 2;
  const colW = colWidth(cols);
  const perCol = Math.ceil(items.length / cols);
  const cell = (s: string | undefined) => (s ? wrap(s, key, size, colW - d.space.bulletIndent) : []);
  const rows: Row[] = [];
  for (let r = 0; r < perCol; r++) {
    const cells = Array.from({ length: cols }, (_, c) => cell(items[c * perCol + r]));
    const n = Math.max(...cells.map((x) => x.length));
    rows.push({
      h: n * lh,
      draw: (top) => {
        const out: DrawItem[] = [];
        cells.forEach((lines, c) => {
          if (!lines.length) return;
          const x0 = ctx.left + c * (colW + gutter);
          out.push(text(ctx, "•", key, size, x0 + d.space.bulletIndent - 8, top, lh, d.theme.primary === "#000000" ? d.theme.text : d.theme.primary));
          lines.forEach((l, j) => out.push(text(ctx, l, key, size, x0 + d.space.bulletIndent, top + j * lh, lh, d.theme.text)));
        });
        return out;
      },
    });
  }
  return rows;
}

/* -------------------------------------------------------------- header */

function contactItems(doc: ResumeDocument): { text: string; link?: string }[] {
  const h = doc.header;
  const bare = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  return [
    h.location ? { text: h.location } : null,
    h.phone ? { text: h.phone, link: `tel:${h.phone.replace(/[^\d+]/g, "")}` } : null,
    h.email ? { text: h.email, link: `mailto:${h.email}` } : null,
    h.linkedinUrl ? { text: bare(h.linkedinUrl), link: h.linkedinUrl } : null,
    h.portfolioUrl ? { text: bare(h.portfolioUrl), link: h.portfolioUrl } : null,
    h.websiteUrl ? { text: bare(h.websiteUrl), link: h.websiteUrl } : null,
  ].filter((x): x is { text: string; link?: string } => !!x);
}

/**
 * Contact items split over as few lines as greedy wrapping needs, but evened out — never one lonely
 * item on the last line — and never breaking an item. Order is kept.
 */
function balanceContacts<T extends { w: number }>(items: T[], sepW: number, width: number): T[][] {
  const lineW = (xs: T[]) => xs.reduce((n, x, i) => n + x.w + (i ? sepW : 0), 0);
  let n = 1;
  for (let i = 0, w = 0; i < items.length; i++) {
    const add = (w ? sepW : 0) + items[i].w;
    if (w && w + add > width) {
      n++;
      w = items[i].w;
    } else w += add;
  }
  if (n === 1) return [items];
  // Few items (≤ 6): try every way to cut them into n lines; keep the one whose longest line is shortest.
  let best: T[][] | null = null;
  let bestMax = Infinity;
  const cut = (start: number, left: number, acc: T[][]) => {
    if (left === 1) {
      const lines = [...acc, items.slice(start)];
      const max = Math.max(...lines.map(lineW));
      if (max <= width + 0.01 && max < bestMax) {
        best = lines;
        bestMax = max;
      }
      return;
    }
    for (let end = start + 1; end <= items.length - (left - 1); end++) cut(end, left - 1, [...acc, items.slice(start, end)]);
  };
  cut(0, n, []);
  return best ?? [items];
}

function headerBlock(ctx: Ctx, doc: ResumeDocument, tpl: ResumeTemplate): Block {
  const d = ctx.d;
  const center = d.header === "centered" || (d.header === "band" && tpl.family !== "creative");
  const nameKey = F(ctx, "name", d.fonts.name === "serif" ? 600 : 700);
  const name = d.nameCase === "upper" ? doc.header.name.toUpperCase() : doc.header.name;
  const nameColor = d.header === "left-accent" || tpl.family === "creative" ? d.theme.primary : d.theme.text;
  const rows: Row[] = [];
  const place = (w: number) => (center ? ctx.left + (ctx.width - w) / 2 : ctx.left);

  const nameLh = d.size.name * 1.18;
  for (const line of wrap(name, nameKey, d.size.name, ctx.width)) {
    const w = widthOf(line, nameKey, d.size.name);
    rows.push({ h: nameLh, draw: (top) => [text(ctx, line, nameKey, d.size.name, place(w), top, nameLh, nameColor, { role: "name" })] });
  }
  if (doc.header.headline) {
    const key = F(ctx, "body", 600);
    const lh = lineHeight(ctx, d.size.headline);
    const s = d.header === "band" && tpl.family !== "creative" ? doc.header.headline.toUpperCase() : doc.header.headline;
    rows.push({ h: 3, draw: () => [] });
    for (const line of wrap(s, key, d.size.headline, ctx.width)) {
      const w = widthOf(line, key, d.size.headline);
      rows.push({ h: lh, draw: (top) => [text(ctx, line, key, d.size.headline, place(w), top, lh, tpl.family === "executive" || d.header === "left-accent" ? d.theme.primary : d.theme.muted)] });
    }
  }
  const contacts = contactItems(doc);
  if (contacts.length) {
    const key = F(ctx, "body", 400);
    const size = d.size.contact;
    const lh = lineHeight(ctx, size);
    const sep = d.header === "left" || d.header === "left-accent" ? "   |   " : "   ·   ";
    const sepW = widthOf(sep, key, size);
    const lines = balanceContacts(contacts.map((c) => ({ ...c, w: widthOf(c.text, key, size) })), sepW, ctx.width);
    rows.push({ h: 5, draw: () => [] });
    for (const line of lines) {
      const total = line.reduce((n, c, i) => n + widthOf(c.text, key, size) + (i ? sepW : 0), 0);
      rows.push({
        h: lh,
        draw: (top) => {
          const out: DrawItem[] = [];
          let x = place(total);
          line.forEach((c, i) => {
            if (i) {
              // A middle dot in the pale rule colour all but disappears; bars are drawn as light rules.
              out.push(text(ctx, sep, key, size, x, top, lh, sep.includes("|") ? d.theme.border : d.theme.muted));
              x += sepW;
            }
            // Links stay in the text colour (never colour-only) — the underline-free link is also in the PDF annotation.
            out.push(text(ctx, c.text, key, size, x, top, lh, d.theme.muted, { link: c.link }));
            x += widthOf(c.text, key, size);
          });
          return out;
        },
      });
    }
  }
  // Decoration behind/under the header (renderers draw shapes before text).
  const bandPad = 16;
  const decor: Row = {
    h: d.header === "band" ? bandPad : 6,
    draw: (top) => {
      if (d.header === "band") return [{ kind: "rect", x: 0, y: 0, w: A4.width, h: top + bandPad - 6, fill: d.theme.tint }, ...(tpl.family === "creative" ? [{ kind: "rect", x: 0, y: 0, w: 6, h: top + bandPad - 6, fill: d.theme.primary } as DrawItem] : [])];
      if (d.header === "left-accent") return [{ kind: "line", x1: ctx.left, y1: top + 4, x2: ctx.right, y2: top + 4, color: d.theme.primary, width: 1.6 }];
      if (d.header === "centered" && tpl.family === "classic-ats") return [{ kind: "line", x1: ctx.left, y1: top + 4, x2: ctx.right, y2: top + 4, color: d.theme.text, width: 0.8 }];
      return [];
    },
  };
  return { kind: "header", label: "header", rows: [...rows, decor], spaceBefore: 0, unbreakable: true };
}

/**
 * Continues the last line of `rows` with more text in another weight (a certification's issuer after
 * its name), wrapping onto new lines when it doesn't fit. `reserve` keeps room for a right-hand date.
 */
function appendToLastLine(ctx: Ctx, rows: Row[], extra: string, key: FontKey, size: number, color: string, reserve: number) {
  const last = rows[rows.length - 1];
  const lh = last.h;
  let used = 0;
  last.draw(0).forEach((it) => {
    if (it.kind === "text" && it.x < ctx.left + ctx.width / 2) used = Math.max(used, it.x + it.width - ctx.left);
  });
  const room = ctx.width - used - reserve;
  const firstFit = wrap(extra.trim(), key, size, room)[0] ?? "";
  if (room > 40 && widthOf(` ${firstFit}`, key, size) <= room) {
    const rest = extra.trim().slice(firstFit.length).trim();
    const prev = last.draw;
    rows[rows.length - 1] = { h: lh, draw: (top) => [...prev(top), text(ctx, ` ${firstFit}`, key, size, ctx.left + used, top, lh, color)] };
    if (rest) rows.push(...paragraphRows(ctx, rest, key, size, color));
  } else rows.push(...paragraphRows(ctx, extra.trim(), key, size, color));
}

/* ------------------------------------------------------------ sections */

function headingBlock(ctx: Ctx, title: string, spaceBefore: number): Block {
  const d = ctx.d;
  const key = F(ctx, "heading", 700);
  const size = d.size.section;
  const s = d.sectionCase === "upper" ? title.toUpperCase() : title;
  const lh = size * 1.3;
  const color = d.sectionHeading === "plain" ? d.theme.text : d.theme.primary;
  const extra = d.sectionHeading === "rule" ? 5 : 2;
  return {
    kind: "heading",
    label: title,
    spaceBefore,
    keepWithNext: true,
    unbreakable: true,
    rows: [
      {
        h: lh + extra + d.space.afterHeading,
        draw: (top) => {
          const out: DrawItem[] = [];
          let x = ctx.left;
          if (d.sectionHeading === "bar") {
            out.push({ kind: "rect", x: ctx.left, y: top + (lh - size) / 2, w: 3, h: size, fill: d.theme.primary });
            x += 9;
          }
          out.push(text(ctx, s, key, size, x, top, lh, color, { role: "heading" }));
          if (d.sectionHeading === "rule") out.push({ kind: "line", x1: ctx.left, y1: top + lh + 2, x2: ctx.right, y2: top + lh + 2, color: d.theme.border, width: 0.8 });
          return out;
        },
      },
    ],
  };
}

function sectionBlocks(ctx: Ctx, s: ResumeSection, title: string): Block[] {
  const d = ctx.d;
  const body = F(ctx, "body", 400);
  const semi = F(ctx, "body", 600);
  const bold = F(ctx, "heading", 700);
  const blocks: Block[] = [headingBlock(ctx, title, d.space.section)];
  const push = (b: Block) => blocks.push(b);
  const first = () => blocks.length === 1;

  switch (s.type) {
    case "summary":
      push({ kind: "text", label: title, rows: paragraphRows(ctx, s.text, body, d.size.body, d.theme.text), spaceBefore: 0 });
      break;
    case "strengths":
    case "selected_achievements":
      s.items.forEach((b, i) => push(bulletBlock(ctx, b, `${title} ${i + 1}`, i ? d.space.bullet : 0)));
      break;
    case "transferable_skills":
    case "research_interests":
      push({ kind: "text", label: title, rows: chipsRows(ctx, s.items), spaceBefore: 0 });
      break;
    case "skills": {
      const all = s.ordered ?? s.groups.flatMap((g) => g.skills);
      if (d.skills === "chips") push({ kind: "text", label: title, rows: chipsRows(ctx, all), spaceBefore: 0 });
      else if (d.skills === "columns") push({ kind: "text", label: title, rows: columnRows(ctx, all), spaceBefore: 0 });
      else if (d.skills === "inline") push({ kind: "text", label: title, rows: listRows(ctx, all, "  ·  ", body, d.size.body, d.theme.text), spaceBefore: 0 });
      else
        s.groups.forEach((g, i) =>
          push({ kind: "text", label: `${title}: ${g.name}`, rows: listRows(ctx, g.skills, ", ", body, d.size.body, d.theme.text, { text: `${g.name}: `, key: semi }), spaceBefore: i ? d.space.bullet : 0 }),
        );
      break;
    }
    case "experience":
      s.items.forEach((orig) => {
        const e = ctx.shownBullets.size ? { ...orig, bullets: orig.bullets.filter((b) => !b.evidenceIds.some((id) => ctx.shownBullets.has(id))) } : orig;
        const dates = formatRange(e.startDate, e.endDate, e.current);
        const headRows =
          d.entry === "company-first"
            ? [...splitRows(ctx, e.employer, bold, d.size.entryTitle, d.theme.text, dates, body, d.size.small, d.theme.muted), ...splitRows(ctx, e.title, semi, d.size.body, d.theme.primary === "#000000" ? d.theme.text : d.theme.primary, e.location, body, d.size.small, d.theme.muted)]
            : [...splitRows(ctx, e.title, bold, d.size.entryTitle, d.theme.text, dates, body, d.size.small, d.theme.muted), ...paragraphRows(ctx, [e.employer, e.location].filter(Boolean).join("  ·  "), semi, d.size.body, d.theme.muted)];
        push({ kind: "entry", label: `${e.title} — ${e.employer}`, rows: [...headRows, { h: 2, draw: () => [] }], spaceBefore: first() ? 0 : d.space.entry, keepWithNext: e.bullets.length > 0 || !!e.summary, unbreakable: true });
        if (e.summary) push({ kind: "text", label: `${e.employer} summary`, rows: paragraphRows(ctx, e.summary, body, d.size.body, d.theme.muted), spaceBefore: 0, keepWithNext: e.bullets.length > 0 });
        e.bullets.forEach((b, i) => push(bulletBlock(ctx, b, `${e.employer} bullet ${i + 1}`, i || e.summary ? d.space.bullet : 0)));
      });
      break;
    case "education":
      s.items.forEach((e) => {
        const dates = formatRange(e.startDate, e.endDate);
        const detail = [[e.degree, e.field].filter(Boolean).join(", "), e.location].filter(Boolean).join("  ·  ");
        const rows = [...splitRows(ctx, e.institution, bold, d.size.entryTitle, d.theme.text, dates || undefined, body, d.size.small, d.theme.muted)];
        if (detail) rows.push(...paragraphRows(ctx, detail, body, d.size.body, d.theme.muted));
        if (e.honors?.length) rows.push(...paragraphRows(ctx, e.honors.join(", "), body, d.size.small, d.theme.muted));
        push({ kind: "entry", label: e.institution, rows, spaceBefore: first() ? 0 : d.space.entry - 2, unbreakable: true });
      });
      break;
    case "certifications":
      s.items.forEach((c, i) => {
        const date = [formatMonth(c.issueDate), c.expiryDate ? `expires ${formatMonth(c.expiryDate)}` : ""].filter(Boolean).join(" · ");
        const rows = splitRows(ctx, c.name, semi, d.size.body, d.theme.text, date || undefined, body, d.size.small, d.theme.muted, c.url);
        if (c.issuer) appendToLastLine(ctx, rows, ` — ${c.issuer}`, body, d.size.body, d.theme.text, date && widthOf(date, body, d.size.small) <= ctx.width * 0.42 && rows.length === 1 ? widthOf(date, body, d.size.small) + 12 : 0);
        if (c.credentialId) rows.push(...paragraphRows(ctx, `Credential ID ${c.credentialId}`, body, d.size.small, d.theme.muted));
        push({ kind: "entry", label: c.name, rows, spaceBefore: i ? d.space.bullet + 1 : 0, unbreakable: true });
      });
      break;
    case "projects":
      s.items.forEach((p, i) => {
        const host = p.url ? p.url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "") : undefined;
        const rows = splitRows(ctx, p.name, bold, d.size.entryTitle, d.theme.text, host, body, d.size.small, d.theme.muted, undefined);
        push({ kind: "entry", label: p.name, rows, spaceBefore: i ? d.space.entry : 0, keepWithNext: !!(p.description || p.technologies?.length || p.bullets?.length), unbreakable: true });
        if (p.url && host) {
          // The link lives on the visible host text at the right of the title line.
          const last = blocks[blocks.length - 1];
          const r0 = last.rows[0];
          last.rows[0] = { h: r0.h, draw: (top) => r0.draw(top).map((it) => (it.kind === "text" && it.segments.map((x) => x.text).join("") === host ? { ...it, link: p.url } : it)) };
        }
        if (p.description) push({ kind: "text", label: `${p.name} description`, rows: paragraphRows(ctx, p.description, body, d.size.body, d.theme.text), spaceBefore: 0 });
        if (p.technologies?.length) push({ kind: "text", label: `${p.name} technologies`, rows: paragraphRows(ctx, p.technologies.join(", "), body, d.size.small, d.theme.muted, 0, { text: "Technologies: ", key: semi }), spaceBefore: 1 });
        (p.bullets ?? []).forEach((b, j) => push(bulletBlock(ctx, b, `${p.name} bullet ${j + 1}`, j ? d.space.bullet : 1)));
      });
      break;
    case "publications":
      s.items.forEach((p, i) => {
        const line = [p.authors?.length ? `${p.authors.join(", ")}.` : "", `${p.title}.`, [p.publication, formatMonth(p.date)].filter(Boolean).join(", ")].filter(Boolean).join(" ");
        const rows = paragraphRows(ctx, line, body, d.size.body, d.theme.text);
        if (p.url) {
          const r0 = rows[0];
          rows[0] = { h: r0.h, draw: (top) => r0.draw(top).map((it, k) => (k === 0 && it.kind === "text" ? { ...it, link: p.url } : it)) };
        }
        push({ kind: "text", label: p.title, rows, spaceBefore: i ? d.space.bullet + 2 : 0 });
      });
      break;
  }
  return blocks;
}

/* ------------------------------------------------------------- paginate */

function totalH(b: Block) {
  return b.rows.reduce((n, r) => n + r.h, 0);
}

/** Every string in the document, for reporting characters no résumé font can print. */
function documentText(doc: ResumeDocument): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => k !== "metadata" && k !== "evidenceIds" && walk(x));
  };
  walk(doc.header);
  walk(doc.sections);
  return out;
}

/**
 * Tighter spacing for the same design (never smaller type): vertical gaps scaled by `k`, line height
 * eased toward 1.25. Used only to pull a nearly empty last page back.
 */
function tightened(tpl: ResumeTemplate, k: number): ResumeTemplate {
  const d = tpl.design;
  const sp = d.space;
  return {
    ...tpl,
    design: {
      ...d,
      lineHeight: Math.max(1.25, d.lineHeight - (1 - k) * 0.35),
      space: { ...sp, section: sp.section * k, afterHeading: sp.afterHeading * k, entry: sp.entry * k, bullet: sp.bullet * k, header: sp.header * k },
    },
  };
}

/** How far the last page is filled, as a share of the printable height. */
const lastPageFill = (l: ResumeLayout & { lastY: number }, tpl: ResumeTemplate) => {
  const m = tpl.design.page.margin;
  return (l.lastY - m.top) / (A4.height - m.top - m.bottom);
};

/**
 * The template as it should be laid out for this document. When the content spills a little onto a
 * last page (under a third of it — a lone bullet, the last section or two), spacing is tightened in
 * small steps, down to 70% of the design's gaps, and the first variant that saves that page is used.
 * Type sizes, margins and content never change. DOCX uses the same result, so both formats agree.
 */
export function fittedTemplate(doc: ResumeDocument, tpl: ResumeTemplate): ResumeTemplate {
  const base = layoutWith(doc, tpl);
  if (base.pages.length < 2 || lastPageFill(base, tpl) >= 0.33) return tpl;
  for (const k of [0.9, 0.8, 0.7]) {
    const t = tightened(tpl, k);
    if (layoutWith(doc, t).pages.length < base.pages.length) return t;
  }
  return tpl;
}

export function layoutResume(doc: ResumeDocument, tpl: ResumeTemplate): ResumeLayout {
  const { lastY: _lastY, ...layout } = layoutWith(doc, fittedTemplate(doc, tpl));
  void _lastY;
  return layout;
}

function layoutWith(doc: ResumeDocument, tpl: ResumeTemplate): ResumeLayout & { lastY: number } {
  const d = tpl.design;
  const m = d.page.margin;
  // Career Shift leads with Selected Achievements; those bullets aren't printed a second time under Experience.
  const showsBoth = d.sections.some((x) => x.type === "selected_achievements") && d.sections.some((x) => x.type === "experience");
  const achievements = showsBoth ? doc.sections.find((x) => x.type === "selected_achievements") : undefined;
  const shownBullets = new Set(achievements?.type === "selected_achievements" ? achievements.items.flatMap((b) => b.evidenceIds) : []);
  const ctx: Ctx = { d, left: m.left, right: A4.width - m.right, width: A4.width - m.left - m.right, missing: new Set(), shownBullets };
  for (const t of documentText(doc)) printableText(t, "inter-400", ctx.missing);
  const top = m.top;
  const bottom = A4.height - m.bottom;
  const pageH = bottom - top;

  const blocks: Block[] = [headerBlock(ctx, doc, tpl)];
  for (const sec of d.sections) {
    const s = doc.sections.find((x) => x.type === sec.type);
    if (s) blocks.push(...sectionBlocks(ctx, s, sec.title));
  }
  if (blocks[1]) blocks[1].spaceBefore = d.space.header;

  // Height a block needs at the bottom of a page to start there validly.
  const lead = (i: number, depth = 0): number => {
    const b = blocks[i];
    const own = b.unbreakable ? totalH(b) : b.rows.slice(0, Math.min(2, b.rows.length)).reduce((n, r) => n + r.h, 0);
    if (b.keepWithNext && blocks[i + 1] && depth < 6) return Math.min(pageH, totalH(b) + blocks[i + 1].spaceBefore + lead(i + 1, depth + 1));
    return Math.min(pageH, own);
  };

  const pages: { items: DrawItem[]; blocks: Block[] }[] = [{ items: [], blocks: [] }];
  let y = top;
  const newPage = () => {
    pages.push({ items: [], blocks: [] });
    y = top;
  };
  blocks.forEach((b, i) => {
    let space = y === top ? 0 : b.spaceBefore;
    if (y + space + lead(i) > bottom + 0.01 && y > top) {
      newPage();
      space = 0;
    }
    y += space;
    const page = () => pages[pages.length - 1];
    page().blocks.push(b);
    let j = 0;
    while (j < b.rows.length) {
      // How many of the remaining rows fit here?
      let k = j;
      let h = 0;
      while (k < b.rows.length && y + h + b.rows[k].h <= bottom + 0.01) h += b.rows[++k - 1].h;
      if (k === b.rows.length || b.unbreakable) {
        if (k < b.rows.length && y > top) {
          newPage();
          page().blocks.push(b);
          continue;
        }
        for (; j < b.rows.length; j++) {
          page().items.push(...b.rows[j].draw(y));
          y += b.rows[j].h;
        }
        break;
      }
      if (k === j && y === top) {
        // A single row taller than a page: place it (the diagnostics report the overflow) rather than loop.
        page().items.push(...b.rows[j].draw(y));
        y += b.rows[j].h;
        j++;
        if (j < b.rows.length) {
          newPage();
          page().blocks.push(b);
        }
        continue;
      }
      // Split a paragraph: never leave one line behind or carry one line over.
      if (b.rows.length - k < 2 && k - j > 2) k -= 1;
      if (k - j < 2 && y > top) {
        newPage();
        page().blocks.push(b);
        continue;
      }
      for (; j < k; j++) {
        page().items.push(...b.rows[j].draw(y));
        y += b.rows[j].h;
      }
      newPage();
      page().blocks.push(b);
    }
  });

  // Diagnostics
  const diag: LayoutDiagnostics = { overflowElements: [], overlappingElements: [], outOfBoundsElements: [], orphanHeadings: [], emptyPages: [], missingGlyphs: [...ctx.missing], pageCount: pages.length };
  pages.forEach((p, pi) => {
    const texts = p.items.filter((it): it is Extract<DrawItem, { kind: "text" }> => it.kind === "text");
    if (!texts.length) diag.emptyPages.push(pi + 1);
    const boxes = texts.map((t) => ({ t, x0: t.x, x1: t.x + t.width, y0: t.y - t.size * 0.75, y1: t.y + t.size * 0.22 }));
    for (const bx of boxes) {
      const label = bx.t.segments.map((s) => s.text).join("").slice(0, 40);
      if (bx.x1 > A4.width - m.right + 0.5 || bx.x0 < m.left - 0.5) diag.overflowElements.push(`p${pi + 1}: ${label}`);
      if (bx.y1 > bottom + 1 || bx.y0 < top - 1) diag.outOfBoundsElements.push(`p${pi + 1}: ${label}`);
    }
    for (let a = 0; a < boxes.length; a++)
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a];
        const B = boxes[b];
        const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
        const oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
        if (ox > 0.5 && oy > 0.5) diag.overlappingElements.push(`p${pi + 1}: "${A.t.segments.map((s) => s.text).join("").slice(0, 25)}" / "${B.t.segments.map((s) => s.text).join("").slice(0, 25)}"`);
      }
    const last = p.blocks[p.blocks.length - 1];
    if (last?.kind === "heading" && pi < pages.length - 1) diag.orphanHeadings.push(`p${pi + 1}: ${last.label}`);
  });
  return { width: A4.width, height: A4.height, pages: pages.map((p) => ({ items: p.items })), diagnostics: diag, lastY: y };
}

export function fontsUsed(layout: ResumeLayout): FontKey[] {
  const s = new Set<FontKey>();
  for (const p of layout.pages) for (const it of p.items) if (it.kind === "text") for (const seg of it.segments) s.add(seg.font);
  return [...s];
}

export type { FontFamilyKey };
