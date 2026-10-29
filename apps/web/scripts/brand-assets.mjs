#!/usr/bin/env node
/**
 * Rasterises the WonderWorks SVGs in `public/brand/` (built by `scripts/brand-svg.py`) into the PNGs that
 * can't be vectors:
 *
 *   - `wonderstar-logo.png` — the horizontal logo for emails (most mail clients don't render SVG).
 *   - `wonderstar-mark-square.png` — the mark, 512×512 transparent, which every icon route composites
 *     (favicon, Apple icon, PWA 192/512/maskable — `server/brandMark.ts`).
 *
 *   node scripts/brand-assets.mjs
 */
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "brand");
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const svg = (name) => sharp(path.join(OUT, name), { density: 400 });

await svg("wonderstar-logo.svg").resize({ height: 96 }).png({ compressionLevel: 9 }).toFile(path.join(OUT, "wonderstar-logo.png"));
await svg("wonderstar-mark.svg").resize({ width: 512, height: 512, fit: "contain", background: TRANSPARENT }).png({ compressionLevel: 9 }).toFile(path.join(OUT, "wonderstar-mark-square.png"));
