import { NextResponse } from "next/server";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, verifyImage } from "@/server/imageProxy";
import { safeFetch } from "@/server/jobslake/safeFetch";

export const runtime = "nodejs";

const NONE = { "cache-control": "public, max-age=300" };

/**
 * GET /api/img?u=<https url>&s=<signature> — an outside image (a shop's product photo) served from our origin. Only URLs
 * the server signed (imageProxy.ts); only public addresses; only image types under 3 MB; cached at the CDN for a day.
 * Never an SVG (it can carry script).
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const url = q.get("u") ?? "";
  const s = q.get("s") ?? "";
  if (!url || !s || !verifyImage(url, s)) return new NextResponse(null, { status: 403, headers: NONE });
  try {
    const r = await safeFetch(url, { timeoutMs: 8_000, maxBytes: MAX_IMAGE_BYTES, headers: { accept: "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8" } });
    const type = r.contentType.split(";")[0].trim().toLowerCase();
    if (r.status !== 200 || !IMAGE_TYPES.has(type)) return new NextResponse(null, { status: 404, headers: NONE });
    return new NextResponse(new Uint8Array(r.bytes), {
      status: 200,
      headers: { "content-type": type, "cache-control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" },
    });
  } catch {
    return new NextResponse(null, { status: 404, headers: NONE });
  }
}
