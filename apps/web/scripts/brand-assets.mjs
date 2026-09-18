#!/usr/bin/env node
/**
 * Turns the supplied WonderJobs logo (flat PNG on a near-white background) into the brand assets the
 * app actually needs: a transparent full lockup for light surfaces, a light-ink lockup for dark
 * surfaces, and the butterfly mark on its own. Re-run it if the source logo is ever replaced:
 *
 *   node scripts/brand-assets.mjs <path-to-source.png>
 *
 * The white background is removed by un-premultiplying each pixel against white, which keeps the
 * antialiased edges clean instead of leaving a white halo.
 */
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = process.argv[2];
if (!SRC) {
  console.error("usage: node scripts/brand-assets.mjs <source.png>");
  process.exit(1);
}
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "brand");

/** Light ink used for the wordmark on dark surfaces (the source's slate grey disappears there). */
const DARK_SURFACE_INK = [237, 239, 248];

async function load(src) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height, C: info.channels };
}

/** White-background removal + optional recolour of the neutral (grey) ink for dark surfaces. */
function toRgba({ data, W, H, C }, { recolourGrey = false, fromX = 0, taglineTop = Infinity } = {}) {
  const out = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const px = p % W;
    const py = (p / W) | 0;
    const i = p * C;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const d = 255 - Math.min(r, g, b);
    // Fully transparent for the paper, ramping to fully opaque once the pixel carries real ink.
    const a = d <= 8 ? 0 : Math.min(255, Math.round(((d - 8) * 255) / 60));
    const o = p * 4;
    if (a === 0) {
      out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
      continue;
    }
    // Un-premultiply against the white the artwork was flattened onto.
    const af = a / 255;
    let ur = Math.round((r - 255 * (1 - af)) / af);
    let ug = Math.round((g - 255 * (1 - af)) / af);
    let ub = Math.round((b - 255 * (1 - af)) / af);
    ur = Math.max(0, Math.min(255, ur));
    ug = Math.max(0, Math.min(255, ug));
    ub = Math.max(0, Math.min(255, ub));
    if (recolourGrey && px >= fromX) {
      // The tagline band is entirely neutral, so re-ink it wholesale — its slate sits close enough to
      // the saturation cut-off that classifying it pixel by pixel speckles the antialiased edges.
      // Within the wordmark itself, relative saturation cleanly separates the grey "onder" (~0.14)
      // from the purple "Jobs" (~0.69) and from the palest lilac in the wing tip (~0.30).
      const max = Math.max(ur, ug, ub), min = Math.min(ur, ug, ub);
      const saturation = max === 0 ? 0 : (max - min) / max;
      if (py >= taglineTop || saturation < 0.24) {
        [ur, ug, ub] = DARK_SURFACE_INK;
      }
    }
    out[o] = ur;
    out[o + 1] = ug;
    out[o + 2] = ub;
    out[o + 3] = a;
  }
  return out;
}

/** Tight bounding box of everything that isn't transparent. */
function bbox(rgba, W, H, x0 = 0, x1 = W - 1) {
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = x0; x <= x1; x++) {
      if (rgba[(y * W + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Top row of the tagline band: the last horizontal gap in the wordmark half of the artwork. */
function taglineTopRow(rgba, W, H, fromX) {
  const rows = [];
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = fromX; x < W; x++) if (rgba[(y * W + x) * 4 + 3] > 12) n++;
    rows.push(n);
  }
  const last = rows.length - 1 - [...rows].reverse().findIndex((n) => n > 0);
  for (let y = last; y > 0; y--) if (rows[y] === 0) return y + 1;
  return Infinity;
}

/** First column holding neutral (grey) ink — where the butterfly ends and the wordmark begins. */
function firstGreyColumn(rgba, W, H) {
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const o = (y * W + x) * 4;
      if (rgba[o + 3] < 180) continue;
      const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max - min < 24 && max < 200) return x;
    }
  }
  return -1;
}

const src = await load(SRC);
const { W, H } = src;
const light = toRgba(src);
const full = bbox(light, W, H);
const greyX = firstGreyColumn(light, W, H);
const markRight = greyX > 0 ? greyX - 6 : Math.round(W * 0.26);
const mark = bbox(light, W, H, 0, markRight);
// Only the wordmark is re-inked: the butterfly keeps its gradient on every surface.
const taglineTop = taglineTopRow(light, W, H, markRight);
const dark = toRgba(src, { recolourGrey: true, fromX: markRight, taglineTop });
console.log("tagline band starts at y:", taglineTop);
console.log("full lockup bbox:", full);
console.log("wordmark starts at x:", greyX, "→ mark bbox:", mark);

// Nav bars and footers need the lockup without the tagline; the landing hero and share images use the full one.
const noTagline = { ...full, height: Math.max(1, Math.min(full.height, taglineTop - 12 - full.top)) };
console.log("lockup without tagline:", noTagline);

const png = (buf, box) => sharp(buf, { raw: { width: W, height: H, channels: 4 } }).extract(box).png({ compressionLevel: 9 });
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
/** Assets are written at the size they are actually displayed at (times ~3 for high-density screens)
 *  so a 30px-tall nav logo doesn't ship a 350KB full-resolution PNG. */
const atHeight = (pipeline, height) => pipeline.resize({ height, fit: "inside", background: TRANSPARENT });

await atHeight(png(light, full), 240).toFile(path.join(OUT, "wonderjobs-lockup-light.png"));
await atHeight(png(dark, full), 240).toFile(path.join(OUT, "wonderjobs-lockup-dark.png"));
await atHeight(png(light, noTagline), 96).toFile(path.join(OUT, "wonderjobs-logo-light.png"));
await atHeight(png(dark, noTagline), 96).toFile(path.join(OUT, "wonderjobs-logo-dark.png"));
await atHeight(png(light, mark), 128).toFile(path.join(OUT, "wonder-mark.png"));
// Square, padded copy for the favicon / PWA icon routes, which composite it onto the brand gradient.
await png(light, mark).resize({ width: 512, height: 512, fit: "contain", background: TRANSPARENT }).toFile(path.join(OUT, "wonder-mark-square.png"));

const sizeOf = async (f) => { const m = await sharp(path.join(OUT, f)).metadata(); return `${f} ${m.width}x${m.height}`; };
for (const f of ["wonderjobs-lockup-light.png", "wonderjobs-lockup-dark.png", "wonderjobs-logo-light.png", "wonderjobs-logo-dark.png", "wonder-mark.png", "wonder-mark-square.png"]) console.log(" ", await sizeOf(f));
console.log("wrote brand assets to", OUT);
