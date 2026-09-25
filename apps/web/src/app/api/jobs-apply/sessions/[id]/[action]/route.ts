import { NextResponse } from "next/server";
import { fail, parse, send, webTenant } from "@/server/jobsApply/http";
import { ConfirmSchema, DomainSchema, ModeSchema } from "@/server/jobsApply/schemas";
import { act, WEB_ACTIONS, type WebAction } from "@/server/jobsApply/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; action: string }> };

/**
 * POST /api/jobs-apply/sessions/:id/{start|stop|pause|resume|cancel|mode|approve-domain|confirm|tracked|token}
 * Candidate actions (cookie session). There is no "submit" action: the candidate submits on the
 * employer's site, and `confirm` records their answer to "Did you submit the application?".
 */
export async function POST(req: Request, ctx: Ctx) {
  const t = await webTenant(req, true);
  if (t instanceof NextResponse) return t;
  const { id, action } = await ctx.params;
  if (!(WEB_ACTIONS as string[]).includes(action)) return fail(404, "NOT_FOUND", "Unknown action.");
  let body: Record<string, unknown> = {};
  if (action === "confirm" || action === "mode" || action === "approve-domain") {
    const parsed = await parse(req, action === "confirm" ? ConfirmSchema : action === "mode" ? ModeSchema : DomainSchema, 10_000);
    if (parsed instanceof NextResponse) return parsed;
    body = parsed;
  }
  try {
    return send(await act(t, id, action as WebAction, body));
  } catch (e) {
    return fail(503, "UNAVAILABLE", e instanceof Error ? e.message : "Couldn't save the session.");
  }
}
