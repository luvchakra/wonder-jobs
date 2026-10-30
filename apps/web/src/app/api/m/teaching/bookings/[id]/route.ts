import { after } from "next/server";
import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { cancelMyDemo, requestDemo } from "@/server/teaching/bookings";
import { recordServerAudit } from "@/server/audit";
import { demoKey } from "@/modules/teaching/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ action: z.enum(["request", "cancel"]), confirmed: z.boolean().optional() });

/**
 * The teacher requests one of the demo-class times a school offered (their own press, gated by teaching.book_demo on
 * the server, once per application), or cancels one. Audited under the request's idempotency key.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s, b) => {
      if (b.action === "cancel") {
        await cancelMyDemo(s, id);
        await recordServerAudit(s.tenantId, { actionId: `teaching-demo-cancel:${id}`, actionType: "teaching.book_demo", event: "DEMO_CANCELLED" });
        return { ok: true };
      }
      const out = await requestDemo(s, id, b.confirmed);
      if (!out.repeated) {
        await recordServerAudit(s.tenantId, { actionId: demoKey(out.booking.responseId, s.tenantId), actionType: "teaching.book_demo", event: "DEMO_REQUESTED", detail: out.booking.startsAt });
        after(out.notify);
      }
      return { booking: out.booking };
    },
    { schema: Body, write: true },
  );
}
