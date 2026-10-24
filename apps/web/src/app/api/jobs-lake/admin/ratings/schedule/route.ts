import { NextResponse } from "next/server";
import { RATINGS_FREQUENCIES } from "@/domain/scheduler/settings";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { badJson, json, readJson } from "@/server/jobslake/http";
import { loadScheduler, saveScheduler } from "@/server/scheduler/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Changes how often the ratings job runs by itself (or turns that off), and who's emailed when no key is left. */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req, 2_000)) as { enabled?: unknown; frequency?: unknown; notifyEmail?: unknown } | null;
  if (!body) return badJson();
  if (body.frequency !== undefined && !(typeof body.frequency === "string" && body.frequency in RATINGS_FREQUENCIES)) return jlError("INVALID_REQUEST", "That isn't a frequency the job offers.", 400);
  if (body.notifyEmail !== undefined && !(typeof body.notifyEmail === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.notifyEmail.trim()) && body.notifyEmail.length <= 200)) return jlError("INVALID_REQUEST", "That doesn't look like an email address.", 400);
  const before = await loadScheduler();
  const next = await saveScheduler({ ...before, ratings: { ...before.ratings, ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}), ...(body.frequency !== undefined ? { frequency: body.frequency } : {}), ...(body.notifyEmail !== undefined ? { notifyEmail: body.notifyEmail } : {}) } }, a.actor);
  await audit(a.actor, "ratings.schedule_changed", undefined, { from: { enabled: before.ratings.enabled, frequency: before.ratings.frequency }, to: { enabled: next.ratings.enabled, frequency: next.ratings.frequency } });
  return json({ schedule: next.ratings });
}
