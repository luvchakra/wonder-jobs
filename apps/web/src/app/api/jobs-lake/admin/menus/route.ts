import { NextResponse } from "next/server";
import { MENUS, MENU_IDS, defaultMenu, isMenuId } from "@/domain/navigation/menus";
import { jlError, requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { badJson, json, readJson } from "@/server/jobslake/http";
import { loadMenus, saveMenu } from "@/server/navigation/menus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every menu users see that an admin arranges: its items, the order and what's hidden. Platform admins only. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const saved = await loadMenus();
  return json({ menus: MENU_IDS.map((id) => ({ id, ...MENUS[id], config: saved[id], defaults: defaultMenu(id) })) });
}

/** Save one menu's order and hidden items (cleaned: its known items only; an always-shown item is never hidden). */
export async function PUT(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = (await readJson(req)) as { menu?: unknown } | null;
  if (!body) return badJson();
  if (!isMenuId(body.menu)) return jlError("INVALID_REQUEST", "Unknown menu.", 400);
  const config = await saveMenu(body.menu, body, a.actor);
  await audit(a.actor, "menu.update", undefined, { menu: body.menu, order: config.order, hidden: config.hidden });
  return json({ config });
}
