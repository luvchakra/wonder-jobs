import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { json, readJson } from "@/server/jobslake/http";
import { jlError } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { setDecision } from "@/server/jobslake/decisions";
import { setupTodo } from "@/server/jobslake/setup";

export const runtime = "nodejs";

/** Every source, in every module and the gateway, that still needs a key, terms, adding or activating. Never a secret. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json(await setupTodo());
}

/** Marks an owner decision done, or puts it back on the list. Audited. */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req, 4_000)) as { decision?: unknown; done?: unknown; note?: unknown } | null;
  const id = typeof body?.decision === "string" ? body.decision.slice(0, 80) : "";
  const done = body?.done !== false;
  const note = typeof body?.note === "string" ? body.note : undefined;
  if (!id || !(await setDecision(id, done, a.actor, note))) return jlError("NOT_FOUND", "No such decision.", 404);
  await audit(a.actor, done ? "setup_decision.done" : "setup_decision.reopened", undefined, { id });
  return json({ ok: true });
}
