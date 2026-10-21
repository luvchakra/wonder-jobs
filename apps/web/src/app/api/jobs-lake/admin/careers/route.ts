import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/server/jobslake/access";
import { badJson, json, readJson } from "@/server/jobslake/http";
import { jlError } from "@/server/jobslake/access";
import { careersKeyStatus, clearCareersKey, CareersKeyError, saveCareersKey } from "@/server/careerSite/key";
import { clearCareersCache, testCareersConnection } from "@/server/careerSite/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The career-site key behind WonderJobs' own /careers page. Admins only. A read returns only the mask and where
 * the key comes from; the key itself is never sent back. Saves and clears are audited (last four characters).
 */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json({ key: await careersKeyStatus() });
}

const Save = z.object({ key: z.string().max(400) });

export async function PUT(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const parsed = Save.safeParse(await readJson(req));
  if (!parsed.success) return badJson();
  try {
    const key = await saveCareersKey(a.actor, parsed.data.key);
    clearCareersCache();
    return json({ key });
  } catch (e) {
    if (e instanceof CareersKeyError) return jlError("INVALID_REQUEST", e.message, 400);
    throw e;
  }
}

export async function DELETE() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  await clearCareersKey(a.actor);
  clearCareersCache();
  return json({ key: await careersKeyStatus() });
}

/** Test connection: Connected (with the job count), Wrong key (401) or Unavailable. */
export async function POST() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json({ check: await testCareersConnection() });
}
