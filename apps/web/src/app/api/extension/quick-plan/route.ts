import { NextResponse } from "next/server";
import { FormSchema } from "@/server/jobsApply/schemas";
import { quickPlan } from "@/server/jobsApply/quickFill";
import { tenantFromAuthHeader } from "@/server/extensionToken";
import { rateLimit } from "@/server/rateLimit";
import { getSupabaseAdmin } from "@/server/supabase";

export const runtime = "nodejs";

async function accountEmail(tenantId: string): Promise<string | undefined> {
  const sb = getSupabaseAdmin();
  if (!sb) return undefined;
  const { data } = await sb.auth.admin.getUserById(tenantId);
  return data?.user?.email ?? undefined;
}

/**
 * POST /api/extension/quick-plan — bearer token from `/api/extension/token`.
 *
 * The helper's Fill on a page with no WonderJobs application: it sends the form's *structure* (the same
 * strict schema as a JobsApply session — no values, cookies or tokens) and gets back what the
 * candidate's own data fills, and what's left for them.
 */
export async function POST(req: Request) {
  const tenantId = tenantFromAuthHeader(req.headers.get("authorization"));
  if (!tenantId) return NextResponse.json({ error: "Connect the extension to WonderJobs again." }, { status: 401, headers: { "cache-control": "no-store" } });
  const rl = rateLimit(`ext-quick:${tenantId}`, { capacity: 20, refillPerSec: 0.2 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const parsed = FormSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That doesn't look like a form." }, { status: 400 });
  const plan = await quickPlan(tenantId, parsed.data, { accountEmail: await accountEmail(tenantId) });
  return NextResponse.json(plan, { headers: { "cache-control": "no-store" } });
}
