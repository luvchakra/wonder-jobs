import { NextResponse } from "next/server";
import { fail, parse, send, webTenant } from "@/server/jobsApply/http";
import { CreateSchema } from "@/server/jobsApply/schemas";
import { create, list } from "@/server/jobsApply/service";

export const runtime = "nodejs";

/** GET → the candidate's JobsApply sessions (dashboard, §95). */
export async function GET(req: Request) {
  const t = await webTenant(req, false);
  if (t instanceof NextResponse) return t;
  return send(await list(t));
}

/** POST → create (or continue) a session for one job, with the Application Pack snapshot (§6, §71, §107). */
export async function POST(req: Request) {
  const t = await webTenant(req, true);
  if (t instanceof NextResponse) return t;
  const body = await parse(req, CreateSchema);
  if (body instanceof NextResponse) return body;
  try {
    return send(await create(t, body));
  } catch (e) {
    return fail(503, "UNAVAILABLE", e instanceof Error ? e.message : "Couldn't save the session.");
  }
}
