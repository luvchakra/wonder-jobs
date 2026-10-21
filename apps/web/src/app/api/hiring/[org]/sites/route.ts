import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { createSite, linkJob, listSites, revokeSite, updateSite } from "@/server/careers";

const Site = z.object({ name: z.string().max(80), slug: z.string().max(40).optional(), publicUrl: z.string().max(300), notifyEmails: z.string().max(500), retentionMonths: z.number().int() });

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
  return hiringRoute(req, (s, b) => createSite(s, org, b), { schema: Site, write: true });
}

/** { id, …settings } changes a site's name, address, applications email or retention; its key stays. */
export async function PUT(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, (s, b) => updateSite(s, org, b.id, b), { schema: Site.extend({ id: z.string().min(1).max(80) }), write: true });
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
