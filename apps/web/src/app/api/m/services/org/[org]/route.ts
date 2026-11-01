import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { orgServices, saveService, setServiceStatus } from "@/server/services/listings";
import { orgRequests } from "@/server/services/requests";
import { membershipOf } from "@/server/hiring";
import { can } from "@/domain/org/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string }> };

const Posting = z.object({
  title: z.string().max(160),
  description: z.string().max(8000),
  lane: z.enum(["local", "remote"]),
  category: z.string().max(40),
  location: z.string().max(160),
  areas: z.array(z.string().max(40)).max(20).optional(),
  priceKind: z.enum(["visit", "fixed", "hourly", "quote"]),
  priceMin: z.number().int().min(0).max(10_000_000).optional(),
  priceMax: z.number().int().min(0).max(10_000_000).optional(),
  currency: z.string().length(3).optional(),
  visitCharge: z.number().int().min(0).max(100_000).optional(),
  materials: z.enum(["included", "extra"]).optional(),
  warrantyDays: z.number().int().min(1).max(3650).optional(),
  turnaroundDays: z.number().int().min(1).max(365).optional(),
  skills: z.array(z.string().max(40)).max(10).optional(),
  gstin: z.string().max(20).optional(),
});

/** The workspace's service listings, its quote requests when the caller's role may view them, and that role. */
export async function GET(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, async (s) => {
    const listings = await orgServices(s, org);
    const role = (await membershipOf(s, org))?.role;
    return { listings, requests: can(role, "applications.view") ? await orgRequests(s, org) : [], role };
  });
}

/** Post a listing (a draft until opened). */
export async function POST(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, (s, b) => saveService(s, org, b), { schema: Posting, write: true });
}

/** { id, status } opens, closes or returns it to draft; { id, posting } edits it. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const Body = z.object({ id: z.string().min(1).max(80), status: z.enum(["draft", "open", "closed"]).optional(), posting: Posting.optional() });
  return hiringRoute(req, async (s, b) => (b.posting ? saveService(s, org, b.posting, b.id) : b.status ? setServiceStatus(s, org, b.id, b.status) : { ok: false }), { schema: Body, write: true });
}
