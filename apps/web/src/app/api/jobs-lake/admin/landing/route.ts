import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { badJson, json, readJson } from "@/server/jobslake/http";
import { loadLandingChoice, saveLandingChoice } from "@/server/marketing/landing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which landing page / shows: quiet (the default) or full (the backup). Platform admins only. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json({ page: await loadLandingChoice() });
}

/** Switch the landing page; / is regenerated at once. */
export async function PUT(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req)) as { page?: unknown } | null;
  if (!body) return badJson();
  if (body.page !== "quiet" && body.page !== "full") return jlError("INVALID_REQUEST", "Choose quiet or full.", 400);
  const page = await saveLandingChoice(body.page, a.actor);
  await audit(a.actor, "landing.update", undefined, { page });
  revalidatePath("/");
  return json({ page });
}
