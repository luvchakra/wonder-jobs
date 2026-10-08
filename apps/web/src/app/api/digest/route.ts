import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { readDigestState, setDigestEnabled } from "@/server/digest/send";

export const runtime = "nodejs";

const view = (s: Awaited<ReturnType<typeof readDigestState>>) => ({ enabled: s.enabled, lastSentAt: s.lastSentAt ?? null, last: s.log.at(-1) ?? null });

/** The candidate's own activity-digest setting and its last attempt. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  return NextResponse.json(view(await readDigestState(session.tenantId)), { headers: { "cache-control": "no-store" } });
}

const Body = z.object({ enabled: z.boolean() });

export async function PUT(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Expected { enabled: boolean }." }, { status: 400 });
  return NextResponse.json(view(await setDigestEnabled(session.tenantId, parsed.data.enabled)), { headers: { "cache-control": "no-store" } });
}
