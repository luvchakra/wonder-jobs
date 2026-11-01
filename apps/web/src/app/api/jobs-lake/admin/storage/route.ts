import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { json, readJson } from "@/server/jobslake/http";
import { dbUsage, loadSafeguards, runSafeguards, saveSafeguards, SAFEGUARD_RANGES, type SafeguardSettings } from "@/server/jobslake/safeguards";

export const runtime = "nodejs";
export const maxDuration = 120;

/** The storage safeguards: their settings, the last run, and the database's size now (admin only). */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const [{ settings, lastRun }, usage] = await Promise.all([loadSafeguards(), dbUsage().catch(() => null)]);
  return json({ settings, ranges: SAFEGUARD_RANGES, lastRun, usage });
}

/** Saves settings (clamped to their ranges), or with { run: true } runs the pass now. Audited. */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = ((await readJson(req, 4_000)) ?? {}) as { run?: unknown; settings?: Partial<SafeguardSettings> };
  if (body.run === true) {
    const run = await runSafeguards();
    await audit(a.actor, "storage.safeguards_run", undefined, { opportunitiesDeleted: run.opportunitiesDeleted, gatewayDeleted: run.gatewayDeleted, error: run.error ?? null });
    return json({ run });
  }
  const settings = await saveSafeguards(body.settings ?? {});
  await audit(a.actor, "storage.safeguards_set", undefined, { ...settings });
  return json({ settings });
}
