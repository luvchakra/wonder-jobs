import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { json } from "@/server/jobslake/http";
import { runRatings } from "@/server/jobslake/ratingsJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs the ratings job for up to ~40 seconds and answers with what it did. `status: "more"` means companies are
 * still waiting and keys are left: the page calls again. Keys that ran out are deleted as they do (audited).
 */
export async function POST() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const report = await runRatings({ onRetire: (k) => audit(a.actor, "ratings.key_retired", undefined, { masked: k.masked, label: k.label, reason: k.reason }) });
  if (report.checked || report.retired.length) await audit(a.actor, "ratings.run", undefined, { checked: report.checked, rated: report.rated, notFound: report.notFound, retired: report.retired.length, left: report.left, status: report.status });
  return json(report);
}
