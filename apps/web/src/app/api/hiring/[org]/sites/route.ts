import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { createSite, linkJob, listSites, revokeSite } from "@/server/careers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, (s) => listSites(s, org));
}

/** Creates a career site; the answer carries its key, shown this once. */
export async function POST(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const Body = z.object({ name: z.string().max(80), publicUrl: z.string().max(300) });
  return hiringRoute(req, (s, b) => createSite(s, org, b), { schema: Body, write: true });
}

/** { siteId, jobId, on } shows a job on a career site or takes it off. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const Body = z.object({ siteId: z.string().min(1).max(80), jobId: z.string().min(1).max(80), on: z.boolean() });
  return hiringRoute(req, (s, b) => linkJob(s, org, b.siteId, b.jobId, b.on), { schema: Body, write: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const site = new URL(req.url).searchParams.get("id") ?? "";
  return hiringRoute(req, (s) => revokeSite(s, org, site), { write: true });
}
