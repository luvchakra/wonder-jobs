import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { HiringError } from "@/server/hiring";
import { renderInvoice } from "@/server/services/invoice";
import { clientInvoice } from "@/server/services/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** The client's invoice summary for their own booked or finished job, as a page that prints. */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  try {
    return new Response(renderInvoice(await clientInvoice(session, id), "client"), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex" } });
  } catch (e) {
    if (e instanceof HiringError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
