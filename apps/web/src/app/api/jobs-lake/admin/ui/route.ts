import { NextResponse } from "next/server";
import { isUiVersion } from "@/domain/platform/ui";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { badJson, json, readJson } from "@/server/jobslake/http";
import { loadUi, saveUi } from "@/server/platform/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The platform's UI choice, with who set it. Platform admins only. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json({ ui: await loadUi() });
}

/** Switch every user to the first or the second UI. Only the look changes; audited. */
export async function PUT(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req)) as { version?: unknown } | null;
  if (!body) return badJson();
  if (!isUiVersion(body.version)) return jlError("INVALID_REQUEST", "The UI is 1 or 2.", 400);
  const ui = await saveUi({ version: body.version }, a.actor);
  await audit(a.actor, "ui.update", undefined, { version: ui.version });
  return json({ ui });
}
