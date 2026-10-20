import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { conversationMessages, sendMessage, setConversationStatus } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** The thread, for its candidate or a member of its company whose role may read it. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const as = new URL(req.url).searchParams.get("as") === "org" ? "org" : "candidate";
  return hiringRoute(req, (s) => conversationMessages(s, id, as));
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const as = new URL(req.url).searchParams.get("as") === "org" ? "org" : "candidate";
  return hiringRoute(req, (s, b) => sendMessage(s, id, b.body, as), { schema: z.object({ body: z.string().min(1).max(4000) }), write: true });
}

/** The candidate declines, blocks or reopens. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return hiringRoute(req, (s, b) => setConversationStatus(s, id, b.status), { schema: z.object({ status: z.enum(["open", "declined", "blocked"]) }), write: true });
}
