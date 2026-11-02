import { after, NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { json, readJson } from "@/server/jobslake/http";
import { jlError } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { setDecision } from "@/server/jobslake/decisions";
import { setupTodo } from "@/server/jobslake/setup";
import { continueSetupJob, handOnSetupJob, readSetupJob, startSetupJob } from "@/server/gateway/setupJob";
import { siteUrl } from "@/lib/siteUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every source, in every module and the gateway, that still needs a key, terms, adding or activating. Never a secret. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const [todo, job] = await Promise.all([setupTodo(), readSetupJob().catch(() => null)]);
  // A finished job's outcome is shown for a day after it ends.
  const recent = job && (!job.finishedAt || Date.now() - Date.parse(job.finishedAt) < 86_400_000) ? job : null;
  return json({ ...todo, job: recent });
}

/** Marks an owner decision done, or puts it back on the list. Audited. */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req, 40_000)) as { decision?: unknown; done?: unknown; note?: unknown; action?: unknown; ids?: unknown } | null;
  // "Test & activate all": the shown gateway items, run by a server job (server/gateway/setupJob.ts). Only items the
  // server itself lists as runnable are taken; the page sends their ids, never what to run.
  if (body?.action === "run_all") {
    const ids = new Set(Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 200) : []);
    const items = (await setupTodo()).items.filter((i) => i.run && ids.has(i.id)).map((i) => ({ id: i.id, name: i.name, run: i.run! }));
    const r = await startSetupJob(items, a.actor);
    if (!r.ok) return jlError("INVALID_REQUEST", r.message, 409);
    await audit(a.actor, "setup_job.started", undefined, { id: r.job.id, items: items.length });
    const origin = siteUrl().origin;
    after(async () => {
      const c = await continueSetupJob();
      if (c.left && c.ran) await handOnSetupJob(origin);
    });
    return json({ ok: true, job: r.job });
  }
  const id = typeof body?.decision === "string" ? body.decision.slice(0, 80) : "";
  const done = body?.done !== false;
  const note = typeof body?.note === "string" ? body.note : undefined;
  if (!id || !(await setDecision(id, done, a.actor, note))) return jlError("NOT_FOUND", "No such decision.", 404);
  await audit(a.actor, done ? "setup_decision.done" : "setup_decision.reopened", undefined, { id });
  return json({ ok: true });
}
