import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { block, report } from "@/server/cofounders/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("block"), kind: z.enum(["person", "team"]), id: z.string().max(60) }),
  z.object({ action: z.literal("report"), kind: z.enum(["person", "team", "message"]), id: z.string().max(60), reason: z.string().max(500) }),
]);

/** Block a person or a team (never announced), or report one or a message for review. */
export async function POST(req: Request) {
  return hiringRoute(
    req,
    async (s, b) => {
      if (b.action === "block") await block(s, b.kind, b.id);
      else await report(s, b.kind, b.id, b.reason);
      return { ok: true };
    },
    { schema: Body, write: true },
  );
}
