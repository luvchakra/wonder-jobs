import { NextResponse } from "next/server";
import { withHelper } from "@/server/jobsApply/helperRoute";
import { parse, send } from "@/server/jobsApply/http";
import { EventsSchema } from "@/server/jobsApply/schemas";
import { helperEvents } from "@/server/jobsApply/service";

export const runtime = "nodejs";

/** POST { events } → what the helper observed or the candidate did in its panel: fill results, navigation, submit clicked, confirmation seen, stop. */
export async function POST(req: Request) {
  return withHelper(req, async (ctx) => {
    const body = await parse(req, EventsSchema, 60_000);
    if (body instanceof NextResponse) return body;
    return send(await helperEvents(ctx, body));
  });
}
