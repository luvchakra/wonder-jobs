import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { json, readJson } from "@/server/jobslake/http";
import { recordRatingSlice } from "@/server/jobslake/ratingRuns";
import { runRatings } from "@/server/jobslake/ratingsJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs the ratings job for up to ~40 seconds and answers with what it did. `status: "more"` means companies are
 * still waiting and keys are left: the page calls again. Keys that ran out are deleted as they do (audited).
 */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  // The page sends back the id it was given, so every slice of one click is one entry in the history.
  const body = (await readJson(req, 500).catch(() => null)) as { runId?: unknown } | null;
  const runId = typeof body?.runId === "string" && /^rr_[a-f0-9]{12}$/.test(body.runId) ? body.runId : undefined;
  const report = await runRatings({ onRetire: (k) => audit(a.actor, "ratings.key_retired", undefined, { masked: k.masked, label: k.label, reason: k.reason }) });
  if (report.checked || report.retired.length) await audit(a.actor, "ratings.run", undefined, { checked: report.checked, rated: report.rated, notFound: report.notFound, retired: report.retired.length, left: report.left, status: report.status });
  // Nothing to look up and nothing to retire is not worth a line in the history.
  const run = report.checked || report.retired.length || runId ? await recordRatingSlice({ id: runId, trigger: "manual", actor: a.actor, report }) : undefined;
  return json({ ...report, ...(run ? { runId: run.id } : {}) });
}
