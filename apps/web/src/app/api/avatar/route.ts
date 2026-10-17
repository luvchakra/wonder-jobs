import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { photoType } from "@/server/avatar";
import { stateStore } from "@/server/state";

export const runtime = "nodejs";

/** The candidate's own profile photo. Small, already square (the browser crops and shrinks it first). */
const MAX_BYTES = 300_000;
const STORE = "wj.avatar";

type Photo = { data: string; type: string; updatedAt: string };

/** GET — the signed-in candidate's photo (tenant = the session's own user), or 404 when there is none. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const doc = await stateStore.get(session.tenantId, STORE).catch(() => undefined);
  const photo = doc?.state as Photo | undefined;
  if (!photo?.data || !photo.type) return new NextResponse(null, { status: 404, headers: { "cache-control": "private, no-store" } });
  return new NextResponse(new Uint8Array(Buffer.from(photo.data, "base64")), {
    headers: { "content-type": photo.type, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" },
  });
}

/** PUT — the image's raw bytes as the body. Replaces the candidate's photo. */
export async function PUT(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const bytes = new Uint8Array(await req.arrayBuffer().catch(() => new ArrayBuffer(0)));
  if (!bytes.length || bytes.length > MAX_BYTES) return NextResponse.json({ error: `A photo up to ${Math.round(MAX_BYTES / 1000)} KB.` }, { status: 400 });
  const type = photoType(bytes);
  if (!type) return NextResponse.json({ error: "A JPEG, PNG or WebP image." }, { status: 400 });
  const photo: Photo = { data: Buffer.from(bytes).toString("base64"), type, updatedAt: new Date().toISOString() };
  await stateStore.put(session.tenantId, STORE, photo);
  return NextResponse.json({ ok: true, updatedAt: photo.updatedAt });
}

/** DELETE — removes the candidate's photo; their initials show again. */
export async function DELETE() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  await stateStore.remove(session.tenantId, STORE);
  return NextResponse.json({ ok: true });
}
