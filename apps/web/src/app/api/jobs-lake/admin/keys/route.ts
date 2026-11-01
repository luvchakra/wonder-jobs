import { NextResponse } from "next/server";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { json, readJson } from "@/server/jobslake/http";
import { platformKeyStatus, setPlatformKey } from "@/server/jobslake/platformKeys";

export const runtime = "nodejs";

/** The sources' API keys the admin sets on the platform: which are set and where from, masked — never a value. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json({ keys: await platformKeyStatus() });
}

/** Set, replace or remove one key. Audited by name only; the value is encrypted and never logged or returned. */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req, 10_000)) as { name?: unknown; value?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.slice(0, 64) : "";
  const value = body?.value === null ? null : typeof body?.value === "string" ? body.value : undefined;
  if (!name || value === undefined) return jlError("INVALID_REQUEST", "Name the key and give its value (or null to remove it).", 400);
  const r = await setPlatformKey(name, value);
  await audit(a.actor, value === null ? "platform_key.removed" : "platform_key.set", undefined, { name, ok: r.ok });
  return json(r.ok ? r : { ...r, error: { code: "INVALID_REQUEST", message: r.message } }, r.ok ? 200 : 400);
}
