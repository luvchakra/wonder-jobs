import { NextResponse } from "next/server";
import { ACCOUNT_MENU_ITEMS, ALWAYS_SHOWN, DEFAULT_ACCOUNT_MENU } from "@/domain/navigation/accountMenu";
import { requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { badJson, json, readJson } from "@/server/jobslake/http";
import { loadAccountMenu, saveAccountMenu } from "@/server/navigation/accountMenu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The account menu every user sees: its items, the order and what's hidden. Platform admins only. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json({ menu: await loadAccountMenu(), items: ACCOUNT_MENU_ITEMS, alwaysShown: ALWAYS_SHOWN, defaults: DEFAULT_ACCOUNT_MENU });
}

/** Save the order and hidden items (cleaned: known items only; Account is never hidden). */
export async function PUT(req: Request) {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const body = await readJson(req);
  if (!body) return badJson();
  const menu = await saveAccountMenu(body, a.actor);
  await audit(a.actor, "account_menu.update", undefined, { order: menu.order, hidden: menu.hidden });
  return json({ menu });
}
