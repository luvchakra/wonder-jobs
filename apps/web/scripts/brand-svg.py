#!/usr/bin/env python3
"""
Builds the WonderWorks logo SVGs (file names keep their wonderstar- prefix) in public/brand/ (docs/WONDERWORKS_PLATFORM.md §9, docs/brand/wonderstar-identity.png).

The wordmark and tagline are Poppins glyph outlines, so every SVG renders identically wherever it's used
(an <img>, an email client, an icon route) without the font being installed. Re-run it after changing the
mark or the colours, then `node scripts/brand-assets.mjs` for the PNGs:

    pip install fonttools
    python3 scripts/brand-svg.py <dir holding Poppins p400.woff and p600.woff>

The Poppins files are the Google Fonts latin subsets (fonts.gstatic.com), OFL-licensed.
"""
import os
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONTS = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "brand")

# The sheet's colours.
STAR_PURPLE, INDIGO, SKY_BLUE, MAGENTA, DEEP_NAVY = "#7C3AED", "#4F46E5", "#3B82F6", "#EC4899", "#0F172A"
TAGLINE = ("DISCOVER OPPORTUNITIES.", "UNLOCK POSSIBILITIES.")


def text_path(font, text, x, baseline, size, tracking=0.0):
    """SVG path data for `text` set in `font` at `size` px, starting at (x, baseline). Returns (d, advance)."""
    cmap, gs = font.getBestCmap(), font.getGlyphSet()
    scale = size / font["head"].unitsPerEm
    parts, cursor = [], x
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, baseline)))
        parts.append(pen.getCommands())
        cursor += gs[name].width * scale + tracking * size
    return " ".join(p for p in parts if p), cursor - x - tracking * size


def defs(white):
    # "Works" runs violet→blue; on dark surfaces both stops lift so the word keeps its contrast.
    star_a, star_b = ("#C4B5FD", "#93C5FD") if white else (STAR_PURPLE, SKY_BLUE)
    return f"""<defs>
    <linearGradient id="ws-left" x1="0.1" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#3730FF"/><stop offset="0.45" stop-color="#5B78FF"/><stop offset="1" stop-color="#C9A2F9"/></linearGradient>
    <linearGradient id="ws-left-fold" x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stop-color="#8F7BFF" stop-opacity="0.5"/><stop offset="1" stop-color="#4C0FF5"/></linearGradient>
    <linearGradient id="ws-right" x1="0.1" y1="1" x2="0.8" y2="0"><stop offset="0" stop-color="#5312FF"/><stop offset="0.5" stop-color="#A43FF7"/><stop offset="1" stop-color="#F563E0"/></linearGradient>
    <linearGradient id="ws-right-fold" x1="0.2" y1="1" x2="0.8" y2="0"><stop offset="0" stop-color="#8A3FFF"/><stop offset="0.6" stop-color="#E24DF2"/><stop offset="1" stop-color="#FF7EBF"/></linearGradient>
    <linearGradient id="ws-spark" x1="0" y1="0" x2="1" y2="0"><stop offset="0.2" stop-color="#3D33FF"/><stop offset="0.55" stop-color="#B444FF"/><stop offset="0.85" stop-color="#FF5CCF"/></linearGradient>
    <linearGradient id="ws-word" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{star_a}"/><stop offset="1" stop-color="{star_b}"/></linearGradient>
  </defs>"""


# The mark, on a 120×100 grid: a "W" of two rounded wings meeting at a point — the left one blue to lavender, the
# right one violet to pink, each with a darker fold toward the middle — under a four-point star. Drawn on the
# reference artwork's pixel grid and scaled onto 120×100.
MARK = """<g transform="translate(1.4 9.8) scale(0.11) translate(-233 -137)">
    <path d="M240 374A66 66 0 0 1 326 284L588 400Q630 418 652 456L763 645L640 815A97 97 0 0 1 458 832Z" fill="url(#ws-left)"/>
    <path d="M588 400Q630 418 652 456L763 645L640 815Q652 780 622 715Q562 590 562 500Q562 430 588 400Z" fill="url(#ws-left-fold)"/>
    <path d="M763 645L880 460Q905 422 948 403L1208 285A66 66 0 0 1 1293 376L1056 835A97 97 0 0 1 878 815Z" fill="url(#ws-right)"/>
    <path d="M878 815Q868 785 892 735Q990 510 1112 342L1208 285A66 66 0 0 1 1293 376L1056 835A97 97 0 0 1 878 815Z" fill="url(#ws-right-fold)" opacity="0.85"/>
    <path d="M766 138C772 236 790 288 920 298C790 310 772 362 766 462C760 362 742 310 612 298C742 288 760 236 766 138Z" fill="url(#ws-spark)"/>
  </g>"""
MARK_W, MARK_H = 120, 100


def svg(w, h, body, white, label):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{label}">\n'
        f"  {defs(white)}\n  {body}\n</svg>\n"
    )


def wordmark(bold, x, baseline, size, white):
    wonder, w1 = text_path(bold, "Wonder", x, baseline, size, -0.01)
    star, w2 = text_path(bold, "Works", x + w1 + 0.01 * size * -1, baseline, size, -0.01)
    ink = "#FFFFFF" if white else DEEP_NAVY
    return f'<path d="{wonder}" fill="{ink}"/>\n  <path d="{star}" fill="url(#ws-word)"/>', w1 + w2


def tagline(regular, cx, baseline, size, white, line_gap):
    ink = "#FFFFFF" if white else DEEP_NAVY
    out = []
    for i, line in enumerate(TAGLINE):
        _, width = text_path(regular, line, 0, 0, size, 0.32)
        d, _ = text_path(regular, line, cx - width / 2, baseline + i * line_gap, size, 0.32)
        out.append(f'<path d="{d}" fill="{ink}"/>')
    return "\n  ".join(out)


def main():
    bold = TTFont(os.path.join(FONTS, "p600.woff"))
    regular = TTFont(os.path.join(FONTS, "p400.woff"))
    os.makedirs(OUT, exist_ok=True)

    def write(name, content):
        with open(os.path.join(OUT, name), "w") as f:
            f.write(content)

    # Mark alone (also the source of the favicon, apple-touch and PWA icons).
    write("wonderstar-mark.svg", svg(MARK_W, MARK_H, MARK, False, "WonderWorks"))

    # App icon: the mark on Deep Navy, rounded square.
    icon = f'<rect width="512" height="512" rx="112" fill="{DEEP_NAVY}"/>\n  <g transform="translate(76 96) scale(3)">{MARK}</g>'
    write("wonderstar-app-icon.svg", svg(512, 512, icon, False, "WonderWorks"))

    # Primary (horizontal): mark + wordmark, the wordmark's cap height ~ 60% of the mark.
    for white in (False, True):
        size, gap = 84, 10
        words, wwidth = wordmark(bold, MARK_W + gap, 82, size, white)
        body = f"{MARK}\n  {words}"
        write(f"wonderstar-logo{'-white' if white else ''}.svg", svg(MARK_W + gap + wwidth + 2, MARK_H, body, white, "WonderWorks"))

    # Stacked with the tagline.
    for white in (False, True):
        size = 84
        _, wwidth = wordmark(bold, 0, 0, size, white)
        _, t1 = text_path(regular, TAGLINE[0], 0, 0, 22, 0.32)
        width = max(wwidth, t1) + 8
        cx = width / 2
        mark = f'<g transform="translate({cx - MARK_W * 0.6:.2f} 0) scale(1.2)">{MARK}</g>'
        words, _ = wordmark(bold, cx - wwidth / 2, 200, size, white)
        tag = tagline(regular, cx, 248, 22, white, 34)
        write(f"wonderstar-stacked{'-white' if white else ''}.svg", svg(width, 290, f"{mark}\n  {words}\n  {tag}", white, "WonderWorks — Discover opportunities. Unlock possibilities."))


if __name__ == "__main__":
    main()
