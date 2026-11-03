import { NextResponse } from "next/server";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { json, readJson } from "@/server/jobslake/http";
import { deleteListing, moderationQueue, setListingAction, setThreshold } from "@/server/moderation";
import { isModuleId } from "@/modules/registry";

export const runtime = "nodejs";

/** Admin → Moderation: every reported or acted-on listing (report counts and reasons, never who), and the threshold. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json(await moderationQueue());
}

/** Hide, ban, restore or delete a listing, or set the report threshold. Platform admins only; audited. */
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const b = (await readJson(req)) as { action?: unknown; module?: unknown; id?: unknown; reason?: unknown; title?: unknown; threshold?: unknown } | null;
  const action = typeof b?.action === "string" ? b.action : "";
  if (action === "threshold") return json({ threshold: await setThreshold(a.actor, Number(b?.threshold)) });
  const mod = typeof b?.module === "string" ? b.module : "";
  const id = typeof b?.id === "string" ? b.id.slice(0, 200) : "";
  const reason = typeof b?.reason === "string" ? b.reason : "";
  const title = typeof b?.title === "string" ? b.title : undefined;
  if (!isModuleId(mod) || !id) return jlError("INVALID_REQUEST", "Name the module and the listing.", 400);
  if (action === "ban" && !reason.trim()) return jlError("INVALID_REQUEST", "A ban needs its reason (e.g. the authority's notice).", 400);
  if (action === "hide" || action === "ban" || action === "restore") return json({ entry: await setListingAction(a.actor, mod, id, action === "hide" ? "hidden" : action === "ban" ? "banned" : "restored", reason, title) });
  if (action === "delete") {
    try {
      return json(await deleteListing({ admin: a.actor }, mod, id, reason));
    } catch (e) {
      return jlError("INVALID_REQUEST", (e as Error).message, (e as { status?: number }).status ?? 400);
    }
  }
  return jlError("INVALID_REQUEST", "Unknown action.", 400);
}
