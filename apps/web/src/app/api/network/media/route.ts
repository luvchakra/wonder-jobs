import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { HiringError } from "@/server/hiring";
import { rateLimit } from "@/server/rateLimit";
import { MAX_PHOTO_BYTES } from "@/server/modules/photo";
import { uploadMedia } from "@/server/network/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A photo for the post the caller is writing (multipart "file"): type read from its bytes, metadata stripped, stored encrypted. */
export async function POST(req: Request) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  if (!rateLimit(`network-media:${s.tenantId}`, { capacity: 12, refillPerSec: 0.2 }).ok) return NextResponse.json({ error: "Too many photos at once. Wait a moment." }, { status: 429 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES + 64 * 1024) return NextResponse.json({ error: "Photos can be up to 5 MB each." }, { status: 413 });
  try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a photo." }, { status: 400 });
    return NextResponse.json(await uploadMedia(s, Buffer.from(await file.arrayBuffer()), file.type), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof HiringError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[network media]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
