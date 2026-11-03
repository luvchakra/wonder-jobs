import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { isReportReason, reportListing } from "@/server/moderation";
import { isModuleId } from "@/modules/registry";

export const runtime = "nodejs";

const Body = z.object({ module: z.string().max(40), id: z.string().min(1).max(200), reason: z.string().max(20), note: z.string().max(500).default(""), title: z.string().max(200).optional() });

/**
 * Report a listing (any module, any listing). Written under the reporter's own tenant; one report per person and
 * listing. Once enough different people report it (Admin → Moderation's threshold), it's hidden from everyone's Find.
 */
export async function POST(req: Request) {
  const s = await requireSession();
  if (s instanceof NextResponse) return s;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success || !isModuleId(p.data.module) || !isReportReason(p.data.reason)) return NextResponse.json({ error: "Pick a reason and try again." }, { status: 400 });
  const r = await reportListing(s.tenantId, p.data.module, p.data.id, p.data.reason, p.data.note, p.data.title);
  return NextResponse.json({ ok: true, repeated: r.repeated }, { headers: { "cache-control": "no-store" } });
}
