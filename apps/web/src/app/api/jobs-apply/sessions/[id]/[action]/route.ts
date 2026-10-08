import { NextResponse } from "next/server";
import { fail, parse, send, webTenant } from "@/server/jobsApply/http";
import { ConfirmSchema, DomainSchema, ModeSchema, SubmitSettingSchema } from "@/server/jobsApply/schemas";
import { endCloud } from "@/server/jobsApply/cloud";
import { act, WEB_ACTIONS, type WebAction } from "@/server/jobsApply/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; action: string }> };

/**
 * POST /api/jobs-apply/sessions/:id/{start|stop|pause|resume|cancel|mode|submit|approve-domain|confirm|tracked|token}
 * Candidate actions (cookie session). `submit` sets this application's "Submit for me" choice (WJ-248) — it
 * submits nothing itself: only the helper, on the employer's own page, presses Submit under that setting.
 * `confirm` records the candidate's answer to "Did you submit the application?".
 */
export async function POST(req: Request, ctx: Ctx) {
  const t = await webTenant(req, true);
  if (t instanceof NextResponse) return t;
  const { id, action } = await ctx.params;
  if (!(WEB_ACTIONS as string[]).includes(action)) return fail(404, "NOT_FOUND", "Unknown action.");
  let body: Record<string, unknown> = {};
  if (action === "confirm" || action === "mode" || action === "approve-domain" || action === "submit") {
    const parsed = await parse(req, action === "confirm" ? ConfirmSchema : action === "mode" ? ModeSchema : action === "submit" ? SubmitSettingSchema : DomainSchema, 10_000);
    if (parsed instanceof NextResponse) return parsed;
    body = parsed;
  }
  try {
    const out = await act(t, id, action as WebAction, body);
    // Cancelled, confirmed or tracked: the cloud browser (if any) closes with it. Stop keeps it open for "Continue".
    if (out.status === 200 && (action === "cancel" || action === "confirm" || action === "tracked")) await endCloud(t, id, action).catch(() => undefined);
    return send(out);
  } catch (e) {
    return fail(503, "UNAVAILABLE", e instanceof Error ? e.message : "Couldn't save the session.");
  }
}
