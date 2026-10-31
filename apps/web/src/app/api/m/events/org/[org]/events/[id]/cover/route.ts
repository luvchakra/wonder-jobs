import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { HiringError } from "@/server/hiring";
import { rateLimit } from "@/server/rateLimit";
import { removeCover, setCover } from "@/server/events/covers";
import { COVER_MAX_BYTES } from "@/modules/events/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string; id: string }> };

/** Set the event's cover (multipart "file"; jobs.edit, checked on the server): type read from the bytes, metadata stripped, stored encrypted. */
export async function POST(req: Request, ctx: Ctx) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  if (!rateLimit(`events-cover:${s.tenantId}`, { capacity: 10, refillPerSec: 0.1 }).ok) return NextResponse.json({ error: "Too many photos at once — wait a moment." }, { status: 429 });
  if (Number(req.headers.get("content-length") ?? 0) > COVER_MAX_BYTES + 64 * 1024) return NextResponse.json({ error: "The cover can be up to 5 MB." }, { status: 413 });
  const { org, id } = await ctx.params;
  try {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a photo." }, { status: 400 });
    return NextResponse.json(await setCover(s, org, id, Buffer.from(await file.arrayBuffer()), file.type), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof HiringError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[events cover]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}

/** Take the cover off the event (jobs.edit). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const { org, id } = await ctx.params;
  try {
    await removeCover(s, org, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof HiringError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
