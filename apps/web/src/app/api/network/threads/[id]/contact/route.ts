import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { shareThreadContact, stopThreadContact, threadContact } from "@/server/network/contact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** What the caller sees of the contact exchange with this connection: theirs masked until both have shared. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, async (s) => ({ contact: await threadContact(s, id) }));
}

const Offer = z.object({ phone: z.string().max(40).optional(), email: z.string().max(254).optional(), confirmed: z.boolean().optional() });

/** Share (or change) the caller's own phone and/or email with this connection (network.share_contact, audited). */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, async (s, b) => ({ contact: await shareThreadContact(s, id, { phone: b.phone, email: b.email }, b.confirmed) }), { schema: Offer, write: true });
}

/** Stop sharing: the connection no longer sees the caller's details. */
export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, (s) => stopThreadContact(s, id), { write: true });
}
