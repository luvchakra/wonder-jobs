import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { connection, markBuilding, pass, respond, sendMessage, shareContact } from "@/server/cofounders/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** One connection and its thread, for someone on it (anyone else gets a 404). */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, (s) => connection(s, id));
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), confirmed: z.boolean().optional() }),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("pass") }),
  z.object({ action: z.literal("build") }),
  z.object({ action: z.literal("share"), confirmed: z.boolean().optional() }),
  z.object({ action: z.literal("message"), text: z.string().max(2000), confirmed: z.boolean().optional() }),
]);

/** Accept, decline, pass, decide to build, share contact, or write: each gated on the server and audited. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(
    req,
    async (s, b) => {
      switch (b.action) {
        case "accept":
          return respond(s, id, "accept", b.confirmed);
        case "decline":
          return respond(s, id, "decline");
        case "pass":
          return (await pass(s, id), { ok: true });
        case "build":
          return markBuilding(s, id);
        case "share":
          return (await shareContact(s, id, b.confirmed), { ok: true });
        case "message":
          return { message: await sendMessage(s, id, b.text, b.confirmed) };
      }
    },
    { schema: Body, write: true },
  );
}
