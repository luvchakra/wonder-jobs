import { after } from "next/server";
import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { myRequests, requestQuote } from "@/server/services/requests";
import { recordServerAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  listingId: z.string().regex(/^lst_[a-z0-9]{8,40}$/),
  name: z.string().max(200),
  request: z.object({ details: z.string().max(2000), area: z.string().max(60).optional(), date: z.string().max(10).optional(), slot: z.string().max(12).optional(), budget: z.number().int().min(1).max(100_000_000).optional(), neededBy: z.string().max(10).optional() }),
  confirmed: z.boolean().optional(),
});

/** The client's own quote requests and bookings. */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ requests: await myRequests(s) }));
}

/** Request a quote from a pro who lists on WonderWorks: the client's own press (services.request_quote, checked on the server), audited. */
export async function POST(req: Request) {
  return hiringRoute(
    req,
    async (s, b) => {
      const out = await requestQuote(s, b);
      await recordServerAudit(s.tenantId, { actionId: `services-request:${out.id}`, actionType: "services.request_quote", event: "QUOTE_REQUESTED", detail: `${out.title} · ${out.pro}` });
      after(out.notify);
      return { id: out.id, title: out.title, pro: out.pro };
    },
    { schema: Body, write: true },
  );
}
