import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { json } from "@/server/jobslake/http";
import { setupTodo } from "@/server/jobslake/setup";

export const runtime = "nodejs";

/** Every source, in every module and the gateway, that still needs a key, terms, adding or activating. Never a secret. */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  return json(await setupTodo());
}
