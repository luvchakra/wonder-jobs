import { NextResponse } from "next/server";
import { fail, send, webTenant } from "@/server/jobsApply/http";
import { endCloud, startCloud } from "@/server/jobsApply/cloud";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/** POST → open (or rejoin) the cloud browser for this session: a stream address and a token for this candidate only. */
export async function POST(req: Request, ctx: Ctx) {
  const t = await webTenant(req, true);
  if (t instanceof NextResponse) return t;
  const { id } = await ctx.params;
  try {
    return send(await startCloud(t, id));
  } catch (e) {
    return fail(503, "UNAVAILABLE", e instanceof Error ? e.message : "Couldn't open the cloud browser.");
  }
}

/** DELETE → close it. The browser context and everything in it is discarded. */
export async function DELETE(req: Request, ctx: Ctx) {
  const t = await webTenant(req, true);
  if (t instanceof NextResponse) return t;
  const { id } = await ctx.params;
  try {
    return send(await endCloud(t, id, "closed_by_candidate"));
  } catch (e) {
    return fail(503, "UNAVAILABLE", e instanceof Error ? e.message : "Couldn't close the cloud browser.");
  }
}
