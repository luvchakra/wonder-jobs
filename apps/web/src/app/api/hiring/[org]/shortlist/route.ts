import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { addToShortlist, listShortlist, removeFromShortlist, updateShortlist } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, async (s) => ({ entries: await listShortlist(s, org) }));
}

export async function POST(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const Body = z.object({ candidate: z.string().min(1).max(120), note: z.string().max(2000).default(""), jobId: z.string().max(80).optional() });
  return hiringRoute(req, (s, b) => addToShortlist(s, org, b.candidate, b.note, b.jobId), { schema: Body, write: true });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const Body = z.object({ id: z.string().min(1).max(80), note: z.string().max(2000).optional(), status: z.enum(["shortlisted", "reported", "interview", "passed"]).optional() });
  return hiringRoute(req, (s, b) => updateShortlist(s, org, b.id, { note: b.note, status: b.status }), { schema: Body, write: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  return hiringRoute(req, (s) => removeFromShortlist(s, org, id), { write: true });
}
