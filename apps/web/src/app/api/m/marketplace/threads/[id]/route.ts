import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { answerOffer, arrangeVisit, closeThread, makeOffer, markDone, sendMessage, shareContact, thread, withdrawOffer } from "@/server/marketplace/threads";
import { blockInThread, reportThread } from "@/server/marketplace/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("message"), text: z.string().max(1000), confirmed: z.boolean().optional() }),
  z.object({ action: z.literal("offer"), amount: z.number().int().min(1).max(100_000_000), confirmed: z.boolean().optional() }),
  z.object({ action: z.literal("withdraw") }),
  z.object({ action: z.enum(["accept", "decline"]), confirmed: z.boolean().optional() }),
  z.object({ action: z.literal("visit") }),
  z.object({ action: z.literal("done") }),
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("share"), confirmed: z.boolean().optional() }),
  z.object({ action: z.literal("report"), reason: z.string().max(500), messageId: z.string().max(60).optional() }),
  z.object({ action: z.literal("block") }),
]);

/** One conversation and its messages, for someone on it. Anyone else gets a 404. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, (s) => thread(s, id));
}

/** Every step in a conversation: each checks who may do it, and the gated ones follow the person's own setting. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s, b) => {
      switch (b.action) {
        case "message":
          return sendMessage(s, id, b.text, b.confirmed);
        case "offer":
          return makeOffer(s, id, b.amount, b.confirmed);
        case "withdraw":
          return withdrawOffer(s, id);
        case "accept":
        case "decline":
          return answerOffer(s, id, b.action, b.confirmed);
        case "visit":
          return arrangeVisit(s, id);
        case "done":
          return markDone(s, id);
        case "close":
          return closeThread(s, id);
        case "share":
          return shareContact(s, id, b.confirmed);
        case "report":
          return reportThread(s, id, b.reason, b.messageId);
        case "block":
          return blockInThread(s, id);
      }
    },
    { schema: Body, write: true },
  );
}
