import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/server/jobslake/access";
import { HiringError, listCompaniesForAdmin, setCompanyVerified } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Platform admins only (JOBSLAKE_ADMIN_EMAILS): every hiring workspace, unverified first. */
export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json({ companies: await listCompaniesForAdmin() }, { headers: { "cache-control": "no-store" } });
}

/** { id, verified } verifies or unverifies a company; on verify its Owners get an email. */
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const parsed = z.object({ id: z.string().min(1).max(80), verified: z.boolean() }).safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Check the details and try again." }, { status: 400 });
  try {
    const r = await setCompanyVerified(parsed.data.id, parsed.data.verified);
    console.info("[admin] company verification", { by: admin.actor, id: parsed.data.id, verified: parsed.data.verified });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof HiringError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
