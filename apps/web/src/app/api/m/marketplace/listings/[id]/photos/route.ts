import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { HiringError } from "@/server/hiring";
import { rateLimit } from "@/server/rateLimit";
import { addPhoto } from "@/server/marketplace/photos";
import { MAX_PHOTO_BYTES } from "@/modules/marketplace/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Add a photo to the caller's own listing (multipart "file"): type sniffed from the bytes, metadata stripped, stored encrypted. */
export async function POST(req: Request, ctx: Ctx) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  if (!rateLimit(`marketplace-photo:${s.tenantId}`, { capacity: 20, refillPerSec: 0.2 }).ok) return NextResponse.json({ error: "Too many photos at once — wait a moment." }, { status: 429 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES + 64 * 1024) return NextResponse.json({ error: "Photos can be up to 5 MB each." }, { status: 413 });
  const { id } = await ctx.params;
  try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a photo." }, { status: 400 });
    return NextResponse.json(await addPhoto(s, id, Buffer.from(await file.arrayBuffer()), file.type), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof HiringError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[marketplace photo]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
